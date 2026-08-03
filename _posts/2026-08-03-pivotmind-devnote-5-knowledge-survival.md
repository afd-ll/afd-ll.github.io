---
layout: post
title: "Woke Up and PivotMind Forgot Who It Was: The Knowledge Survival War"
date: 2026-08-03
categories: [dev-notes]
description: "PivotMind dev note #5 — the Building-from-Zero series: memory and knowledge survival. Four deletion paths that each seemed 'reasonable' but cascaded into wiping 30k nodes: RED misjudgment, freeze-counter accumulation, edge-restore failure, and a fake-freeze ghost"
---

*PivotMind (玄枢) Dev Note #5 — the "Building PivotMind from Zero" series: memory and knowledge survival.*

Let me start with a horror story.

One morning I checked PivotMind's state as usual — **vocab had dropped from 30,000 to 128**, and the state file had shrunk from 114MB to 5.6MB. Overnight, PivotMind had forgotten almost every character it had learned. Not a dead hard drive, not a power cut — **it deleted its own knowledge**.

The irony: this wasn't one incident, but **four deletion paths stacking up**. Each layer was "reasonable" on its own; combined, they were an avalanche. This post covers those four paths and the defense mechanisms that answer them.

---

## 1. Deletion path one: RED misjudgment (growth-rate sampling)

PivotMind has a health monitor; when memory goes abnormal it enters RED mode, freezing and pruning nodes. One trigger: **memory growth-rate sampling**.

One day's log:

```
22:24 RED → memory growth too fast | RSS=176MB(+142.50/min)
22:47 RED prune: deleted 28107 isolated frozen nodes
```

RSS was only 176MB (4GB board, zero pressure), but an instantaneous growth sample of +142MB/min triggered RED → froze 28,107 nodes → pruned them. **One misjudgment, 28,107 nodes deleted.**

The second time: at RSS 389MB it sampled +2092MB/min (even more absurd), deleting 6,826 more.

**Lesson**: instantaneous growth-rate sampling is completely unreliable (a single large allocation or a save causes a transient spike). The fix: **RED only trusts real memory usage (RSS > 3400MB = 85% of 4GB)**. The growth trigger was removed entirely. The judgment is now this simple:

```c
/* v0.5.7: RED is triggered only by memory usage — growth/freeze counts excluded */
if (hm->rss_mb > hm->rss_red_mb) {   /* rss_red_mb = 3400.0f */
    new_level = HM_RED;
    reason    = "RSS over limit";
}
```

**Design philosophy: signal trust grading**. A signal allowed to make life-and-death decisions must satisfy: ① be a physical quantity (memory usage), not a derived quantity (growth rate); ② have a clear physical ceiling (4GB); ③ not depend on sampling moment. Instantaneous growth is a "derived quantity" — one `realloc` and it jumps. It has no business participating in knowledge-deletion decisions.

## 2. Deletion path two: freeze-counter accumulation

After removing the growth trigger, RED triggered again — this time the log said "too many frozen nodes":

```
RED → too many frozen nodes | frozen=50182
```

The freeze counter is a **cumulative value** (accumulates during normal operation too). 50k accumulated → RED → RED freezes more → counter climbs higher → dead loop.

**Lesson**: cumulative counters can't be used as "current state". Fix: **neither freeze counts nor growth rates participate in RED — only RSS 85% remains**.

## 3. Deletion path three: edge-restore failure → isolation → prune (the meanest one)

This one is the sneakiest. While loading the state file, Pass 2 restores edges — one log:

```
Pass 2 complete: restored 10 edges   ← 420,000 edge records, 10 restored!
```

420,000 edge records, only 10 successfully restored — **99.99% failure**. Why? Look at Pass 2's code:

```c
ReasoningNode* tgt = node_hash_find(p2_topo->node_hash, tgt_concept);
if (tgt && tgt != node) {
    /* restore edge */
}
```

If the target-node hash lookup fails, skip. And in that load, most target nodes couldn't be found (see below — the dangling-pointer degradation of long-running states).

Edge-restore failure → all nodes become isolated (edge_count=0) → after the 30-minute protection window → `master_prune_dead_nodes` deletes all 40,000 isolated nodes → vocab = 72.

**This one almost made me give up** — because there was no deletion log at all (prune is silent), and vocab "vanished" between two saves. Look at its deletion condition:

```c
/* master_prune_dead_nodes deletion test */
if (node->is_cooled) continue;              /* skip frozen nodes */
if (node->edge_count == 0 && node->activation < 0.01f) {
    dead_ids[dead_count++] = node->node_id; /* isolated AND cold → delete */
}
```

`edge_count == 0 && activation < 0.01` — **isolated AND cold**. Edges not restored after load → everything isolated; no activation floor → everything cold → all 40,000 nodes match. One stroke, knowledge wiped.

**Design method: floor mechanisms (against systematic misjudgment)**. The fix added two "floors" specifically against "whole-graph matches deletion condition" systemic accidents:

```c
/* Load floor: cold nodes start at 0.3 — after decay during protection
 * window it stays above the freeze line 0.005 */
if (node->activation < 0.3f) node->activation = 0.3f;

/* Pass 2 edge-weight floor: low-weight edges restored to 0.2 —
 * forgetting cleanup (≤0.15) can't remove them */
if (conn_w < 0.2f) conn_w = 0.2f;
```

The activation floor of 0.3: after 30 minutes of decay (×0.99³⁶⁰ ≈ 0.027) it's still ~0.008 > the freeze line — **a node won't be treated as dead just because nobody touched it after load**. The edge-weight floor of 0.2: forgetting cleanup (which removes edges ≤0.15) can't strip loaded knowledge.

