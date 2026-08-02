---
layout: post
title: "Arrays vs. Linked Lists: The Lock and Deadlock That Almost Made Me Quit"
date: 2026-08-02
categories: [dev-notes]
description: "PivotMind dev note #3 — honoring the teaser from #1 and #2: why connection edges use arrays. The price of ignoring EDEADLK, and how I traced a bug that died on the 3rd call"
---

*PivotMind (玄枢) Dev Note #3 — honoring the teaser left in both #1 and #2.*

The teaser: **why do connection edges stick with arrays? What happened to the dynamic linked list?** And the deadlock that was tied to arrays.

Let's tell the whole story today.

---

## 1. The original linked list

PivotMind's early connection edges used a **dynamic linked list**: each node carried a chain of edges, and both insertion and deletion were easy — inserting at the head is O(1), deleting an edge is O(1). Sounds perfect.

But once it ran, the problem surfaced:

**Traversal was too slow.**

The diffusion engine (PivotMind's core — activation propagation) spends 90% of its time **traversing a node's neighbors**. Linked-list nodes are scattered in memory; each step to the next node jumps a pointer — cache-hostile. On a weak ARM core, the same traversal over a linked list is several times slower than over an array.

So I did a major refactor: **edges became a contiguous array (Edge[]), with a hash table (conn_hash) per node for fast lookup**. Traversal walks the array (sequential memory, cache-friendly), lookup goes through the hash (O(1)) — we wanted both, so we built both.

```
Linked list: insert/delete O(1), slow traversal (cache-hostile)
Array:       fast traversal (sequential memory), lookup via conn_hash (O(1))
             cost: deletion shifts elements, indexes go stale
```

## 2. The cost of arrays: stale indexes

Arrays have a problem linked lists don't: **deleting an element shifts everything after it — every index changes.**

conn_hash stores "the index of the target node in edges[]". Once a node is deleted and the edge array shifts, those indexes point at the wrong places — worst case, out of bounds.

My handling at the time: maintain conn_hash synchronously on deletion (tombstones + remapping). But that mechanism had a **hidden flaw** — it worked fine on the "normal deletion path", yet couldn't defend against misuse from another path. And that path had nothing to do with arrays directly — it was a **lock problem**.

## 3. The deadlock: a glibc trap

The story begins while loading a 130MB state file.

PivotMind's cross-topology links are handled by `master_add_cross_link`, which works **while holding a write lock**. Internally it calls `cross_link_exists` to check whether a link already exists — and that check function takes **another read lock** on its own.

Here's the problem: **glibc's read-write lock does not allow taking a read lock inside a write lock** — it returns EDEADLK (35) instead of blocking.

The code didn't check the return value. So this happened:

1. `cross_link_exists` called inside a write lock → its internal rdlock returns EDEADLK (ignored)
2. It keeps reading data (data read "without a lock" — which happened not to crash)
3. At the end of the function it calls unlock — **unlocking a lock it never acquired** (the reader count goes negative)
4. Lock state corrupted (`__readers = -14`)
5. The next time any thread tries to take a write lock — **permanent deadlock**

And the trigger condition is ironic: **with fewer than 3 cross-topology records it never triggers** (the early 70MB state file had 0 cross-topology records — so this bug hid for months); once the knowledge base doubled, the state file grew to 130MB with 3,593 cross-topology records — **the 3rd call died every time**.

A bug hidden for months, exposed only by the knowledge base doubling in size.

## 4. The fix: a nolock variant

The fix was clean: split `cross_link_exists` into two versions —

```c
// Pure check, takes no lock (for callers already holding the write lock)
static int cross_link_exists_nolock(MasterTopology* master, ...);

// External wrapper: takes the read lock itself
int cross_link_exists(MasterTopology* master, ...) {
    pthread_rwlock_rdlock(&master->rwlock);
    int r = cross_link_exists_nolock(master, ...);
    pthread_rwlock_unlock(&master->rwlock);
    return r;
}
```

`master_add_cross_link` was already under the write lock, so it now calls the `nolock` version internally — **no read lock inside a write lock**. The lock-ordering problem vanished.

The first load after the fix produced a line in the log that the 3rd-call-deadlock had never lived long enough to see:

```
[状态加载] 完成: 58363 节点, 730754 链接, 耗时 1 秒
```

130MB, 3,593 cross-topology records, 58,363 nodes — passed in one go. The moment I saw that log line, the knot that had been in my stomach for hours came loose: the lock state hadn't corrupted again, `__readers` never showed -14. **A fix that split one lock into two cured a ghost that had been hiding for months.**

## 5. So why still arrays?

The deadlock had nothing directly to do with arrays (it was lock misuse), but the "stale index" hazard of arrays is real. Why didn't I go back to linked lists in the end?

**Because traversal is everything.** PivotMind's diffusion engine, PFE's graph search, word-consolidation scans — all traversal-dominated. Sacrificing traversal speed for insertion/deletion convenience (which rarely happens in practice) is losing the war to win a skirmish.

The right solution isn't going back to linked lists — it's patching the array's weaknesses:

- Tombstones for deletion (conn_hash's `is_deleted`), with lazy cleanup
- The hash stores indexes; remap on deletion
- Every operation that may change the edge array goes through the locked path (lock-ordering discipline)

Array + hash + tombstones + lock discipline — **more complex than a linked list, but an order of magnitude faster**. This is the path PivotMind chose.

---

## Lessons

1. **Quantify performance trade-offs**: the linked list *looks* flexible, but your workload is 90% traversal — choosing the array is choosing the right workload
2. **Check lock error return values**: glibc's EDEADLK is not decoration; ignoring it leaves a ghost bug where "the data happened not to crash, but the lock is broken"
3. **Knowledge scale is the testing touchstone**: 70MB can't surface this bug; 130MB dies on the 3rd call — PivotMind's test standard should be "the largest state file runs", not "the small file runs"

---

*Next: the "Building PivotMind from Zero" series officially opens — how words grow out of statistics (Hebbian emergence).*
