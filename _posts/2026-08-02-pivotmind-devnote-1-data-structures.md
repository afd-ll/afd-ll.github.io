---
layout: post
title: "Slicing the Brain: PivotMind's Core Data Structures"
date: 2026-08-02
description: "PivotMind development note #1 — dissecting the C structs at the heart of a pure-C brain-inspired engine: nodes, edges, hash indexes, and why they're designed this way"
---

*PivotMind (玄枢) Development Note #1 — no demos, just putting the core data structures on the dissection table.*

In the [interview](https://afd-ll.github.io/2026/08/02/pivotmind-interview/), I said PivotMind is "just a toy" — so let's do something a toy is good at: **slice the brain open**. No runtime demos; here are the core C data structures, with line-by-line explanations of why they're designed this way. People who know their craft will recognize the weight of this immediately.

---

## 1. The Node: ReasoningNode — Everything a Neuron Owns

In PivotMind, a node *is* a neuron. The most central struct in the entire engine (`include/huarong_topology.h`):

First, the three small structs it depends on — **the edge, the connection-hash entry, and 3D confidence**:

```c
// Edge: one synapse
typedef struct Edge {
    struct ReasoningNode* target;  // pointer to target node
    float weight;                  // connection strength (Hebbian co-occurrence)
    float motivational_bias;       // motivational bias
    float confidence;              // edge confidence
} Edge;

// Connection-hash entry: fast lookup "which slot in edges[] is this target?"
typedef struct {
    void* target;     // pointer to target node
    int   index;      // index into edges[] array
    int   is_deleted; // tombstone (reusable after deletion)
} ConnHashEntry;

// 3D confidence: cognitive (prediction) + affective (satisfaction) + exploratory (novelty)
typedef struct {
    float predictive_accuracy;  // cognitive layer
    float user_satisfaction;    // affective layer
    float novelty_bonus;        // exploratory layer
    float combined;             // combined
} CognitiveConfidence;
```

Then the node itself:

```c
typedef struct ReasoningNode {
    int node_id;               // unique node identifier
    char* concept;             // concept name (e.g. "时间" (time), "关羽" (Guan Yu) — Chinese-first)
    float* features;           // feature vector (512 dims)
    int feature_dim;           // feature dimension

    // Edges — a single Edge array replaces four parallel arrays
    Edge* edges;               // edge array (target/weight/bias/confidence)
    int edge_capacity;         // edge array capacity
    int edge_count;            // edge count

    // Connection hash table — O(1) lookup of target index in edges[]
    ConnHashEntry* conn_hash;  // open-addressing hash
    int conn_hash_mask;        // bucket count-1 (2^n-1)
    int conn_hash_entries;     // entry count

    // Node state
    float activation;          // current activation (the core quantity of the diffusion engine)
    float confidence;          // confidence
    CognitiveConfidence* cognitive_confidence;  // cognitive+affective+exploratory
    float valence;             // valence (-1.0 ~ +1.0)
    float heat;                // heat (lowered each time selected — path diversity)
    int selection_count;       // cumulative selections by greedy traversal

    // Emergent POS system (parallel to hardcoded POS, supports polysemy)
    int   emergent_class_count;              // actual class count
    int   emergent_class_ids[4];             // emergent class IDs (from feature clustering)
    float emergent_class_confs[4];           // per-class confidence

    // Template node metadata (valid only in the grammar-template topology)
    int   tpl_pos_len;             // POS sequence length (2-4)
    int   tpl_pos_seq[4];          // slot POSTags
    char  tpl_connectors[4][TPL_CONNECTOR_BUF];  // connector words between slots ("的/是/了")
    int   tpl_emergent_slot[4];    // emergent-class slots (soft polysemy matching)

    // Meta
    int is_reversible;         // reversible operations supported
    int is_visited;            // visited during search
    volatile int is_cooled;    // cold flag: edge data frozen to file (lazy memory)
} ReasoningNode;
```

### Design notes, block by block

**1. `concept` is `char*`, not a fixed array** — concept strings live in a **string pool** (StringPool). Reason: if 50,000 nodes each malloc'd their own strings, fragmentation and duplicate storage would eat the precious 4GB on the board. The string pool allocates once, uses reference counting, and deduplicates atomically.

**2. Why a single Edge array instead of four parallel arrays** — the early version used four parallel arrays (target[]/weight[]/bias[]/confidence[]); later merged into a single `Edge` struct array. Reason: **cache locality**. When the diffusion engine walks a node's neighbors, a single struct array is sequential memory access; four parallel arrays require jumping between four pointers. On a weak ARM core, that difference is several times the traversal speed.

**3. The connection hash table `conn_hash`** — the edge array is a linear table; finding a target is O(edge count). PivotMind attaches an **open-addressing hash table** per node (key = target pointer, value = edges[] index, with tombstones), bringing lookup to O(1). The cost is extra hash memory per node — but it buys real-time traversal over a 50,000-node graph.

Note the lurking hazard: **the hash stores *indexes* into edges[]** — once a node is deleted and the edge array shifts, those indexes go stale. That's exactly the seed of a deadlock bug and a string of segfaults (teaser for a later dev note).

**4. `activation` is the core quantity** — the whole diffusion engine revolves around it: anchor an input word → propagate activation along edges → sort by activation to produce output. `heat` and `selection_count` are the anti-repetition pair — the more a node is selected, the lower its heat, the more diverse the paths, keeping PivotMind from saying the same words forever.

**5. `emergent_class` is the "emergent POS" system** — PivotMind ships no vocabulary (engineering philosophy), so parts of speech (noun/verb/adjective) also **emerge from feature-vector clustering**. A word can belong to multiple classes ("计划" (plan) is both noun and verb), expressed with 4 slots + confidences — the substrate for soft polysemy matching.

**A note on language**: PivotMind's corpus is currently Chinese-first (Fortress Besieged, *Those Stories of the Ming Dynasty*, etc.); English words are a small minority. So tokenization, character-topology promotion, and POS emergence primarily serve Chinese: single characters are the base unit, two-character words emerge from co-occurrence statistics ("时间" time, "关羽" Guan Yu), while English words go straight into the word layer for classification only — they don't participate in character-level composition.

**6. `is_cooled` (volatile)** — the cold-node flag. When board memory is tight, PivotMind "freezes" a node's edge data into a file to free RAM (lazy memory); this flag tells the system "this node is alive, its edges are just on disk."

There's a subtle point worth clarifying: **volatile is *not* for thread synchronization** (cross-thread visibility is guaranteed by the rwlock — relying on volatile under ARM's weak memory model would be dangerous). Its actual role is to **tell the compiler**: this variable may be asynchronously modified in a disk I/O callback (the node_cache freeze/thaw path) — don't optimize it into a register. In other words: **the lock governs threads, volatile governs the compiler.**

