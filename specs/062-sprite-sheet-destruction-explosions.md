# Spec 062: Generic Sprite Sheet Destruction Explosions

## Context
A new explosion sprite sheet asset was added at `public/images/map/animations/64x64_9x9_q85_explosion.webp`. The game needs a reusable animation system that derives metadata from filename conventions and can render many concurrent instances efficiently.

## Filename Convention
`<tileWidth>x<tileHeight>_<cols>x<rows>_<anything>.webp`

Example: `64x64_9x9_q85_explosion.webp` => tile `64x64`, grid `9x9`, `81` frames.

## Requirements
1. Implement generic filename parsing for tile width/height and columns/rows.
2. Compute `frameCount = cols * rows` from parsed metadata; no hardcoded values.
3. Add a reusable sprite sheet animation abstraction that supports:
   - texture path
   - tile dimensions
   - columns/rows
   - frame count
   - duration in seconds
   - loop flag
   - scale multiplier
4. Frame selection must be time-based using simulation time and progress left→right, top→bottom.
5. Render in world space centered on the effect position; default world size is one tile.
6. Use additive blending so black background contributes nothing (ONE, ONE equivalent behavior).
7. Restore blend/composite state after animation rendering.
8. On destroyed unit/building/factory, spawn exactly one one-shot explosion animation at center position.
9. Automatically remove completed one-shot animations.
10. Keep runtime performance suitable for high-concurrency effects (e.g., hundreds of simultaneous explosions).

## Notes
- Explosion-specific behavior (asset choice and spawn timing) belongs to destruction hooks, not in the generic animation core.
- Generic animation code must remain reusable for any sprite sheet filename matching the convention.
