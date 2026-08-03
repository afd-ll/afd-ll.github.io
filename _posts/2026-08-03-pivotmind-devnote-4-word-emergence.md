---
layout: post
title: "The Dictionary Is the Easy Way, and I Refused: Four Hurdles of Hebbian Word Emergence"
date: 2026-08-03
categories: [dev-notes]
description: "PivotMind dev note #4 — the 'Building PivotMind from Zero' series opens. Why no dictionary, and how words emerge from co-occurrence statistics via saturation-curve Hebbian learning, relative strength, bidirectional confirmation, and word-order determination"
---

*PivotMind (玄枢) Dev Note #4 — the "Building PivotMind from Zero" series officially opens.*

Before this post, a fun story: PivotMind's word-emergence mechanism was something I "invented" myself from engineering instinct — **at the time I had no idea who Donald Hebb was**. Only later did someone tell me: "this mechanism is called Hebbian learning, proposed in 1949." That's when I realized I had stumbled onto a classic of cognitive science.

Hebb's rule in one sentence: **neurons that fire together, wire together**. My instinct was: **characters that appear together, strengthen their connection**. Essentially the same thing — but my version is more "engineered": saturation curve, relative strength, bidirectional confirmation. This post is about how this mechanism grew out of the requirement "no dictionary".

---

## 1. Why no dictionary

PivotMind's syntax layer needs parts of speech (POS), and dialog needs words. The easy way: install a ready-made dictionary (e.g. jieba segmentation + POS table), problem solved.

But I refused. Three reasons:

1. **A dictionary can't update in real time.** PivotMind crawls the web and reads books by itself — if it learns a new word "metaverse" today and the dictionary doesn't have it, it will never recognize that word.
2. **A dictionary is "someone else's statistics."** Its frequencies and collocations come from someone else's corpus, not from what PivotMind itself has seen — using it means making PivotMind see the world through someone else's glasses.
3. **It violates the engineering philosophy.** PivotMind's principle is "let structures grow themselves." Why shouldn't words grow themselves too?

So the design was fixed: **no dictionary — words must emerge from corpus statistics on their own.**

## 2. Mechanism: character-pair co-occurrence → edge weight accumulation

In PivotMind's character topology, each character is a node. During feeding, text is scanned in word order, and **edges are built between adjacent character pairs, with weights accumulating with co-occurrence count**:

```
"关羽" appears 500 times in the corpus
→ "关" and "羽" co-occur repeatedly → edge weight keeps growing

"关" and "于" also co-occur ("关于")
"关" and "系" also co-occur ("关系")
```

The key problem: **"关羽" 500 times, "关于" 300 times, "关系" 200 times** — edge weights can all grow to 1.0 (capped). Then what? **How do we tell which is a real word?**

## 3. The saturation curve: the closer to 1.0, the smaller the increment

Naive Hebb ("co-occur → +1") has a fatal flaw: **high-frequency collocations all hit 1.0, no separation**. "关羽" and "关于" both reach 1.0, and the relative-strength signal completely disappears.

The solution: **saturation curve**. The increment decreases with current edge weight. This is the actual implementation in PivotMind's feed_cli:

```c
static void hebbian_edge(HuarongTopologyNet* net, ReasoningNode* from, ReasoningNode* to) {
    int idx = find_edge_idx(from, to);
    if (idx >= 0) {
        float w = from->edges[idx].weight;
        /* saturation curve: increment shrinks as weight approaches 1.0 */
        from->edges[idx].weight = w + HEBBIAN_DELTA * (1.0f - w);
        if (from->edges[idx].weight > 1.0f)
            from->edges[idx].weight = 1.0f;
    } else {
        huarong_net_add_connection(net, from->node_id, to->node_id, 0.4f);
    }
}
```

One line, `w + HEBBIAN_DELTA * (1 - w)` — at weight 0.2, one co-occurrence adds +0.8·Δ; at weight 0.9, only +0.1·Δ. **High-frequency pairs approach 1.0 quickly but never quite reach it** — so "关羽" (500 times) and "关于" (300 times) separate at 0.99 and 0.97. The saturation curve keeps **frequency information inside the edge weight** instead of everything saturating flat.

## 4. Relative strength: compare to the average, not the absolute

Edge weight alone isn't enough — **high-frequency characters ("的","了") co-occur with everything**, their edge weights are naturally high. How to filter?

The answer: **relative strength**. A character's edge weights have an average; **real word collocations have weights significantly above that average**:

```
"关"'s edge weight distribution:
  关-羽: 0.99 (500 co-occurrences)
  关-于: 0.97 (300)
  关-系: 0.77 (200)
  ...
  average: 0.35

relative strength = edge weight / average
  关-羽: 2.8  → emergence candidate ✓
  关-于: 2.7  → emergence candidate ✓
  关-系: 2.2  → emergence candidate ✓
```

The threshold is parameterized (`g_compound_threshold`, extern-adjustable — tuning at runtime without recompiling):

```c
#define CC_THRESHOLD_DEF  1.5f   /* relative strength threshold: w > avg×1.5 */
float g_compound_threshold = CC_THRESHOLD_DEF;  /* globally tunable */
```

Initially set to 3.0 — too strict, only "关羽"-level high-frequency words pass, almost nothing emerges; lowered to 2.0 and 200 words emerged (hitting the cap); final default is 1.5. **"关"'s strongest bindings turned out to be "系/于/机" (关于/关系/机关)** — the mechanism correctly recognized real words; the threshold just needs to match corpus density — a tuning problem, not an architecture problem.

## 4.5. Dual channel: high-frequency entity words take the absolute channel

Relative strength (compare to average) works for high-frequency characters, but has a blind spot: **words built from low-frequency characters** (names like "李梅","梅亭" — characters with low frequency, low average weight, relative strength never triggers). So an absolute channel was added:

```
relative strength ≥ 1.5 (vs average) → emergence candidate
absolute edge weight ≥ 0.85 (raw weight) → emergence candidate (entities)
either channel hits + bidirectional confirmation + word-order → word emerges
```

In practice, the character names "李梅/梅亭/文纨" from *Fortress Besieged* all emerged via the absolute channel — the relative channel catches general words, the absolute channel catches entities.

## 5. Bidirectional confirmation + high-frequency direction determines word order

After relative strength finds candidates, two more gates:

**1. Bidirectional confirmation.** A→B strong, B→A must also be strong — filters out noise pairs with one-sided frequency.

**2. High-frequency direction sets word order.** "关-羽" emerges, but which comes first? — **count both directions**: "关羽" appears 500 times, "羽关" 0 times — the high-frequency direction wins, order is "关羽".

This step is crucial: in an early version I tried bidirectional edges (A↔B both added at once), and a bunch of **reversed words** emerged ("服衣", "史历", "后然") — bidirectional edges threw away word-order information. After switching to one-directional word-order edges + high-frequency-direction word order (the consolidator only checks the high-frequency direction), reversed words dropped to zero.

```
"关-羽" 500 co-occurrences ("关羽")
"羽-关" 0
→ high-frequency direction = 关→羽 → word order fixed as "关羽"
```

## 6. Words promote into the concept topology

After a word emerges, **a word node is created in the concept topology (TOPO_CONCEPT)**, linked back to its component characters via cross-links:

```
Concept topology: [关羽] ←cross-link→ Character topology: [关] [羽]
```

The character topology stays pure (single characters are the basic unit, never merged); words exist independently at the concept layer. English words go directly to the concept layer (classification only, no synthesis); Chinese words follow the full path "co-occurrence → emergence → promotion".

## 7. Measured data

Word consolidation runtime data after feeding 20 Chinese books:

```
v0.5.7 word consolidation (brainstem periodic task):
  343 words emerged (first round) → keeps growing
  samples: 说话/人家/他说/她说/你是/你说/不去/不想
  reversed words: 0 (high-frequency-direction order works)
  function-word combos (他/你/是/不/了): exist — tuning issue, later
```

Word consolidation is a **background autonomous learning capability** (mounted on the brainstem tick), not a feeding tool — feeding only builds edges; words grow on their own during runtime.

## 8. Echoes: semantic fields and the future self

This philosophy of "let structures grow from statistics" runs through PivotMind:

```
word emergence:  character-pair co-occurrence → Hebbian → word node
semantic fields: word-word co-occurrence → semantic clustering → semantic topology
self emergence (in design): action-result statistics → self node

One mechanism: don't install structure, let structure emerge from statistics.
```

---

*Next: memory and knowledge survival — loading/saving/protection/freezing, a war over whether knowledge deletes itself.*
*Series preview: Building PivotMind from Zero — data structures → runtime → word emergence → knowledge survival → topicality → reasoning → semantic fields → autonomous learning → self-awareness.*