---

## 2. The Topology: SubTopology — One Layer of Brain

```c
typedef struct SubTopology {
    int topo_id;                      // unique topology ID
    TopologyType type;                // topology type (vocabulary/semantic/concept/template...)
    const char* name;                 // topology name
    HuarongTopologyNet* net;          // underlying network (node array + edges)
    NodeHashTable* node_hash;         // node hash table (fast lookup)

    int priority;                     // inference priority (1-10)
    float weight;                     // weight within master (0.0-1.0)
    int is_active;                    // active or not

    int total_activations;
    float avg_activation_value;
    float recent_activation;     // leaky integrator (recency-based novelty)
    time_t last_used;

    pthread_rwlock_t rwlock;          // sub-topology-level read-write lock
} SubTopology;
```

**Design points:**

- **Array + node_hash dual structure** — the underlying network is a "node array" (contiguous memory, fast traversal) with a hash table on top (fast lookup). Arrays for cache locality, hashes for O(1) lookup — we want both.
- **priority/weight/is_active** — not all topologies participate equally. The vocabulary topology has high priority (input must anchor to words first), the semantic topology handles association, the template topology handles assembly. Which topologies are "awake" is scheduled by the brainstem.
- **Sub-topology-level rwlock** — the result of a later refactor: early versions shared one global lock across all topologies, and the dialog thread vs. self-learning thread lock contention deadlocked (see a later dev note). Now each sub-topology has its own read-write lock; only cross-topology operations take the global lock.

---

## 3. The Master: The Nested Skeleton of 12 Topologies

The master topology is where the "TraceWisdom Network" (溯智网络 — nested multi-topology) idea lands:

```c
typedef struct MasterTopology {
    StringPool* string_pool;      // shared string pool
    SubTopology** sub_topologies; // sub-topology array
    int sub_topo_count;
    ...
    pthread_rwlock_t rwlock;      // global read-write lock
} MasterTopology;
```

**The lock-ordering comment (30 lines of hard-won warning in the code)**:

```c
/* ========== Thread-safe lock ordering (strictly enforced; violators deadlock) ==========
 * Level 1: MasterTopology.rwlock    — global read-write lock
 * Level 2: HuarongTopologyNet.mutex — network-level mutex
 * Level 3: HuarongTopologyNet.node_locks[] — per-node lock pool
 * Reverse ordering (e.g. requesting a network lock while holding a node lock) is FORBIDDEN!
 * ============================================================================== */
```

This comment is not decoration — it has actually deadlocked. **glibc does not allow a nested read lock inside a write lock** (it returns EDEADLK, but the code didn't check the return value), and while loading a 50,000-node state file, the third call deadlocked permanently. The bug hid for a long time, only surfacing once the knowledge base doubled in size (details in a later note).

---

## 4. Ending: A Trade-off

There's one major trade-off in this data-structure design I want to highlight: **linked list or array for edges?**

Linked lists insert and delete fast but traverse slowly and are cache-unfriendly; arrays traverse fast but deletions require shifting. Early on I used linked lists, then switched everything to arrays + hash indexes — because the diffusion engine spends 90% of its time **traversing**, not inserting or deleting.

But arrays have a cost: **deleting a node shifts edges, and edge indexes go stale** — which directly caused the deadlock bug and a string of crashes (segfault 139). **Why I ultimately stuck with arrays? Next post.**

---

*Next: Paper simulation — how "if A>B and B>C then A>C" travels through the 12-layer topology.*
*Then: The design trade-offs of the 14 brain regions — why is there no cerebellum? Why does memory use a ring buffer?*
