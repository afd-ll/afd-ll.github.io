---
layout: post
title: "Semantic Fields: Making 'Time' More Than 'Ti' and 'Me'"
date: 2026-08-05
categories: [dev-notes]
description: "PivotMind dev note #8 — the Building-from-Zero series: how semantic nodes grow out of character co-occurrence statistics (sample → cosine cluster → cross-link), why the field solves recall but not generation, and a freshly discovered duplicate-cluster bug (sem_你 built 49 times) pulled straight from the state file"
---

*PivotMind dev note #8 — Building from Zero: semantic fields*

The last note covered the reasoning pipeline (PFE) and left a hook: semantic-field retrieval is the first step of reasoning, yet a word like "焦虑" (anxiety) couldn't be found in any field — the knowledge existed, but the fields hadn't been built. This note is about how semantic fields actually grow.

## The problem: a character is a character, a word is a word, a concept is a concept

In PivotMind's word topology, "时" (time) and "间" (interval) are two independent character nodes. Each has hundreds of co-occurrence edges, but **no single node represents "时间" (time) as a whole**.

When you ask "为什么时间重要" (why is time important), the sentence gets split into characters and fed into the diffusion engine — "时" activates "候", "间" activates "隔", but "时间" as a concept simply doesn't exist in the topology. When the PFE extracts the subject "时间" and looks it up in the semantic field, it finds nothing.

This isn't a mis-tuned parameter — **the architecture is missing a layer**: concept layer above characters, and semantic-field layer above concepts.

## The approach: let semantic nodes grow themselves

No hand-written dictionary entries like "时间 = 时 + 间" (architectural red line: all structure must emerge from corpus statistics). Instead:

```
① Sample: take up to 200 character nodes by activation, descending
② Cluster: group those with feature-vector cosine similarity > 0.02
   (512-dim random vectors are nearly orthogonal, so 0.02 already
    signals real similarity)
③ Create: each cluster of ≥2 members → one semantic node in the
   semantic topology, named after the highest-activation member
   (the "time" field's members are 时/间/候/刻...)
④ Connect: the semantic node cross-links back to every member
⑤ Word level: the concept topology (word nodes) clusters the same
   way — 时间/过去/钟表 sharing co-occurrence distributions →
   word-level semantic fields
```

Key parameters:

```c
SG_COSINE_THRESHOLD  0.02   /* very low: 512-dim random vectors are near-orthogonal */
SG_MAX_SAMPLE        200    /* conservative value for ARM */
SG_MIN_CLUSTER_SIZE  2      /* at least 2 members to form a cluster */
SG_MAX_NEW_NODES     15     /* at most 15 semantic nodes per round */
```

## Measured: the numbers speak

Real log records from today:

```
[语义生长]   tick=7550 新增 4 语义节点
[词语义生长] tick=7550 新增 3 词聚类语义节点
[语义生长]   tick=7555 新增 4 语义节点
[词语义生长] tick=7555 新增 3 词聚类语义节点
```

3000+ semantic-growth events in the logs — semantic nodes keep accumulating, and word-level fields (时间/过去/钟表 → a time-concept field) are starting to take shape. The semantic topology grew from 265 nodes to 2461 in 24 hours.

## Honestly facing three shortcomings

**① The 0.02 clustering threshold is suspiciously low.** A cosine similarity of 0.02 in 512 dimensions is theoretically close to random — meaning the feature vectors haven't been trained enough yet (Hebbian co-occurrence training just started). Raising the threshold would miss real clusters; lowering it would admit noise. I chose the conservative value for now and will revisit once the corpus accumulates.

**② Semantic-field retrieval is still "synonym concatenation", not "understanding".** When the PFE queries a field, it gets a cluster of words and concatenates the top-3 content words into an answer — that's a long way from "explaining what time is". The field solves *recall* ("the word can't be found"), not *generation* ("the answer is good").

**③ Duplicate clustering: the same field gets built over and over.** While inspecting the state file, I found `sem_你` appearing 49 times and `sem_delightful` 32 times in the semantic topology — the same cluster members repeatedly forming new nodes. Root cause: each growth round samples only the top-200 most activated characters, the sampling window scrolls, and **members that already formed a cluster re-enter the sampling pool next round** — while the dedup check only looks at the concept topology, not the semantic topology. This bloats the semantic nodes (265→2461 in 24h includes many duplicates) and dilutes retrieval precision — when a "time" field and a "时" field coexist, the PFE may hit the wrong one. The fix: before forming a cluster, reverse-check the semantic topology via member cross-links to see if a covering field already exists; skip if so. That's next on the list.

## Design philosophy: fields emerge, tables are preset

A lookup-table AI would build a "concept → member words" mapping table with O(1) queries — fast. PivotMind doesn't do that — **semantic fields grow out of co-occurrence statistics**: edge weights are co-occurrence counts, and cluster formation is the natural result of feature similarity.

The cost: fields only take shape once enough corpus has been fed; early queries fail ("焦虑" not found). The payoff: **the field is alive** — when "时间" and "钟表" co-occur more in the corpus, they naturally join the same field; when a new word appears, it naturally falls into its nearest field. A table's boundaries are written in stone; a field's boundaries are computed from statistics.

## Next steps

- Upgrade field answers from "word concatenation" to "structural assembly" (waiting on POS — the hook from note #4; syntax topology is accumulating)
- Adaptive clustering threshold as the corpus grows
- Cross-links between fields (field-to-field relations, e.g. "time" field ↔ "history" field)

Next note preview: autonomous learning — how the crawler, word consolidation, and domain induction ("background self-learning" mechanisms) coordinate.
