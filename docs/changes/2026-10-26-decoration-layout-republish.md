- [x] **Republish decoration layout after sheet reconfiguration**
  Loading a save or applying sprite sheets after the map was published left the prepared decoration layout retired, so decorations and city buildings vanished; the lifecycle now republishes it, and e2e tests prepare layouts explicitly.

Spec: [Sprite streaming performance analysis](../../specs/138-sprite-streaming-performance-analysis.md)
