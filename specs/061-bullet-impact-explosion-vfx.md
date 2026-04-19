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

## Follow-up (2026-04-19): Freeze-Window HP Visibility
1. Units in the delayed-destruction freeze window (`hp <= 0` with destruction not yet finalized) must not render a health/HP bar.
2. This suppression applies even if the destroyed unit remains selected during the freeze window.

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

## Follow-up (2026-04-18): Combat Decal Sheet Visibility and SSE Access
1. The bundled combat decal sheet `public/images/map/sprite_sheets/debris_craters_tracks.webp` must be listed in the indexed/default SSE static-sheet sources so it is selectable and editable in the Sprite Sheet Editor without manual local setup.
2. Black-key transparency processing for integrated sprite sheets must support sheet-specific thresholds so very dark decal art can preserve visible marks while still removing the black sheet background.
3. The bundled combat decal sheet must use tuned black-key thresholds that keep `impact`, `crater`, and `debris` details visibly readable on terrain tiles instead of keying out most of the decal itself.

## Follow-up (2026-04-18): Crater Priority and Default Combat Decal Fallback
1. A tile that already contains a `crater` decal must not be downgraded to `impact` by later projectile-hit decal events on that same tile.
2. Howitzer-fired shells must always stamp a `crater` decal on their impact tile rather than an `impact` decal.
3. Artillery turret-fired shells must always stamp a `crater` decal on their impact tile rather than an `impact` decal.
4. Persistent `impact`, `crater`, and `debris` decals must continue to render through the bundled combat decal sheet even when custom sprite sheets are disabled.
5. When custom sprite sheets are enabled but provide no decal-tagged tiles for `impact`, `crater`, or `debris`, runtime must fall back to the bundled `images/map/sprite_sheets/debris_craters_tracks.json` metadata and its corresponding sheet image instead of dropping back to flat-color decal placeholders.

## Follow-up (2026-04-18): Remove Legacy GPU Decal Underlay
1. When procedural GPU terrain rendering is active and decals are rendered by the 2D map pass, the WebGL terrain batch must not also emit its legacy flat-color decal fallback for those same tiles.
2. In the non-custom-sprite path, a decal tile must show only the terrain tile plus the decal art itself; no semi-transparent gray/brown intermediate layer may remain beneath the decal.

## Follow-up (2026-04-18): Water Tile Decal Guard
1. `impact` decals must not be stamped on tiles whose terrain type is `water`.
2. `crater` decals must not be stamped on tiles whose terrain type is `water`.
3. `debris` decals remain allowed for destroyed structure footprints, even when any covered footprint tile is `water`.
