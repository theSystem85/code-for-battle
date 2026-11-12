# Decoration cache restoration

## Bug

- [x] **Restore decorative images after scrolling**
  Reset evicted decoration publication state to rebuild complete images on return, and composite decorations after all ground pages so neighboring padding cannot crop sprite edges.
  Spec: [Decoration cache restoration](../../specs/2026-11-12-decoration-cache-restoration.md)

Regenerated the inherited soil nature sheet and its prepared tiers using the existing 85%-quality WebP tooling: its alpha silhouette differed from recorded source extraction at 98 pixels after updating to current dev. The exact-alpha test remains unchanged.

Validation: lint, all 5,820 unit / 5,906 unit-and-integration cases, 21 prepared sheets, and 11 focused browser checks pass. Full browser coverage remains incomplete after three Apache failures. Apple M1 Metal hardware was verified; the scrolling diagnostic measured 59.723 FPS at DPR 2 in an approximately 60 Hz session. Strict 75 FPS acceptance remains pending; see the spec for commands and frame-time evidence.
