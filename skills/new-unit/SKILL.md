---
name: new-unit
description: Add or revise a Code for Battle unit with complete data, production, movement-domain pathfinding, combat, service, HUD, rendering, audio, cheats, AI, persistence, tests, specs, and prompt history. Use for any new ground, air, or water unit or when auditing an incomplete unit integration.
---

# New Unit Implementation Checklist

Use this checklist when adding any new unit type to Code for Battle.

## Data and production
- Add unit stats: cost, health/maxHealth, armor, speed, turn speed/rotation behavior, firepower, weapon ranges, reload times, projectile types, sight/radar visibility, crew capacity, fuel, ammo, repairability, and destruction behavior.
- Add tech-tree requirements and unlock rules so the unit appears only after required prerequisite buildings or milestones.
- Add production-queue integration, including factory routing for its domain (land from Vehicle Factory, aircraft from Helipad/Airstrip as appropriate, ships from naval production buildings).
- Add cheat-console integration so the unit can be spawned and inspected consistently with existing units.
- Make cheat spawning use the unit's movement-domain passability (water units on open water, ground units on land/street, aircraft at a legal pad/strip or explicit airborne spawn). Reuse center-based occupancy checks.
- Add save/load compatibility for any new persistent properties.
- Integrate enemy AI production and use: prerequisite-aware build order, correct production building, target selection, domain-valid movement, resupply/repair retreat, and resumption of the interrupted order.

## Movement and path planning
- Select the correct movement domain: ground, air, or water.
- Ensure pathfinding uses domain-specific passability rules and avoids incompatible terrain.
- Propagate the movement domain through every path entry point: direct player commands, global/attack recalculation, rally/spawn paths, AI, stuck recovery, smoothing/direct-line checks, and formation fallback tiles.
- Test a produced unit from launch tile to a user-set rally point. Audit both mouse-down selection suppression and mouse-up assignment for production buildings, rally flag rendering, tile/world coordinate conversion, and the spawned unit's initial path.
- Include movement domain in path-cache keys, and ensure terrain occupancy is separated or explicitly ignored for the unit's valid domain (for example, a land-oriented occupancy map's water markers must not block ships).
- Ensure occupied tile calculation is center-based: `Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)` and `Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)`.
- Exclude a unit's own occupancy tile from blocking/collision checks to prevent self-blocking reroute loops.
- Make collision lookahead, slide/separation, dodge/stuck recovery, move cursors, and rally-point validation use the same movement-domain passability as pathfinding.
- Configure speed, acceleration/turn behavior, collision radius, selection size, and formation spacing. Size every selection-HUD mode and its cursor hitbox from the rendered sprite bounds so long/wide units fit completely.

## Combat, service, and HUD
- Wire weapon range, minimum range, reload/cooldown, target filters, projectile visuals, sound, and damage attribution.
- Add the unit to aiming-cursor eligibility, use the effective combat range calculation for in/out-of-range state, show target distance/max range, and render any requested selected-unit range indicator.
- Support health depletion/refill, repairability, ammo depletion/refill, fuel depletion/refill where applicable.
- Decide whether the unit needs a type-specific armor or crew-casualty multiplier; verify changes at the actual damage application site rather than only in stat metadata.
- Ensure selection HUD shows health, ammo/fuel/service state, rank/crew state, and domain-specific status.
- Confirm friendly-fire, target priority, guard/attack-move, and forced-target commands behave correctly.

## Rendering and audio
- Add map and sidebar assets, or derive them from supplied assets when directed.
- Treat map and build-button art as two mandatory, distinct camera conventions:
  - **Build-button/sidebar art:** use a photorealistic elevated three-quarter perspective with the entire unit visible. The horizon must always be visible inside the second quarter from the top of the image (25–50% image height). Ships retain a realistic water background.
  - **Map art:** use a strict 90-degree top-down/orthographic view with clean alpha, the entire unit visible, and the unit facing straight downward (south). Do not use an isometric, three-quarter, diagonal, or horizon-bearing map sprite.
