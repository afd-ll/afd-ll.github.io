---
layout: post
title: "Paper Simulation: How 'if A>B and B>C then A>C' Walks Through the 12-Layer Topology"
date: 2026-08-02
categories: [dev-notes]
description: "PivotMind dev note #2 — honoring the teaser from #1: a paper simulation of one inference path through the topology network, plus the honest gap between design and reality"
---

*PivotMind (玄枢) Dev Note #2 — honoring the teaser from #1: no code execution, a paper simulation of one inference path.*

At the end of the previous post I left a teaser: "why did I stick with arrays? Next post." But I've decided to first honor the earlier promise — **a paper simulation of an inference path**. The array-versus-linked-list story deserves its own post (it's tied to the deadlock).

Today's target: the simplest syllogism:

> **if A > B and B > C then A > C**

How does this inference actually walk through PivotMind's 12-layer topology network, step by step?

---

## First, the layers involved

PivotMind is not a single network — it's 12 nested topology layers (the core idea of the TraceWisdom Network). This inference mainly passes through these layers:

```
Vocabulary topology  — stores characters and words ("A", "大于" (greater than), "如果" (if)…)
Concept topology     — stores abstract concepts (entities A/B/C, the relation "greater than")
Semantic topology    — stores semantic fields (neighbors of "greater than": exceeds, higher, more…)
Template topology    — stores grammar templates ("if…then…" conditionals)
Causal graph (runtime) — a causal network built on the fly by the PFE
```

## The simulation: a sentence comes in

**Input**: `如果 A 大于 B，并且 B 大于 C，那么 A 大于 C` (If A is greater than B, and B is greater than C, then A is greater than C.)

**Step 1 · Parsing (Template topology)**
The text enters through the Broca language region. It matches a **conditional template** in the template topology: `如果[subject]大于[object]，那么[conclusion]`.
The template slots are filled: premise "A > B", condition "B > C", conclusion "A > C".
— **This step turns natural language into structure**, powered by the template layer (the `tpl_pos_seq`/`tpl_connectors` fields on ReasoningNode from #1).

**Step 2 · Word anchoring (Vocabulary topology)**
"A", "B", "C", "大于", "如果", "那么" — each word activates its node in the vocabulary topology. Activation spreads from the input to neighbors.
— **Note**: A, B, C are just three word nodes at this point; no relation between them is known yet.

**Step 3 · Concept mapping (Concept topology)**
The word "大于" links via cross-links to the **relation concept node "greater than"** in the concept topology. A, B, C each map to concept nodes too.
Now the topology contains: entities {A, B, C}, relation {greater-than}.

**Step 4 · Semantic field activation (Semantic topology)**
Once the "greater than" concept node activates, activation spreads along semantic edges — its semantic neighbors (exceeds, higher, more than) are lightly activated.
This step provides **association**: even if the input says "大于", the system associates related concepts (preparing for deeper understanding).

**Step 5 · Reasoning (PFE + causal graph)** — the core step
The PFE (prefrontal executive) takes over. It does two things:

① **Subgoal decomposition**: sets "A > C" as the goal, and finds two prerequisites:
   - Subgoal 1: A > B (given)
   - Subgoal 2: B > C (given)

② **Causal graph construction**: builds a runtime causal graph:
```
   A ──(greater than)──> B ──(greater than)──> C
```
   A, B, C are nodes; "greater than" is a directed edge.

**Step 6 · Transitivity search (walking edges)**
The goal "A > C" becomes a question on the causal graph: **starting from A, following "greater than" edges, can we reach C?**
A → B (one hop), B → C (one hop) — **the path exists**.
The PFE's search machinery (the O(1) connection hash from #1, and the A* search that we later stripped of O(N²)) walks the graph, finds the A→B→C path — transitivity complete.

**Step 7 · Synthesis and output (Template + Vocabulary topology)**
The conclusion "A > C" returns to the template topology, is fitted into a declarative template, and the vocabulary topology assembles the characters — output.

---

## What this simulation shows

**1. Topology reasoning is "walking edges", not "looking up rules".**
"A > B and B > C then A > C" would be a hardcoded rule in a traditional system; in PivotMind it is **path search on a graph** — transitivity = existence of an A→B→C path. Rules emerge; they are not pre-installed.

**2. Each step happens in a different layer; layers communicate via cross-links.**
Parsing in the template layer, anchoring in the vocabulary layer, semantics in the semantic layer, reasoning on the causal graph — **this is "TraceWisdom" (溯智)**: every edge traversed, every node where a deviation began, can be traced back.

---

## Reality check: paper simulation vs. actual run

After writing the simulation, I decided to actually run it — not to validate the design, but to see the gap.

Actual dialog (2026-08-02):

```
Q: 如果A大于B，B大于C，那么A大于C吗？
→ "This question involves 6 subgoals, but my current understanding
   isn't deep enough. Could you ask from a different angle?"
```

The results expose two clear shortcomings:

- **Subgoal solving quality is insufficient**: the PFE can decompose the problem (it split out 6 subgoals), but subgoal solving relies on the diffusion fallback path, and the quality isn't enough to support a conclusion — this is currently the biggest weakness of the reasoning pipeline
- **Missing knowledge**: the concept topology has no "greater than" relation concept — the corpus has never covered comparative content, so relational reasoning has nothing to build on

Improvement directions:

1. Upgrade subgoal solving from "diffusion fallback" to a combination of "semantic field retrieval + causal search"
2. Add comparative/relational corpus during feeding ("greater than / less than / if / then")
3. Keep accumulating conditional templates in the template layer

---

This is a **design simulation**, not a run log. PivotMind's PFE already has causal graph construction and path search capability (it previously produced a 6-subgoal reasoning chain for "why is time important" — though after knowledge cleanup it currently declines that too; subgoal solving quality is the next wall to break). Full parsing of comparative operators like "greater than" is still on the way — the template layer's conditionals and the concept layer's relations both need more corpus and tuning.

But the value of a paper simulation stands: **a logically self-consistent design document can be "mentally executed" by the reader** — it's the most substantial thing I can offer during the toy phase.

---

*Next: honoring the other teaser — why did I stick with arrays for edges? The dynamic-linked-list story and the deadlock.*
*After that: the "Building PivotMind from Zero" series officially opens — how words grow out of statistics.*