## 4. Deletion path four: the fake-freeze ghost

During the investigation I found a "ghost": the freeze mechanism looked like it was working (the log printed "froze 50 cold nodes" daily), but **it never actually executed** — node_cache (the freeze cache) had never been registered to the thalamus utility slot. `node_cache_freeze` received NULL and returned immediately, while the caller still did `frozen++`.

```
log: [脑干] froze 50 cold nodes this round (health=YELLOW)
actual: node_cache_freeze(NULL, ...) → return -1 (did nothing)
```

**Fake log** — the mechanism wasn't mounted, yet the log pretended it was. This is the scariest kind of bug: it makes you believe you have protection when you don't. The root cause: refactoring had deleted the registration code.

```c
/* brainstem freeze loop fetches node_cache — never registered, always NULL */
NodeCache* nc = (NodeCache*)thalamus_get_utility(th, THAL_UTIL_NODE_CACHE);
if (nc) { ... }  /* silently skips when NULL */
```

**Design method: mount verification**. After writing a mechanism, you must ask: "**is it actually wired into the runtime?**" Code existing isn't enough — `thalamus_register_utility` was never called, so node_cache didn't exist. Verification: after registration, the log shows real freezes (edges written to brain_state.dat, file growing) — **side effects are the proof of mounting**.

## 5. Defense mechanisms (one-to-one)

```
Threat                              Defense
────────────────────────────────────────────────────────────
RED misjudgment (growth rate)       RED only trusts RSS 85% (3400MB)
Freeze-counter accumulation         freeze/growth excluded from RED
Edge-restore fail → isolated → prune  ① Pass 2 edge floor 0.2
                                      (cleanup ≤0.15 can't remove)
                                      ② activation floor 0.3
                                      (never falls below freeze line)
node_cache fake-freeze              registered to thalamus slot (real)
Long-running state degradation      A: full-graph reverse cleanup on delete
(dangling edges)                    B: save-side tgt_safe double check
Protection window too short         tick count → real time 30 min
```

Several key mechanisms in detail:

**Protection window**: for 30 minutes after state load (`PM_LOAD_PROTECT_SECONDS`), freeze/prune/cleanup are all skipped — giving freshly loaded knowledge time to "warm up". Early versions used tick counting (60 ticks), but RED accelerates ticks and 60 ticks only lasted 5 minutes — switched to real time.

**is_cooled freeze protection**: frozen nodes (is_cooled=1) are skipped by prune — **freezing ≠ deleting**. Freezing is "edge data saved to disk + memory released" lazy memory; thaw restores on demand.

**Full-graph reverse cleanup (A)**: when deleting a node, the original code only cleaned the reverse of the deleted node's *outgoing* edges — other nodes' *incoming* edges pointing to it remained → dangling target → save-time dereference corrupted the state file → load-time edge restore failed. Fix A: sweep the whole graph clearing incoming edges before deletion:

```c
/* v0.5.7-A: full-graph reverse cleanup before deletion */
for (int t = 0; t < master->sub_topo_count; t++) {
    ...
    for (int j = 0; j < other->edge_count; ) {
        if (other->edges[j].target == node) {
            /* shift-remove + conn_hash rebuild */
            other->edge_count--;
        } else { j++; }
    }
}
```

**Design method: closing the dangling chain**. A prevents "creation" (clear references on delete) + B prevents "persistence" (check on save) — every link of the dangling pointer's life is blocked. This is defense in depth: **defend at every stage, not at one point**.

**Save-side defense (B)**: before dereferencing target, check `node_id round-trip` (target is in the node array and identity matches) — a dangling edge is saved with tgt_len=0, never corrupting the file.

## 6. Design philosophy: three principles from the war

After this battle, three principles crystallized — every "delete vs keep" decision follows them:

**1. Fail-safe by default.** When unsure whether to delete, keep. Deletion is destructive and irreversible; keeping only costs memory. Every deletion layer in PivotMind (prune/cleanup/prune-dead) must pass protective checks — is_cooled skip, protection window skip, activation-floor fallback.

**2. Defense in depth.** Any single mechanism can fail (growth misjudgment, counter accumulation, missing mount) — so every defense layer needs a next one: RED misjudgment → blocked by protection window → backed by activation floor → protected by is_cooled. **Single-point defense = no defense.**

**3. Signal trust grading.** Signals allowed to make life-or-death decisions: physical > derived > cumulative. RSS (physical) is trustworthy; growth rate (derived) is suspicious; freeze count (cumulative) is untrustworthy. **Making destructive decisions with unreliable signals means you'll delete the wrong thing eventually.**

## 7. Lessons

1. **Pick reliable monitoring signals**: instantaneous growth and cumulative counters are both unreliable — only hard metrics like real memory usage belong in life-or-death decisions
2. **Logs must be honest**: a fake log (node_cache idling) is more dangerous than no log — it creates the illusion of protection
3. **Knowledge scale is the test touchstone**: a 70MB state file can't surface the edge-restore bug; 130MB exposes it — the test standard should be "the largest state file runs"
4. **Silent deletion is the scariest**: prune deleted 40,000 nodes with zero log lines — important deletions must leave traces
5. **A mechanism only exists when mounted**: code written, function defined, log printing — but not wired into the runtime — equals nonexistent

---

*Next: topicality — how PivotMind knows "what we're talking about" (relevance scoring / bounded association / topic-ordered assembly).*
*Series: data structures → runtime → word emergence → knowledge survival → topicality → reasoning → semantic fields → autonomous learning → self-awareness.*
