- [x] **Bug: terrain and decoration preparation contend for staging memory**
  Reproduce the current dev crash when a partial decoration bake retains the only staging slot, then scrolling requests a cold terrain page. Preempt unpublished decoration work for foreground terrain, preserve published decoration reservations until replacement, release cancelled backing stores, protect visible pages from warm eviction, and use full-quality direct rendering when the resident budget is exhausted.
  Spec: [Terrain cache recovery](../../specs/terrain-cache-recovery.md)
