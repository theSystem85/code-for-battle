# Mobile scroll stutter recovery

## Requirement
Map panning on touch devices, specifically iPhone 13 Pro Max, must remain smooth during normal scrolling and during combat-heavy scenes with bullets, animations, and explosions.

## Implementation notes
- Mobile terrain chunks use the same 16-tile chunk span as desktop to reduce per-frame chunk count and draw calls while retaining a larger mobile cache to avoid edge eviction during pans.
- Chunk render-state checks use an incremental numeric hash instead of array collection plus joined strings, preserving mutation detection with lower allocation and GC pressure.
- The mobile frame watchdog is a stall-only fallback and is disabled during active scroll and visible combat effects so it cannot compete with native `requestAnimationFrame` pacing.

## Verification
- Required unit suite: `npm run test:unit`.
- Required changed-file lint autofix: `npm run lint:fix:changed`.
