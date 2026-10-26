- [x] **Bound streamed sprite memory and lifecycle**
  Add a reference-counted resource store that budgets every native allocation phase, deduplicates atlas views, replaces tiers atomically, evicts unused bytes, and deterministically closes discarded images.
  Spec: [Sprite streaming and fast-scroll performance analysis](../../specs/138-sprite-streaming-performance-analysis.md)