- Follow the **Retina sprite quality requirements** section below for every map sprite (mandatory since the tank art overhaul, PRs #740/#742 and the light tank).
- Add rotation animation/facing support matching existing unit conventions. Always default to the single authored strict top-down south-facing map sprite and rotate it programmatically for every angle. Use multiple authored headings only when the user explicitly requests them.
- Add movement effects such as dust, tracks, rotor wash, jet exhaust, wake, or waves as applicable.
- Verify effect layer order (for example, wakes below a ship), emit movement effects only after actual displacement/current speed, and let residual particles fade after stopping.
- Add damage smoke/fire and destruction animation, wreck or sink behavior, and sound hooks.
- Explicitly decide whether the new unit/building emits smoke; do not inherit smoke spots from source artwork assumptions.

## Canonical facing direction (mandatory)
Every image in `public/images/map/units/` (hull/wagon, turret, barrel, single-image body, rotor, every resolution and every prepared `@1x/@2x/@3x` variant) faces **SOUTH**: the front, nose, bow or muzzle points to the bottom of the image. This was learned the hard way: the M2/light tank shipped with a north-facing hull and turret and drove backwards in game (fixed in 0.58.0), and the mine layer was north-facing and only "worked" through a `+ Math.PI / 2` renderer hack while its wreck rendered backwards.

- **Renderer rule:** rotate a south-facing image with `unit.direction - Math.PI / 2` (direction 0 = east, PI/2 = south). Never compensate a wrongly oriented asset with a different offset; rotate the asset 180° instead (re-encode with `webpOptionsForSprite` settings, q95 sharp-YUV) and mirror any source-pixel anchors (`x' = width - x`, `y' = height - y`), e.g. `turretMountPoint` in `src/tankImageConfig.json`.
- **Register the facing:** add every new asset to `UNIT_SPRITE_FACING` in `src/rendering/unitSpriteFacing.js` as `'south'` (or `'symmetric'` for rotors). `tests/unit/unitSpriteFacing.test.js` fails if an asset is missing, if a new non-south entry appears, or if any layered tank part is not south-facing. The only allowed exceptions are the frozen legacy aircraft assets (Apache, F-22, F-35); do not grow that list.
- **How to verify the front visually (do not trust the generator):** before committing, identify the front by real features, not by guesswork: gun mantlet / barrel port, driver hatch, headlights, cab, nose, bow. Hull and turret must agree (turret gun port on the same side the barrel leaves). Then spawn the unit in game, order it to drive east, south, west and north, and take a zoomed Playwright screenshot of each leg next to Tank V1 (whose front is known-good); the unit must drive front-first in all four. Store the screenshots with the PR.
- Re-run `npm run make:prepared-sprites` after rotating so the `@1x/@2x/@3x` variants and manifest match the source.

## Retina sprite quality requirements
These rules come from the tank image overhaul (#740, #742) and the light tank. Every new map sprite must meet them.

- **Plain paint by default:** map sprites use a solid single-colour paint scheme (e.g. plain desert tan) with **no camouflage pattern**, unless the user explicitly asks for camouflage. Grade it only mildly to fit the game palette; do not add patterns. Stick to the vehicle's real silhouette (e.g. a Bradley has a boxy turret, not a round one).
- **Three densities, served by DPR:** register the sprite in `scripts/build-prepared-sprites.mjs` and run `npm run make:prepared-sprites`. This writes `@1x/@2x/@3x` WebP variants under `public/images/prepared/` plus the manifest entry; the runtime picks the variant matching the device pixel ratio. Update the entry count assertions in `tests/unit/preparedSpriteImageRenderers.test.js`.
- **Source resolution:** the committed source in `public/images/map/units/` must be at least as large as the @3x output (3 × logical size, e.g. 96 px for a 1-tile unit). Never upscale to reach @3x; if the generated art is too small, say so in the PR and docs and state the effective resolution. Downscale with premultiplied-alpha Lanczos (avoids dark fringes) and only a mild unsharp mask (radius ≈ 0.8, ≈ 50–60%).
- **Unit WebP settings:** unit sprites use q95 with sharp-YUV chroma (`webpOptionsForSprite`); do not lower this for camouflage or thin barrels.
- **Rotations are generated at runtime, never stored:** turreted tanks add their variant to `TANK_ROTATION_VARIANTS` (`src/rendering/tankRotationCache.js`) and the tank image renderer; other units rotate the single south-facing sprite programmatically. Do not commit pre-rotated frames.
- **Layered hull/turret/barrel units** (tank family): ship three separate images, all facing south (front down), drawn at the same scale:
  - `wagon` = hull only with tracks; **no turret or gun baked in** (reject generations with a baked-in turret).
  - `turret` = turret only, no barrel; the turret rotates around its image center, so crop it so the image center is the turret pivot.
  - `barrel` = barrel only, vertical, muzzle down.
  - Mount points in `src/tankImageConfig.json`: `turretMountPoint` = turret-ring center on the hull; `barrelMountPoint` = barrel *center* on the turret, placed so the breech starts just under the mantlet (barrel top between ~85% and 100% of turret height). **The barrel must never be drawn over the turret body.** `muzzleFlashOffset` = muzzle tip in barrel pixels.
  - Check the turret footprint against the hull's turret ring (the turret should cover the ring, not overhang the hull sides) and scale the turret if needed.
  - Snap the unit center to device pixels (the renderer already does this through `snapToDevicePixel`).
- **Sharpness and contrast checks:** compare the new sprite with Tank V1 (mean RGB, saturation, luminance spread) and grade it to the same palette before export; inspect zoomed Playwright crops at DPR 1 and DPR 3 next to Tank V1 on grass and on road. The unit must read clearly at DPR 1 and not look washed out or blurry at DPR 3.
- **Chroma-key cut-outs:** generate on a flat, uniform background color (pure blue works best for desert tones; avoid green with green camo). Key by "blueness", un-mix the background color from anti-aliased edge pixels, then despill. Check edges on a contrasting background at 4× zoom. Example scripts: `docs/asset-sources/light-tank-cutout.py` and `light-tank-build.py`.
- **Grok Imagine (xAI) prompting:** use at most 1–2 generation attempts per asset, so prepare prompts carefully:
  - Map sheet: "strictly top-down orthographic, 90-degree overhead view, no perspective", "soft even studio lighting from above, no cast shadows", flat solid background color with no text or grid, one row of three widely separated parts (hull only / turret only, no gun / barrel only), front pointing DOWN, same scale, solid desert sand paint (#C8A46A-like) with no camouflage unless requested. Attach the Tank V1 sheet (`docs/asset-sources/tank-v1-leopard-spritesheet.webp`) as a style reference when the tool supports it.
  - Ask for "solid single-colour paint (plain desert tan), NO camouflage pattern" unless camouflage was explicitly requested, and describe the real turret shape (e.g. "boxy rectangular turret with a TOW launcher box on its left side").
  - Generated turrets are often oversized relative to the hull: scale the turret so it matches the real vehicle's proportions (for a Bradley about 40–45% of the hull length) and put the pivot at the turret-ring centre, padding the turret image if a side box (TOW launcher) shifts its centre.
  - Thin parts (barrels) are mostly edge pixels: despill hard (for tan paint clamp blue below green below red) and check them on a dark background.
  - Say explicitly "the hull has NO turret and NO gun" — models tend to bake the turret into the hull.
  - Build button: photorealistic elevated three-quarter view in the desert with the horizon in the 25–50% band. A 16:9 result must be extended to the square button (extend sky/ground, do not stretch the vehicle) and checked in the sidebar.
  - Keep the raw sheet in `docs/asset-sources/` and record the prompt in `prompt-history/`.

## Validation
- Add/update unit tests for reusable logic and production/tech-tree behavior.
- Test domain-aware cheat spawning, rally paths, AI production routing, low-health service retreat/resume, renderer source selection/rotation, and visual-effect anchor calculations where applicable.
- Take Playwright screenshots at DPR 1 and DPR 3 of the unit in game next to existing units, plus the build button, and inspect them before committing.
- Run `npm run test:unit` and fix root causes.
- Run `npm run lint:fix:changed` and manually resolve remaining lint issues.
- Update the matching TODO file and specs, and record the prompt in `prompt-history/`. A new unit is a feature: add it under the right area heading in `TODO/Features.md` (above Done) as `- [ ] **Title** — description` plus `Spec: [Title](../specs/....md)` or `Spec: none`. Do not append it to Done or to the end of the file.
