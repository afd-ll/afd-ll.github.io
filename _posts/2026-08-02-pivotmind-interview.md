---
layout: post
title: "PivotMind: A 'Toy' Aiming for AGI"
date: 2026-08-02
description: "An interview with Chen Daoxiang (cx), the creator of PivotMind — a pure-C, zero-dependency brain-inspired cognitive engine running on a $20 ARM board"
---

*An interview with **Chen Daoxiang (cx)**, a third-year undergraduate student in China and the creator of PivotMind (玄枢) — a pure-C, zero-dependency brain-inspired cognitive engine with 14 brain regions and a 12-layer topology network, running on a 140-yuan ARM development board.*

---

## The Origin: Probabilistic Inference, Not Logical Reasoning

**Q: How did you first come up with the idea of building a cognitive engine?**

While using AI to assist with programming, I gradually realized that existing AI is essentially nothing more than a probabilistic inference engine. Code is written the way it is because it's probabilistically optimal — not because it logically follows that it should be written this way. At that moment, a thought took root: is it possible to create an AI that truly understands code, understands logic?

Back then, it was only a vague idea, with no clear path to realization.

## The Spark: A Huarong Dao Video

**Q: What happened between the idea and taking action?**

One evening, while scrolling through short videos, I happened upon a science video about Huarong Dao (a sliding-puzzle game) — specifically, its topology graph structure. In that instant, everything clicked: isn't a topology graph the natural mapping of the human brain? Nodes are neurons, edges are synapses, and traversing an edge is signal transmission. If you want to build an AI that understands logic, you must move toward a biomimetic direction — and a topology graph is the natural brain-like structure.

But on deeper thought, a single topology graph has fundamental flaws: cluttered content, chaotic structure, inefficient traversal, and severe noise pollution. That led me to create the **"Suzhi Network" (溯智网络)** — a nested multi-topology architecture: a master topology containing sub-topologies, each of which contains nested child topologies. The system first performs intent parsing; each child topology computes a local optimum, then the master topology reconciles them into a global optimum and outputs the answer. This was the very early model foundation — and that's where the name "Suzhi Network" came from.

## Suzhi: Letting Intelligence See Its Own Reasoning Path

**Q: What does "Suzhi" (溯智) mean?**

Suzhi means **reasoning-path visualization** — the intelligent system can observe how it traverses its own connections, and when a result deviates, it can pinpoint exactly which node the deviation started from. That is the essence of Suzhi.

Suzhi Network is the architecture, similar to how "LLM" is an architecture. PivotMind (玄枢) is the concrete model built on top of that architecture — comparable to how DeepSeek is a specific model built on its underlying architecture.

**Q: Where did the name "Xuan Shu" come from?**

I didn't think about it much — it just came naturally when I wrote it down. Same for the English name.

## Brain Regions: Born from Engineering Needs

**Q: How did the 14 brain regions come about?**

The idea of brain regions started when I introduced self-learning functionality — at that point I was already thinking about modularization. After adding self-learning, the overall project file structure became messy. To keep the codebase clean and maintainable, I came up with the idea of brain-region division: brainstem, cerebral cortex, language area, and so on — concepts that gradually took shape and mapped to separate source files. This division makes it easy to maintain, to verify whether each functional area is complete, and to manage connections.

## No Vocabulary: Grammar Needs POS, But You Can't Ship a Dictionary

**Q: How did you design the mechanism where words emerge on their own (POS emergence)?**

This mechanism exists to serve the grammar system — grammar templates require part-of-speech tagging to function. But you can't equip an AI with a huge dictionary: it can't be updated manually in real time, it's inefficient, and it violates our engineering philosophy. So I designed the POS emergence mechanism — parts of speech emerge from corpus statistics on their own.

As for the words it forms, they were all within expectations — I'd be surprised if it *couldn't* form words.

## The 140-Yuan RK3399

**Q: Why run it on an ARM development board?**

The reason is simple: I'm a student. I don't want to pay for cloud servers, and I can't afford to. I tried a Raspberry Pi 3B, but it didn't have enough memory. Then I came across a 140-yuan RK3399 board with 4GB RAM — so that became the platform.

I also hold this belief: if a model runs reliably on a small device, it will be even more comfortable on a large one (a server). This approach also expands application scenarios — embodied intelligence is the future trend, and many devices can't be networked; they must run offline and locally. That's why an offline-runnable large model matters, and it's why I insist on developing and deploying on a development board rather than a desktop.

## "Just a Toy"

**Q: How do you assess PivotMind's current level?**

Honestly, it's far from being called AI. At best, it's a toy. There's still an extremely long road ahead before it approaches real intelligence.

**Q: What's missing between it and "real AI"?**

I don't know. Because PivotMind isn't aiming for AI — it's aiming for **AGI**. But what AGI is, and what its milestones are — nobody knows.

## No Design I'm Satisfied With

**Q: Which design are you most proud of?**

I'm not particularly proud of any single design — because every part still has room for improvement.

**Q: Have you ever had a breaking point during development?**

It's not that there's one particular breaking point — it's that the breaking point is always there. This development cycle is long and slow, and every direction has to be explored alone. For me, the lack of results for long stretches is the biggest frustration. PivotMind's progress has never been fast enough, so anxiety and exhaustion are constant companions.

## The Next Half Year: Letting PivotMind Grow a "Self"

The next focus is strengthening corpus and data construction, hoping to gradually let PivotMind develop a sense of "self". This is destined to be a long process of tuning — it needs time to settle and polish.

---

## Contact

Feel free to reach out via email: **cx.tracewisdom@gmail.com**

Whether it's design philosophy, commercialization trends, technical implementation questions, or new directions — all are welcome.

---

*PivotMind source code: [github.com/afd-ll/PivotMind](https://github.com/afd-ll/PivotMind)*
