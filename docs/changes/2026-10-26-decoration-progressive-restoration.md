# Restore progressive map decorations

## Bug

- [x] **Restore idle decoration publication** — guarantee bounded tile-by-tile progress when the camera is still, including browsers without `requestIdleCallback` and idle callbacks that repeatedly report too little time, while continuing to skip timer work during scrolling and discard only unfinished off-screen pages.
  - Spec: [Sprite Streaming Performance Analysis](../../specs/138-sprite-streaming-performance-analysis.md)

## Feature

- [x] **Show coarse decoration sprites first** — publish existing prepared coarse map-sprite atlas pages through the shared sprite lifecycle before atomically upgrading to final pages with unchanged logical geometry and placement.
  - Spec: [Sprite Streaming Performance Analysis](../../specs/138-sprite-streaming-performance-analysis.md)

## Root cause and lifecycle

The opportunistic scheduler required an idle deadline with more than two milliseconds remaining before doing any work. Its `setTimeout` fallback supplied no deadline, and repeated short idle deadlines had the same effect, so a visible chunk could remain queued forever and no decorative canvas was ever published. The scheduler now consumes browser-reported spare capacity while the camera is moving, but when the camera is still it guarantees a bounded single-tile step even without an idle budget. This fallback cannot block a scrolling frame. Completed canvases remain published until their replacement is complete; viewport culling continues to release only unfinished staging work.

Prepared map-sprite manifests now select their coarse page for the initial configuration. That page is published and used to build the normal integrated sprite metadata, buckets, decoration pools, and raster pages. A generation-guarded follow-up runs the same configuration and publication pipeline for the final page. Both tiers draw into the manifest's stable logical tile geometry, and the renderer retains the old decorative page during the asset-only replacement, preventing a blank swap.

## Follow-up hardening

- Idle callbacks are requested with a 120 ms timeout so a saturated render loop cannot starve decoration preparation forever; a timed-out deadline reports no headroom and only takes the still-camera path.
- The still-camera fallback advances within a fixed 3 ms budget per callback (always at least one tile) instead of a single tile, so a 16×16 chunk publishes in a fraction of a second instead of several seconds.
- Decorative pages are prepared outside the base pass and are therefore not tracked as page dependencies. Every sprite-tier publication now bumps a decorative asset generation that is part of the decorative page key, so the coarse → final upgrade re-prepares visible decorative pages on idle capacity while the coarse page stays drawn until the replacement is complete.
- A reconfiguration never downgrades a sheet whose final prepared page is already decoded; coarse-first applies only to sheets that are not yet resident.

## Performance verification

The hot render path adds one boolean assignment per frame and no per-entity work or allocations. Idle preparation remains tile-bounded and does not run from timer fallbacks while the camera is moving. Hardware-backed 75 FPS acceptance remains pending on Patrick's qualifying GPU, as required; no software GPU benchmark was run here.
