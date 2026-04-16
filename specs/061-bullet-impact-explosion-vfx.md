# Spec 061: Bullet Impact Explosion VFX Polish

## Context
Bullet impact explosions should look more realistic and visually rich, but rendering must remain performant during heavy combat.

## Requirements
1. Explosion rendering uses layered visuals (plume + bright core) to improve readability and perceived realism.
2. Visual timing uses eased expansion and controlled fade so impacts feel energetic at start and dissipate naturally.
3. Add a lightweight shockwave-style ring variation to avoid a static circular look.
4. Optional ember accents must stay capped at a very low count per explosion to avoid frame drops.
5. Existing performance safeguards remain in place:
   - viewport/frustum culling
   - cached sprite reuse
   - bounded explosion sprite cache growth

## Acceptance Notes
- Multiple simultaneous bullet impacts should still render smoothly on typical desktop and mobile targets.
- No per-frame dynamic canvas sprite generation should be introduced in the hot path.

## Follow-up (2026-04-16): Unit Destruction Timing Sync
1. When a unit reaches `hp <= 0`, keep the unit frozen in-place for `2000ms` before final destruction cleanup.
2. The delayed cleanup moment must trigger both:
   - destruction explosion visual spawn
   - positional explosion audio
3. Wreck registration/remnant creation must occur after the same delay so wrecks and explosion timing stay in sync.

## Follow-up (2026-04-14): Generic Sprite-Sheet Destruction Explosions
1. Add a reusable sprite-sheet animation abstraction that derives tile size and frame grid from asset filename format:
   - `<tileWidth>x<tileHeight>_<cols>x<rows>_<anything>.webp`
2. The animation system must be generic (no explosion-specific metadata/constants inside the parser/renderer).
3. Frame selection is time-based and deterministic (`elapsed/duration`) with left→right then top→bottom traversal.
4. Destruction of units/buildings/factories spawns exactly one centered one-shot animation instance.
5. Explosion sprite-sheet rendering uses additive blending and restores previous blend state after drawing.
6. Expired one-shot animations are cleaned up automatically and should not leak over time.
7. Hot-path rendering must stay performant for large concurrent counts (no per-frame metadata parsing, no per-frame image creation).
8. Sprite-sheet source cropping must remain correct across retina/non-retina displays by using texture dimension-aware source tile calculation, not assumptions tied to canvas DPR.
9. Black background pixels in additive sprite sheets must be treated as transparent in final output (no visible black boxes during explosion playback).
