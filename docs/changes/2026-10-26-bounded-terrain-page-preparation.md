- [x] **Bound terrain-page revisions to dependent sprite sheets**
  Terrain pages now retain immutable preparation snapshots and a bounded local dependency index, so a newer sprite tier invalidates only resident pages that use that sheet.
  Spec: [Sprite streaming and fast-scroll performance analysis](../../specs/138-sprite-streaming-performance-analysis.md)
