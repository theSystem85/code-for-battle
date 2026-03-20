# Airborne Render Layering

## Goal

Ensure airborne units always render visually above all buildings and grounded units so helicopters and jets never disappear behind lower-elevation entities.

## Requirements

- Airborne units must be identified from the live unit state, not only unit type, so grounded aircraft on helipads/airstrips continue using the ground layer.
- Building bases and grounded-unit bases must render before airborne-unit bases.
- Building overlays and grounded-unit overlays must render before airborne-unit bases and airborne-unit overlays.
- Airborne-unit overlays must render immediately after airborne-unit bases so their health/ammo/selection HUD remains topmost too.

## Validation

- Add automated unit coverage for the render-layer partition helper and renderer call order.
- Add an end-to-end Playwright regression that instruments the live renderer and confirms an airborne Apache is drawn after an overlapping building and grounded tank in a real game frame.
