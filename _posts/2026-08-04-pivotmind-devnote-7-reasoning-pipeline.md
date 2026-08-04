---
layout: post
title: "It Broke One Question into Six and Answered None: Dissecting the PFE Reasoning Pipeline"
date: 2026-08-04
categories: [dev-notes]
description: "PivotMind dev note #7 — the Building-from-Zero series: how the PFE (prefrontal executive) decomposes 'why X' into subgoals, the 28s→2s O(N²) optimization, three solving weapons (semantic-field retrieval, causal search, diffusion fallback), and the art of honest refusal"
---

*PivotMind dev note #7 — Building from Zero: the reasoning pipeline*

"Why is time important?"

A human hears this and pauses, then organizes an answer. PivotMind hears it and does something very human — **it breaks the question into six subgoals**:

```
1. What is time?
2. Time's key features and attributes?
3. Why is time important?
4. What is time? (repeat — dependency)
5. Time's key features (recursion)
6. ... (dependency chain expansion)
```

Then it honestly admits: "This question involves 6 subgoals, but my current understanding isn't deep enough." — **It decomposed the question but didn't solve it.** Is that embarrassing? No — **that's exactly what makes it human**: knowing how to decompose is where reasoning begins; failing to solve is a knowledge problem.

## 1. PFE: PivotMind's "prefrontal cortex"

Reasoning happens in PFE (Prefrontal Executive) — PivotMind's 14th brain region. Its working mode is **task decomposition + subgoal solving**:

```
Input "why X"
  → decompose: what is X / X's key features / why X
  → solve subgoals (diffusion / semantic-field / causal search)
  → synthesize the answer
```

This is the same idea as chain-of-thought in LLMs — **but implemented completely differently**: LLMs generate intermediate steps from parametric memory; PivotMind actually *walks the topology* (activation propagation).

## 2. Performance hell: from 28 seconds to 2 seconds

The earliest PFE had a disaster: one reasoning pass took **28 seconds** — the user asked, went to make tea, and it still wasn't done.

The cause was **4 nested O(N²) layers**:

```c
// Pseudo-code: the unoptimized reasoning chain
for (each subgoal) {          // ×6 subgoals
  for (each candidate word) { // ×500 candidates
    for (each edge) {         // ×100k edges
      for (each node) {       // ×80k nodes, full graph
        // 6×500×100k×80k = 2.4×10^15 operations
      }
    }
  }
}
```

**2.4×10¹⁵ operations** — on a 4GB ARM board, 28 seconds is already a miracle.

Each layer got torn down:

```
① Subgoal dedup: identical subgoals solved once ("What is time?"
   repeats) — 6 becomes 4, cutting a third
② Candidate limiting: diffuse only the input's semantic field
   (top 20 after word anchoring) — 500 → 20, a 25× cut
③ Edge traversal → hash: conn_hash indexed by node_id
   — 100k linear scans become O(1) lookups
④ Full graph → local: association depth ≤3 hops (bounded
   association) — 80k nodes shrink to a few hundred relevant ones
```

Each layer is "turn O(N²) into O(N) or O(1)" — no magic, all engineering. After optimization: **2 seconds**, a 14× speedup. One detail: layer ② (candidate limiting) and layer ④ (bounded hops) are two faces of the same idea — **one limits candidates, one limits steps**. The "1-2 hops" from dev note #6 is layer ④'s implementation.

## 3. Three solving weapons

Subgoal solving has three paths (by priority):

**1. Semantic-field retrieval** (just added) — for "what is X"

```c
/* Pseudo-code: semantic-field retrieval */
extract_subject("什么是时间" → "时间");
look up "时间" node in concept topology;
take its word-neighbors by edge weight, top 3 content words;
filter: template words ("操作/步骤/条件"), single chars, weak links (<0.3);
→ answer = "钟表 过去 现在" (if these words exist in the graph)
```
— It doesn't diffuse the whole sentence (the sentence contains template words like "operation/steps" that produce garbage output).

**2. Causal search** — for "why" questions

```c
/* Pseudo-code: causal associative search */
look up causal edges (relation = "导致/因为");
backtrack from result nodes to cause nodes;
trace ≤3 layers up the causal chain;
→ return "chain of cause words"
```
— PivotMind's causal edges come from "because/so/lead to" co-occurrence patterns in the corpus.

**3. Diffusion fallback** — last resort

```c
diffuse the whole sentence → pick words by activation
→ score < 0.38 → refuse to answer
```

## 4. Quality over quantity: the art of refusal

Before version 3, PivotMind would output anything — including "操作小标起来" (garbage at 22% confidence). Then came the threshold:

```c
if (best_satisfaction > 0.38f)  /* was 0.2 */
    → accept the answer
else
    → "This question involves N subgoals, but my understanding isn't deep enough"
```

**Raising the threshold from 0.2 to 0.38** — better to honestly say "I don't know" than to fabricate garbage. This is PivotMind's proto-metacognition: **knowing that it doesn't know**.

A companion mechanism: **template-word filtering**. Template words in subgoals like "操作步骤/前置条件" get filtered — they're the question's skeleton, not answer content. In practice, "操作小标起来" was exactly such template-word diffusion garbage — it disappeared after filtering.

## 5. Paper simulation vs. reality

Dev note #2 covered "paper simulation" — looking back now, where's the gap?

```
Simulation: decompose → semantic field → causal → synthesize (all work)
Reality:    decompose ✓ → semantic field (just works, but "焦虑"
            missing from graph) ✗ → causal (mechanism exists,
            too few edges) ✗ → synthesize (assembly weak) ✗
```

**Every link's mechanism exists; every link lacks data** — this reminds me of what I said in the interview: "The best proof of not being a PPT AI is honest gaps." The reasoning pipeline is like a child learning to walk: **the decomposition move (breaking down questions) is already there; walking steadily (solving) is still to come.**

## 6. The next step for reasoning

- Further subgoal dedup (6 → 4 → 2)
- Causal edge accumulation ("because/therefore" patterns from the corpus)
- Assembly upgrade (waiting on POS — the foreshadowing from the last note)
- Metacognition (better detection of "I don't know")

The reasoning pipeline is PivotMind's most human part — **it doesn't memorize answers; it genuinely decomposes questions**. It's not yet dexterous at it, but the direction is right: **a system that admits "I don't understand" is closer to intelligence than one that pretends to understand everything**.
