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
4. While frozen, the unit must remain visible with its normal live-unit appearance (no wreck grayscale/dead replacement during the delay window).
5. During the freeze window, smoke output is intentionally intensified and darkened versus normal critical-damage smoke.
6. Freeze-state tanks must preserve their pre-destruction turret/body orientation during the delay window, and wreck creation must inherit that same frozen turret/body angle.
7. Destruction explosion scale is increased by 30% relative to baseline and must render above the exploding unit image layer.
8. Destruction sprite-sheet textures must be prewarmed/cached before delayed explosion start to eliminate first-frame stutter.
9. Black-edge/halo artifacts around fire/explosion sprite content should be aggressively suppressed during sprite processing so the map render matches SSE preview quality.

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

## Follow-up (2026-04-17): Persistent Terrain Decals from Combat Events
1. Projectile impacts from unit-fired attacks stamp a persistent `impact` decal on the impacted tile.
2. Unit destruction stamps a persistent `crater` decal on the unit's explosion tile.
3. Building/factory destruction stamps persistent `debris` decals across every tile in the destroyed footprint.
4. Each map tile stores at most one decal at a time; newer decal events replace older tile decals.
5. Decal variation is selected pseudo-randomly using map-seed-driven deterministic selection so outcomes are reproducible for a given simulation.
6. Map tile save/load payload must persist decal state (including deterministic variant metadata) so reloads retain exact visual decals.
7. Rendering order must keep ore/seed overlays above decal overlays when both exist on the same tile.
