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
