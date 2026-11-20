- [x] **Bug: black map areas and misaligned sprites at iPhone startup**
  Reapply the overlay scale before drawing, bound iOS terrain preparation, and fall back to complete CPU terrain when page allocation or GPU upload fails.
  Spec: [Terrain cache recovery](../../specs/terrain-cache-recovery.md)
