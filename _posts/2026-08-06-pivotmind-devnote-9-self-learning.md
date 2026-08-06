---
layout: post
title: "The Price of Self-Learning: PivotMind Deleted 91% of Its Own Memory"
date: 2026-08-06
categories: [dev-notes]
description: "PivotMind dev note #9 — Building from Zero series: how autonomous learning works (self-correction audit walks, curious crawler, word consolidation), the three self-protection layers (freezing, load-protection, pruning), and the day the pruner misread its own architecture — 91% of nodes deleted twice, exactly 34 minutes after boot. Root cause, the fix (cross-topology references are evidence of life), and the 50% guardrail."
---

*PivotMind dev note #9 — Building from Zero: autonomous learning*

The last note covered semantic fields and left a hook: autonomous learning — how the crawler, word consolidation, and domain induction coordinate as "background self-learning." This note is about that. But it is also the story of a system that learned to learn, and then almost deleted itself.

## Minute 34

On the morning of August 5, the black-box heartbeat caught a number: `vocab_nodes=619`.

Five minutes earlier it had been 31141. Thirty-one hundred words, the entire word topology, gone 98% between two saves. No crash log. No segfault. Not a single error line — PivotMind kept running, feeling perfectly fine about itself, writing the hollow state into its state file every two minutes.

It had already happened once. At 10:37, in a reproduction run, the same scene played out on schedule: 83289 → 7214.

Two explosions, 34 minutes apart, frame-identical.

## It had been learning on its own

PivotMind's "autonomous learning" is not a training loop. It is three mechanisms coordinating inside one long-running process, making incremental edits on one in-memory graph of 83,000 nodes and 116,000 connections.

**Mechanism one: self-correction.** Every 60 ticks (about 5 minutes), the self-learner walks random paths through the graph and audits them. The core lives in `audit_path()`:

```c
/* Cross-topology: feature-similar but unconnected → create a cross link */
if (steps[a].topo_id != steps[c].topo_id) {
    if (!cross_link_exists(sl->master, steps[a].topo_id, na->node_id,
                           steps[c].topo_id, nc->node_id)) {
        float sim = 0.0f;
        if (na->features && nc->features &&
            na->feature_dim > 0 && na->feature_dim == nc->feature_dim) {
            sim = cosine_similarity(na->features, nc->features, na->feature_dim);
        }
        if (sim > sl->cfg.similarity_threshold) {
            float init_w = sl->cfg.transitive_boost + sim * 0.15f;
            if (init_w > 0.6f) init_w = 0.6f;
            master_add_cross_link(sl->master,
                steps[a].topo_id, na->node_id,
                steps[c].topo_id, nc->node_id, init_w, ...);
        }
    }
}
```

Read the comment: *"The same-topology transitive closure (A→B→C → build A→C) has been removed. Random-walk triples lack semantic grounding and cause O(n²) edge explosions. Graph growth is driven by live web search / article reading (real corpus) plus cross-topology semantic links (quality-gated)."*

That is an architecture red line: **structure may only emerge from statistics of real corpus — never be synthesized from path assumptions.** So the "create" correction must pass a cosine-similarity gate, the initial weight gets a 0.15× similarity bonus and a 0.6 cap. Each cycle logs like this:

```
[自学] 周期#46完成: 7处修正 (传递:0 创建:0 降权:0)
```

**Mechanism two: the curious crawler.** The sensory cortex keeps five search engines on call. Every cycle it picks words, goes out to "look things up," and feeds the returned pages to the article reader, which counts character-pair co-occurrences. Sogou keeps returning CAPTCHA pages (discarded); Baidu mobile works occasionally — the daily life of a crawler is fighting anti-bot systems.

**Mechanism three: word consolidation.** On the hippocampus's consolidation rhythm, character-layer combinations that meet the emergence conditions are promoted to word nodes:

```c
/* Word consolidation: character topology → concept topology promotion
 * (relative-strength emergence of word nodes).
 * Frequency = hippocampal consolidation rhythm (consolidate_every_n_ticks),
 * capped to prevent explosion — words grow out of co-occurrence statistics */
if (bs->tick_count % bs->consolidate_every_n_ticks == 0) {
    int words = autonomic_compound_consolidate(bs->master);
    if (words > 0 && bs->verbose)
        LOG_INFO("[词巩固] 涌现 %d 个词节点（字→概念拓扑）", words);
}
```

At 00:05 on August 5, it had just emerged 178 word nodes and expanded the concept topology to 84,500.

## Self-protection, and its time bomb

Survival mechanisms require protection mechanisms. PivotMind has three layers:

- **Freezing** (`is_cooled`) — cold nodes export their edges to an external file and release their cache; the knowledge is not deleted.
- **Load protection** (`load_protect`) — for 30 minutes after `master_load_state` succeeds, pruning and freezing are suspended, giving the freshly loaded graph a stabilization window.
- **Pruning** — deletes genuinely dead nodes. The death test:

```c
if (node->edge_count == 0 && node->activation < 0.01f) {
    dead_ids[dead_count++] = node->node_id;
}
```

No internal edges and activation below 0.01 — no edges, never lit up. Sounds like garbage. The problem: **in PivotMind's architecture, "no internal edges" has never meant "dead."**

Look at the cross-topology link structure:

```c
typedef struct CrossTopologyLink {
    int link_id;
    int from_topo_id;
    int from_node_id;
    int to_topo_id;
    int to_node_id;
    float weight;
    const char* relation;      // relation type (string pool)
    int bidirectional;
    float transfer_rate;
    time_t created_time;
    int use_count;             // usage count (dynamic weight learning)
} CrossTopologyLink;
```

It addresses by topology ID + node ID. **It holds no node pointers.** It lives in the independent `master->cross_links` array. In other words: a word node is "alive" in all the cross-topology connections pointing at it — not in its own handful of internal edges.

I parsed the state file: of 31,133 vocabulary nodes, 30,636 have `edge_count==0` — 98%. Their connections all hang in `cross_links`. And activation? PivotMind uses sparse activation — one inference lights only a few nodes; the whole-graph mean activation is 0.0003, thirty times below the 0.01 threshold. **Sparse activation is a design feature, not a bug**: to keep signals from blurring into a mush as they propagate, most nodes sit at 0.000x idle levels most of the time.

So that death test, in PivotMind's architecture, is equivalent to: *every node that lives through cross-topology connections is dead.* One prune pass freed 76,000 healthy nodes and compacted the array to seven thousand — the survivors being exactly the few that hold internal edges.

Why a time bomb instead of an instant crash? The load-protection window. For 30 minutes after load, prune returns immediately; the moment the window expires, the prune before the next save opens fire. Boot at 09:00:28, explosion at 09:34:18 — 34 minutes, exactly load time plus protection window. The reproduction at 10:03 exploded at 10:37. Same script.

## The investigation

The black box sounded the alarm first: vocab collapse, in the heartbeat within five minutes. But what actually located the root cause was a subagent — it lined up the incident timeline, the code path, and the state-file measurements, formed the "time bomb" hypothesis, and then did the dumbest, hardest thing: waited. Waited for the protection window to expire, waited for the next save, and watched the node count drop from 83289 to 7214 in front of its own eyes. Frame-by-frame reproduction.

That reframed something for me: *you verify the architecture, not the specific words.* Words can be re-learned; a wrong architecture keeps being wrong.

## The fix: make the judgment catch up with the architecture

**Layer one: fix the judgment semantics.** A cross-topology reference is evidence of life — nodes referenced by `cross_links` are never judged dead. The implementation scans all 116,000 cross-topology links once and builds a per-topology "has-reference" bitmap:

```c
/* Scan cross-topology links, mark referenced nodes */
for (int i = 0; i < master->cross_link_count; i++) {
    CrossTopologyLink* l = master->cross_links[i];
    if (!l) continue;
    if (l->from_topo_id >= 0 && l->from_topo_id < master->sub_topo_count &&
        has_ref[l->from_topo_id] && l->from_node_id >= 0)
        has_ref[l->from_topo_id][l->from_node_id] = 1;
    if (l->to_topo_id >= 0 && l->to_topo_id < master->sub_topo_count &&
        has_ref[l->to_topo_id] && l->to_node_id >= 0)
        has_ref[l->to_topo_id][l->to_node_id] = 1;
}
```

The death test becomes:

```c
if (node->edge_count == 0 && !has_cross_ref[topo][id] &&
    node->activation < 0.01f) {
    dead_ids[dead_count++] = node->node_id;
}
```

This is not a patch. It is **upgrading the definition of a dead node from a single-topology view to a global view.** An engine built as nested multi-topology, judging life and death with a single topology's local sight — that is itself a semantic mismatch. The design principle underneath: **judgment semantics must follow the architecture's shape.** The day the architecture grew from one graph into nested topologies, every "local-view" judgment became obsolete.

**Layer two: defense in depth.** Before pruning, count the candidate dead nodes; if they exceed half the total, abort and report:

```c
long _total_nodes = master_count_total_nodes(master);
if (_total_nodes > 0 && _total_dead > _total_nodes / 2) {
    fprintf(stderr, "[prune] 中止: 死节点候选 %ld/%ld 超 50%%，判定疑似误判 (v0.5.8 护栏)\n",
            _total_dead, _total_nodes);
    ...
    return 0;
}
```

Both incidents deleted 91%. A 50% threshold catches any similar misjudgment. Better to let ten thousand live than kill one by mistake — **pruning is maintenance, not judgment.** This is protective-by-default in action: any cleanup operation, when evidence is insufficient, defaults to not running.

## It is still alive

After the fix, PivotMind restarted at 11:08. By 14:20, when I wrote this, `total_nodes` sat steady at 83595 — still growing. Three-plus hours past the protection window, ninety-plus saves, not a flicker. The old build had exploded twice by this point.

Back to the opening: it learned to learn. Lesson one of self-learning is not learning more — it is learning not to delete yourself. PivotMind paid 91% of its memory to learn that lesson, and the lesson itself got written into the code: a 50% guardrail, like an immune-system memory, so that from now on its pruning can never remove more than half of itself in one pass.

Next, it has to learn something harder: growing that abstract "I" out of action–result statistics. That is the topic of note #10.
