# Bugs

A bug is something that is broken or that behaves contrary to intended or specified behavior. Polish, performance, UX, refactors, and balance of working features belong in [Improvements.md](Improvements.md). New capabilities belong in [Features.md](Features.md).

Open work is grouped by game area. Finished work is under [Done](#done) in the same area order. Add a new item under the matching open heading, not at the end of the file:

    - [ ] **Short title** — One-line description.
      - Spec: none

When a spec exists, replace `Spec: none` with a relative link such as `[Title](../specs/021-f22-raptor-unit.md)`. Do not invent a spec file. When the work is finished, mark the checkbox `[x]` and move the entry under Done for that area.

## Contents

- [Rendering and WebGPU](#rendering-and-webgpu)
- [Units and Combat](#units-and-combat)
- [Air and Jets](#air-and-jets)
- [Economy and Buildings](#economy-and-buildings)
- [AI](#ai)
- [UI, Sidebar, and Settings](#ui-sidebar-and-settings)
- [Missions and Campaign](#missions-and-campaign)
- [Saves and Replay](#saves-and-replay)
- [Done](#done)

## Rendering and WebGPU

- [ ] **When the game is paused, rotating the screen should trigger a fresh** — map render so the canvas is drawn in the new orientation.
  - Spec: [Paused Rotation Render Refresh](../specs/024-paused-rotation-render/spec.md)

## Units and Combat

- [ ] **Defense turrets should not fire through buildings; block shots when line of** — sight is obstructed for player and AI turrets.
  - Spec: none

- [ ] **Rocket tanks should advance into range and fire through obstacles; attack cursor** — should show out-of-range targets for all units.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [ ] **Tanks must respect building line-of-sight** — blocked shots should prevent firing for both player and AI and trigger repositioning until clear.
  - Spec: none

## Air and Jets

- [ ] **F22 follow-up (2026-02-25)** — enforce grounded taxi pathfinding strictly to street/airstrip tiles with robust parking fallback routing; fix F22 to perform repeated stand-off attack bursts until rocket ammo is empty; ensure airborne F22 never imparts push/separation forces to ground units; ensure F22 attack movement circles target at distance between bursts instead of flying directly over target.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [ ] **F22 validation follow-up** — user-confirmed regressions remain on runway sequencing (`A4`), takeoff/landing motion profile (`A7`/`A8`/`A9`/`A10`), post-takeoff approach continuity (`A11`), ground push behavior (`B3`), and combat wave orbit behavior (`B4`); additionally unclear pending checks for `A5`/`A6`/`B1`/`B2`/`C2`/`C3`/`C4`.
  - Spec: [F22 runway robustness and combat command reliability](../specs/048-f22-runway-robustness-and-combat-command.md)

- [ ] **Prevent multiple Apaches from landing on the same helipad; show blocked cursor when hovering over occupied helipads.**
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [ ] **Rocket tank rockets should detonate on airborne targets and stop firing at** — move destinations (range and impact behavior regression).
  - Spec: none

- [ ] **Airborne units must never collide with each other or take impact damage;** — they should only use predictive, position-based avoidance.
  - Spec: none

## Economy and Buildings

- [ ] **Enemy base power display shows NaN when selecting an enemy construction yard; ensure it shows the correct power value.**
  - Spec: none

- [ ] **ensure when using drag and drop on the mobile build buttons that** — the unit or building info tooltip does not pop up. Only show it when the user hold the button but not when is pressed and then the finger is moved. It can pop up when the button is hold but as soon as the finger is moved by about half the size of the button the tooltip should go away again.
  - Spec: [Mobile Portrait Sidebar Expand Button](../specs/022-mobile-portrait-sidebar-expand-button.md)

## AI

- [ ] **Local AI host-party enemy ownership (2026-03-25)** — when the host opts to let its own party run under local AI or LLM control, all AI subsystems must treat that party as friendly, treat every other party as hostile, and avoid legacy two-side assumptions that make the host AI attack its own units/buildings or skip support logic.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [ ] **7) Ensure that the enemy AI will move the tanks with missing crew members back to hospital before continuing the battle.**
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

## UI, Sidebar, and Settings

- [ ] **Prevent iOS long-press text selection from appearing on production build buttons so tooltips stay visible.**
  - Spec: none

- [ ] **Fix attack cursor to toggle between in-range and out-of-range states on hover** — based on distance, and ensure range labels render in red.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [ ] **Remove the blue progress bar from sidebar build buttons once a unit finishes production.**
  - Spec: none

## Missions and Campaign

- [ ] **Tutorial window should be allowed to overlap the sidebar; on portrait mode** — it should mount at the top-left corner over the sidebar and span the full width when expanded.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

## Saves and Replay

- [ ] **Replay determinism save timing lock (2026-03-25)** — the observer-style replay determinism E2E must pause the live match before the first save and before stopping recording, and must pause again before the replay-end save, so both saved states are captured at a frozen identical `gameTime` instead of drifting on `frameCount`/time during save/stop sequencing.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism overlap metric + economy harness (2026-03-25)** — the four-player replay determinism E2E should compare the paused live/replay saves by a 2-decimal state-overlap percentage instead of exact serialized equality, and the fast-forward harness must not inject artificial building budgets because that hides real money spend behavior.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism mismatch-only diffing (2026-03-25)** — the replay determinism E2E should canonicalize compared save payloads by stripping UI/analytics-only branches, sorting comparable collections, and reporting only grouped mismatch branches so remaining overlap failures point at real simulation drift instead of save noise.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism wall-clock timestamp drift (2026-03-25)** — saved mine arming/deploy timers and wreck creation/recycling timestamps must use simulation time, not `performance.now()`, otherwise live-match and replay saves drift even when the underlying gameplay sequence is deterministic.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism stop-marker boundary (2026-03-25)** — replay playback must include an explicit terminal marker at the paused stop-recording timestamp, otherwise playback can end at the last gameplay command one fixed step early and miss the final ore spread/economy changes present in the live-match save.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism full pause freeze (2026-03-25)** — the E2E save-point freeze check must verify `frameCount`, `simulationTime`, `simulationAccumulator`, and `lastOreUpdate` stay fixed in addition to `gameTime`, so the compared save states are captured from a truly frozen simulation step.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism E2E map preset (2026-03-25)** — keep the four-player replay determinism test pinned to a `60x60` map with seed `5` and exactly `1` ore field so manual reruns stay on the intended deterministic scenario.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism four-player E2E harness follow-up (2026-03-25)** — keep the replay determinism test tutorial-free across startup and first paint, and avoid forcing `humanPlayer` to a non-owning spectator id because that triggers the normal defeat screen immediately before recording starts.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

## Done

Completed entries stay here so the detail is not dropped. Do not add new work in this section.

### Rendering and WebGPU

- [x] **Settings and FPS widget disagreed about WebGPU (2026-09-25)** — After a successful probe, settings said "Using WebGPU." whenever the sticky active flag was not WebGL, including while every terrain frame still drew with WebGL. The default water-only path has no sprite-sheet image, so texture sync returned false after a validation scope was already open and WebGPU never retried. Both read the latest drawn frame now. A handoff records not ready, validation pending, texture sync failed, no instances, restore, or the init failure, shows that reason on the widget's renderer row, and logs it once per change with a `[WebGPU]` prefix. Water-only frames bind a 1×1 placeholder atlas until a real sprite sheet exists.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **WebGPU atlas upload fallback (2026-09-24)** — Primary and secondary terrain atlases were created with `COPY_DST | TEXTURE_BINDING` only. `copyExternalImageToTexture` also requires `RENDER_ATTACHMENT`, so the first frame's validation scope failed with "Destination texture needs to have CopyDst and..." and settings fell back to WebGL. Those atlases are the only `createTexture` calls in the WebGPU renderer. The console logs the full validation message.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Combat decal crater priority + bundled-sheet fallback follow-up (2026-04-18)** — `impact` events can no longer overwrite an existing `crater`, howitzer shells now always stamp `crater` decals on their impact tile, and decal rendering now falls back to the bundled `debris_craters_tracks.json/.webp` combat sheet whenever active custom sprite sheets are disabled or do not provide decal tags.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Save-map drag/drop browser-navigation regression (2026-04-21)** — added capture-phase document dragover/drop guards that intercept file drops over the game canvas before browser default navigation, so dropping exported JSON onto the map now imports/loads the game instead of opening the file in a new tab.
  - Spec: none

- [x] **Game speed fixed-timestep follow-up (2026-03-23)** — fixed simulation-time visual regressions by moving explosion cleanup/rendering, turret muzzle flashes, harvester unload/harvest bars, rocket/tank/howitzer recoil flashes, and related movement/path/stuck timers onto the simulation clock; removed the redundant always-visible harvester load bar; restored projectile impact explosions; replaced the sidebar speed number field with a persisted `0.5-5.0` slider above Multiplayer; and fixed movement oscillation by keeping attack `moveTarget` values in tile coordinates.
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Follow-up** — ensure PWA mobile landscape notification bell is always pinned top-left (including wider landscape viewports) and portrait standalone canvas/safe-area bottom fill is correct on first load without rotation.
  - Spec: none

- [x] **Unit freeze visual follow-up (2026-04-16)** — during the 2s destruction freeze, dead units stay fully visible with their normal sprite (no gray wreck styling) and emit heavier, darker smoke until delayed explosion cleanup runs.
  - Spec: none

- [x] **Fixed map scrolling not working in portrait mode - swipe handler was** — capturing canvas touches near sidebar edge with position threshold; changed to only activate swipe when touch starts inside sidebar element.
  - Spec: none

- [x] **Start every destroyed unit's explosion immediately instead of after the destruction freeze.**
  - Spec: none

- [x] **Register and display ground-unit wrecks in the initial destruction tick rather than** — waiting for the explosion or frozen destruction pose to finish.
  - Spec: none

- [x] **Bug Fix: Unit smoke emission not working for loaded games**
  - [x] Fixed maxHealth validation - loaded units from older saves may have undefined maxHealth
  - [x] Added fallback in saveGame.js to preserve defaultMaxHealth before Object.assign overwrites it
  - [x] Added fallback in updateGame.js to use `unit.health || 100` if maxHealth is missing
  - [x] Smoke now emits from back of unit (based on direction) instead of center
  - Spec: none

### Terrain and Map Generation

- [x] **Custom SSE land recursion/black-map regression (2026-09-24)** — classify land directly from enabled SSE tag buckets without calling the land selector recursively, and always fall back to an enabled biome-tagged SSE tile when a classification-specific variant is unavailable.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Corner SOT edge stitching (2026-09-15)** — expand the exposed side of outward and inward corner transition tiles by one orientation-aware pixel so all four diagonal directions meet neighboring SOT/cardinal edges without triangular gaps or steps. Keep the solid legs on their owning tile and apply the same geometry to CPU, fallback cut-outs, and GPU-water SOT rendering.
  - Spec: none

- [x] **Full-street SOT and T-cross follow-up (2026-04-26)** — street SOT now renders only from `full`-tagged street sheet art, remains dominant on water-hosted corners between full-eligible streets, and the grass T/4-way crossing regression is covered by exact-direction tests so 4-way metadata keeps its `left` connection while the real grass `top+right+bottom` T candidate stays separate.
  - Spec: none

- [x] **Major sprite sheet duplicate tile follow-up (2026-04-26)** — hash generated tile image data, skip compositing duplicate tile pixels into the major atlas, preserve logical group coordinates through source rect indirection, and gitignore the generated major atlas/metadata build artifacts.
  - Spec: none

- [x] **Major sprite sheet follow-up compaction + lazy-load rules (2026-04-26)** — replaced the large major metadata payload with compact `tileEntries` format, added runtime expansion helpers, deferred SSE sheet image loading until modal open, ensured integrated mode disabled path does not load extra sheets, and packed grouped-tag assets consecutively by size-bucketed atlas rows.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **GPU crystal double-layer follow-up (2026-04-21)** — when default/custom integrated crystal tags are active, GPU terrain now avoids drawing legacy ore/seed atlas tiles underneath CPU crystal overlays, and SOT overlay rendering skips crystal redraw when GPU already rendered the same atlas-backed crystal tile so crystal sprites no longer stack on top of old ore tiles while still preserving terrain background visibility.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Default crystal-sheet runtime fallback + custom override parity (2026-04-21)** — ore and seed-crystal integrated tagged tile selection now loads from the bundled `crystals_q90_1024x1024` sheet even while `Custom sprite sheets` is disabled, and when custom sheets are enabled any matching custom crystal-tagged tiles take priority over the default fallback.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Artillery turret crater decal parity (2026-04-18)** — artillery turret shells now stamp `crater` decals on impact tiles (matching howitzer shell behavior) so heavy artillery impacts leave consistent terrain deformation.
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Water tile combat decal guard (2026-04-18)** — prevent `impact` and `crater` terrain decals from being stamped onto `water` map tiles while still allowing `debris` decals for destroyed building footprints that may overlap water.
  - Spec: none

- [x] **Combat decal visibility + SSE sheet registration follow-up (2026-04-18)** — registered `debris_craters_tracks.webp` in the default/indexed SSE sheet lists so it is selectable/editable, and added per-sheet black-key thresholds for that dark decal sheet so `impact` and building `debris` decals no longer key themselves away and remain visibly stamped on terrain.
  - Spec: none

- [x] **Combat decal gray underlay removal in non-custom GPU terrain mode (2026-04-18)** — the old WebGL flat-color decal fallback was still rendering underneath the new 2D combat decal sheet when custom sprite sheets were off, leaving a gray layer between the map tile and the decal. GPU terrain batching now skips decal overlays entirely so only the terrain tile and the actual decal remain visible.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Camera scroll speed fixed-step follow-up (2026-03-24)** — moved map scrolling, keyboard pan inertia, and smooth minimap drag updates out of the per-tick simulation update and back into the render loop, so sidebar game speed no longer changes camera scroll speed or inertia decay.
  - Spec: none

- [x] **Water SOT inverse-island smoothing (2026-03-15)** — enclosed land/street islands now render inner-terrain SOT on the surrounding water tiles at concave corners, but only when the island is truly enclosed by water; boundary-connected coastlines no longer get false outer land SOT wedges.
  - Spec: none

- [x] **Water SOT enclosed-island precedence follow-up (2026-03-15)** — enclosed islands now suppress the older water-on-land corner SOT so inverse land/street SOT fully owns island smoothing and no blue wedges cut back into already-smoothed island holes.
  - Spec: none

- [x] **Water SOT enclosed-island notch fix (2026-03-15)** — inverse island smoothing now matches orthogonal tiles by cached enclosed-component membership instead of requiring an immediate filled diagonal, restoring missing grass/street SOT on valid enclosed notch corners without broadening non-island overlays or adding repeated flood-fill cost.
  - Spec: none

- [x] **Water SOT enclosed-island shoulder fix (2026-03-15)** — inverse island smoothing now also recognizes diagonal-shoulder corners when an enclosed island component reaches a water tile through one orthogonal side plus the adjacent diagonal continuation, filling previously missing grass/street SOT on rounded island shoulders without changing non-island shoreline rules.
  - Spec: none

- [x] **Water SOT/full-water seam blending fix (2026-03-25)** — WebGL shoreline darkening now treats neighboring water SOT wedges as continuous water so no hard edge strip appears between SOT water corners and adjacent full water tiles.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Rock coastline and plateau surface rendering (2026-09-15)** — water-side shoreline transitions recognize rock tiles and use their sand underlay, while snow-enabled plateaus apply snow to the complete qualifying rock surface including north and north-west edge tiles.
  - Spec: none

- [x] **Default explosion sprite-sheet asset migration (2026-04-16)** — runtime destruction VFX now default to `public/images/map/animations/explosion.webp`, bootstrap `public/images/map/animations/explosion.json` at startup like SSE Apply Tags output, normalize transient/exported JSON sheet paths back to the bundled asset, and remove stale editor/index references to the retired filename-encoded explosion sheet.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Streets/walls build-area restriction (2026-03-20)** — placed and planned streets/concrete walls no longer extend buildable range for other building types, while street chains still extend streets and wall chains still extend walls during planning and production.
  - Spec: none

- [x] **SSE decorative fallback isolation (2026-03-03)** — legacy non-SSE decorative land is now used only when no selected-biome + `decorative` SSE candidates exist, preventing mixed decorative sources.
  - Spec: none

- [x] **SSE decorative biome mapping follow-up (2026-03-03)** — integrated land rendering now preserves legacy decorative/passable/impassable likelihood and only uses biome+`decorative` tagged tiles for decorative land (never for normal biome land).
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **SSE integrated mapping follow-up (2026-03-03)** — biome selector now immediately remaps land tiles by selected biome tag bucket, added `rocks` default SSE tag, and strict per-type fallback to legacy non-SSE rendering when `land/street/water/rock` tags are missing.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Fix `buildOccupancyMap` throwing when `gameState.mapGrid` (or its row) is undefined, causing "Cannot** — read properties of undefined (reading 'length')" errors on load. Verified in src/units.js: buildOccupancyMap returns null when mapGrid is missing instead of reading .length.
  - Spec: [Startup Map Initialization Bugfix](../specs/017-startup-map-initialization-bugfix.md)

- [x] **Fix `generateDangerZoneMapForPlayer` crash when `mapGrid` rows are missing at startup.** — Verified in src/game/dangerZoneMap.js: generateDangerZoneMapForPlayer returns an empty map when mapGrid rows are missing.
  - Spec: none

- [x] **Fix `CursorManager.isBlockedTerrain` assuming `mapGrid` is ready (crashes reading `.length`).** — Verified in src/input/cursorManager.js: isBlockedTerrain returns early when mapGrid is missing.
  - Spec: [Startup Map Initialization Bugfix](../specs/017-startup-map-initialization-bugfix.md)

- [x] **Fix `MinimapRenderer.render` crash when `mapGrid` or its rows are undefined during initialization.** — Verified in src/rendering/minimapRenderer.js: render draws a standby frame and returns when mapGrid is not ready.
  - Spec: [Startup Map Initialization Bugfix](../specs/017-startup-map-initialization-bugfix.md)

- [x] **Fix `updateOreSpread` (gameStateManager.js) assuming `mapGrid` rows exist, causing `Cannot read properties of** — undefined (reading 'length')` during updateGame initialization. Verified in src/game/gameStateManager.js: updateOreSpread returns before reading row length when mapGrid is missing.
  - Spec: [Startup Map Initialization Bugfix](../specs/017-startup-map-initialization-bugfix.md)

- [x] **Game loads without an auto-generated map; restore default random map generation on** — start and ensure map edit mode is disabled until explicitly toggled.
  - Spec: none

- [x] **Fixed minimap toggle button not working in portrait condensed mode - added z-index** — 2101 to #mobilePortraitActions and conditional display.
  - Spec: none

- [x] **Rocket tanks are 30% faster on streets than regular tanks**
  - Spec: none

- [x] **Ensure on map generation there is no ore overlapping with buildings.**
  - Spec: none

- [x] **Ensure that ore does not grow on occupant tiles. (Currently is is** — grows on and into rocks and buildings). It should only be on plain grass and street tiles that are unoccupied by buildings or anything else.
  - Spec: none

- [x] **Ensure the minimap "RADAR OFFLINE" background grain effect animates again instead of appearing static.**
  - Spec: none

- [x] **Add a Settings modal toggle to enable/disable radar-offline minimap grain animation, and** — make the white-snow grain visibly flicker/move like an old no-signal TV feed.
  - Spec: [Radar Offline Animation Settings Toggle](../specs/042-radar-offline-settings-toggle.md)

- [x] **Map generation fairness (2026-03-04)** — nearest ore seed crystal street distance is now equalized per party by generating one balanced ore cluster per base and forcing direct street reachability from each start base to its closest seed crystal.
  - Spec: [Balanced ore seed crystal street distance and ore distribution tiers](../specs/049-balanced-ore-seed-street-distance.md)

- [x] **Ore layout rebalance follow-up (2026-03-04)** — map generation now creates one smaller near-base ore field per player (~30 street tiles away and equally reachable), multiple larger center-map ore fields, additional seed-random spread ore fields, and default ore spread interval increased 3x (slower growth).
  - Spec: none

- [x] **Map settings ore-field count control (2026-03-04)** — added sidebar ore field count input and deterministic seeded usage in map generation, with one center seed crystal per generated field.
  - Spec: [Crystal terrain slowdown](../specs/020-ground-crystal-slowdown.md)

- [x] **Mobile scroll stutter and black-tile chunk loading regression (2026-05-02)** — terrain chunk rasterization is now deferred while scrolling, nearby chunks are queued for idle warm-ahead, cold visible chunks draw a cheap non-black terrain fallback, dynamic water renders after the terrain pass so it stays visible, and the mobile benchmark samples black terrain pixels during fast scroll sweeps.
  - Spec: [Mobile scroll stutter recovery](../specs/073-mobile-scroll-stutter-recovery.md)

- [x] **WebGPU incomplete terrain parity (2026-07-11)** — keep WebGL/CPU terrain active until the first WebGPU frame and both atlas uploads pass asynchronous GPU validation, fall back on validation failure, and cover grass, rocks, animated water, and streets in WebGPU instance tests.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Terrain warm-queue teardown race (2026-07-11)** — stop and clear delayed chunk warming when the document rendering environment has been torn down so callbacks cannot create canvases after navigation or test cleanup.
  - Spec: none

- [x] **Revert combined major sprite sheet defaults (2026-07-12)** — restore separated street, terrain, crystal, rock/cliff, and combat-decal sheets; migrate major-only stored selections; remove the major sheet from SSE registries and runtime fallbacks; and stop generating it during builds.
  - Spec: [Crystal terrain slowdown](../specs/020-ground-crystal-slowdown.md)

- [x] **While a ship rotates, suppress bow/stern V-wakes and render fading circular water-disturbance** — rings around its hull instead.
  - Spec: none

- [x] **Production action-bar rapid-tap and scroll regression (2026-08-09)** — make every land, air, and water unit button respond immediately to upper/lower-half pointer releases, while suppressing stack changes whenever the same gesture moves or scrolls the action bar in portrait or landscape.
  - Spec: none

- [x] **Make air and water production buttons match ground buttons** — lower-half release resolves the owning production lane and drag-to-map queues the completed unit's rally destination.
  - Spec: none

- [x] **Reproduce and eliminate mobile action-bar scroll gestures triggering a build on release,** — including coalesced release-only displacement and browser-level touch scrolling across building, ground, air, and water buttons.
  - Spec: [Mobile scroll stutter recovery](../specs/073-mobile-scroll-stutter-recovery.md)

- [x] **Extend shared-junction transition coverage to land-to-land biome borders; remove stepped corners and** — detached triangular notches shown in the supplied biome image. The street experiment was reverted in the follow-up below.
  - Spec: none

- [x] **Restore legacy street fringe rendering after the shared-junction road experiment caused visual** — regressions; widen biome corner feathering to remove the remaining sharp staircase edges shown in the supplied image.
  - Spec: none

- [x] **Add missing diagonal-only biome transition metadata and combine matching neighbor directions at** — region turns so shared masks can smooth the remaining full-tile staircase corners.
  - Spec: none

- [x] **Replace binary biome-junction ownership with cached fractional corner weights so leftover land-biome** — steps and square turns render as continuous sub-tile contours; preserve legacy street rendering.
  - Spec: none

- [x] **Fix broken-looking water SOT overlays by aligning SOT water draw bounds with** — base water rendering and further zooming out the procedural water pattern scale.
  - Spec: none

- [x] **Fix portrait condensed mode issues** — squared build buttons (64px) fitting in bar height, landscape-proportioned minimap (200x120), action buttons stacking vertically in column layout.
  - Spec: none

- [x] **Fix startup Defeat screen + missing random map** — prevent mapGrid/factories from being cleared by incorrect sync logic on initialization.
  - Spec: [Startup Map Initialization Bugfix](../specs/017-startup-map-initialization-bugfix.md)

- [x] **Fix crash on auto-resume restore** — prevent save load from wiping mapGrid (AI building placement should not run with empty map).
  - Spec: [Auto-resume MapGrid Guard](../specs/018-auto-resume-mapgrid-guard.md)

- [x] **Fix stale SOT overlays after victory/defeat when starting a new game** — invalidate map renderer chunk cache + SOT mask in reset flow.
  - Spec: none

### Units and Combat

- [x] **Enemy tank target-without-firing LOS stall follow-up (2026-04-14)** — the prior `allowedToAttack` fix was necessary but not sufficient. Tanks could still target enemies, move into nominal range, fail `hasClearShot()`, and then stand still forever because `findPositionWithClearShot()` assigned a sidestep path that `handleTankMovement()` immediately cleared again just because the unit was already within firing range. Tank combat now only auto-stops on range when there is already a clear shot, so blocked in-range tanks keep their reposition path and sidestep into a firing lane.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Occupancy tile center-based regression fix (2026-03-31)** — all unit tile position calculations were using floor-based top-left corner formula (`Math.floor(unit.x / TILE_SIZE)`) instead of center-based (`Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)`); this caused the occupied tile to not match the visual center of the unit image, and the physics self-occupancy exclusion in `isPositionBlockedForCollision` (which was center-based) to mismatch the floor-based occupancy map, pushing units away from their own tile and triggering pathfinding reroute loops. Fixed all occupancy, tile position, and collision lookups across 11 source files to consistently use center-based formula. Added AGENTS.md rule 11 warning about self-blocking occupancy as a recurring bug source.
  - Spec: none

- [x] **Enemy tank chase reroute overreaction fix (2026-03-28)** — classic AI combat pathing no longer triggers reroutes solely from short-term distance oscillation; reroutes now require initial-path need or real target tile movement, reducing unnecessary path deviations on clear routes.
  - Spec: none

- [x] **Prevent premature dodge/stuck handling from triggering on far-away path obstacles; only accumulate** — stuck/dodge when blockage signals are local (near next waypoint or recent local collision).
  - Spec: none

- [x] **Fix ground-unit stuck dodge/re-route logic to ignore the acting unit's own occupied** — tile so self-collision checks do not trigger continuous inefficient rerouting loops.
  - Spec: none

- [x] **Follow-up** — restore `tank-v2` alert outer range ring and remove the inner tile-sized red circle.
  - Spec: none

- [x] **Remove inner red range circle from `tank-v2` alert mode; keep utility-unit alert discovery rings unchanged.**
  - Spec: none

- [x] **Fixed howitzer gun barrel alignment - now points in driving direction by** — default using same direction as bullet trajectory, updated recoil effect and muzzle flash accordingly
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Fixed howitzer aiming when target is below - barrel now points in correct launch direction with smooth transitions**
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Fixed howitzer bullet starting from end of gun barrel instead of center of wagon, aligned muzzle flash accordingly**
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Fixed howitzer recoil direction to align with barrel rotation**
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Fixed failing test "starts the next utility task for queued wreck targets"** — in unitCommands.test.js - after splitting unitCommands.js into modules, functions were calling imported functions instead of handler methods, breaking test mocks. Updated utilityQueue.js functions to accept handler as first argument and call handler methods, and updated proto assignments in unitCommands.js to pass 'this'.
  - Spec: none

- [x] **Fixed rocket tank rockets not homing toward moving targets - simplified burst** — fire to dynamically track target position each rocket
  - Spec: none

- [x] **Rockets from rocket turret and rocket tank now fly over units, wrecks, and buildings to hit their intended target**
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Fixed rocket tank firing only once - ammunition was being depleted 3x per burst (9 instead of 3)**
  - Spec: none

- [x] **Rocket tanks can now fire partial bursts when low on ammo (1-2 rockets if that's all that remains)**
  - Spec: none

- [x] **Rocket tank left bar now shows reload progress instead of ammunition**
  - Spec: none

- [x] **Rocket tank reload phase now begins only after entire 4-rocket burst completes (both normal and remote control)**
  - Spec: none

- [x] **Rocket tank in remote control mode immediately rotates towards selected target (10x faster than normal rotation)**
  - Spec: none

- [x] **Rocket tank no longer fires at old target position when target unit dies**
  - Spec: none

- [x] **Rocket tank remote control now tracks actual selected unit position instead of just using current direction**
  - Spec: none

- [x] **Rocket tank now actively rotates body towards target in normal combat mode (normal rotation speed)**
  - Spec: none

- [x] **Rocket tank projectiles now deal exactly 23% damage to normal tanks (100 HP) per rocket**
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Rocket tank ammunition capacity set to 24 rockets**
  - Spec: none

- [x] **Rocket tank stops attacking when target is destroyed**
  - Spec: none

- [x] **Rocket tank rotation speed normalized to 0.1 radians/frame in all modes**
  - Spec: none

- [x] **Rocket tank reload phase begins only after entire 4-rocket burst completes**
  - Spec: none

- [x] **Fixed tanks (and other units) slowing down significantly when approaching each other.** — The bug was caused by two compounding velocity reduction mechanisms in `movementCollision.js`: proactive avoidance forces (FORCE_FIELD_RADIUS: 36px) and reactive velocity damping (MIN_UNIT_DISTANCE: 24px with up to 70% velocity reduction per frame). Removed the aggressive multiplicative damping in `checkUnitCollision()` since the separation forces are sufficient to push units apart.
  - Spec: none

- [x] **Fixed standard tanks slowing to a crawl in range. `updateTankCombat` used a** — rocket-range override, causing stop/start oscillation with movement pathing. Removed the override so tanks stop at their actual effective range.
  - Spec: none

- [x] **Paused attack pathfinding while a tank is remote controlled and delayed auto-movement for 1s after remote control stops.**
  - Spec: none

- [x] **Ensure rocket turret 6-rocket bursts cycle through six distinct muzzle coordinates `(60,40)`,** — `(60,73)`, `(60,107)`, `(130,40)`, `(130,73)`, `(130,107)` using each rocket sprite center as the spawn anchor.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **when a combat unit is selected and I hover over another of** — my units then the cursor should not be an attack cursor but just a normal cursor "arrow".
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Tanks are not accelerating or decelerating anymore. Make sure they do before reaching max speed.**
  - Spec: none

- [x] **The rocket tank does not correctly fire at enemy buildings. the projectiles seem to go into another direction.**
  - Spec: none

- [x] **The rocket tank rockets do not detonate where the rockets are impacting.** — Make sure the explosions happen where the rockets move to before they vanish.
  - Spec: none

- [x] **Tank v1 somehow changes color during the game. They should all be blue.**
  - Spec: none

- [x] **Units when dodging should not move differently than normal. They should just** — move to a random adjacent tile when an enemy projectile is approaching. Dodging should not be faster than normal movement.
  - Spec: none

- [x] **The enemy rocket tank should not have the same color as the harvester.**
  - Spec: none

- [x] **The aiming of the tank-v2 is totally off. It should be able** — to hit moving target as long as they do not change their trajectory.
  - Spec: none

- [x] **The color of the tank-v2 seems to change. It should always be white.**
  - Spec: none

- [x] **Fix ground-unit pathfinding reroute thrash** — preserve the planned route during stuck recovery, splice in local obstacle evasion instead of clearing full paths, and visualize active local-avoidance path segments in blue in waypoint rendering.
  - Spec: none

- [x] **Follow-up bugfix** — Restart/shuffle map now also clears build-planning overlays (blueprints, chain build, mobile paint, mine/sweep previews), stale selection, and queued production state.
  - Spec: none

- [x] **Ensure howitzer unlock is gated behind an owned artillery turret (plus existing** — radar + vehicle factory requirements) so it cannot be built early.
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Fixed defense AGF forced-target regression where artillery/rocket turrets aimed but did not** — fire (line-of-sight checks now only gate direct-fire gun turrets), restored defense-building hover attack cursor on enemy targets, and added queued AGF red chain lines for ordered attack targets.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Fix player-commanded and enemy-AI Destroyers never firing by making their combat turret** — tracking follow assigned targets, with human and AI regression coverage.
  - Spec: none

- [x] **Extend AGF to selected defensive buildings so box-selected enemy targets are queued** — (FIFO) and resolve rocket/artillery forced-target no-fire regression by fixing building force-target acquisition.
  - Spec: none

### Naval

- [x] **Local rebase conflicts (2026-07-27)** — preserve carrier and battleship command routing while integrating Construction Yard and Shipyard targeting for submarines through the centralized naval-targeting rules.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Battleship rendering ~20 FPS regression (2026-07-26)** — deeply profiled and removed repeated turret-state reconstruction, nested linear target scans, per-frame renderer helper allocations, and full-range translucent canvas overdraw; the normal selected-battleship scene now holds the 60 FPS cap, a reproducible throttled performance test guards the budget, and `AGENTS.md` now mandates hot-loop review plus live before/after benchmarking.
  - Spec: none

- [x] **Battleship mobile-engagement control regression (2026-07-25)** — after a broadside, retain the marked hull/turret targets while accepting new move paths or live remote helm input; let only currently tower-unblocked turrets keep tracking/firing from the moving hull, and make the S stop command clear all four turret locks plus every pending salvo so no delayed barrel can fire.
  - Spec: [Mobile FPS regression after sprite-sheet routing + realtime bottleneck overlay](../specs/068-mobile-fps-regression-bottleneck-overlay.md)

- [x] **Southeast destroyer 5 FPS CPU regression (2026-08-30)** — unreachable naval attack destinations no longer cause failed full-map path searches on every simulation tick; all naval attack/service route failures now retry only at the 5-second AI decision interval, restoring the supplied save from 4.94 FPS / 200.12 ms average update time to 58.41 FPS / 1.86 ms while preserving periodic recovery attempts.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Submarine/map-settings follow-up (2026-07-22)** — defense buildings ignore submerged submarines, submarines can torpedo yards, and map settings labels now show km dimensions plus a minimum save-memory estimate.
  - Spec: [Submarine targeting and map settings follow-up](../specs/075-submarine-map-settings-follow-up.md)

- [x] **Fix the Destroyer map image loader after the parent-level asset was renamed** — from `destroyer_south.webp` to `destroyer_map.webp`, including its regression-test expectation and specification path.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Shipyard placement accepts west/east shore footprints where the water half overlaps straight** — water columns and the land half remains on land.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Fix loaded ferries jittering back and forth when reaching a commanded water** — point; transports now clear their route and fully settle before shoreline alignment/transfer, verified together with naval braking inertia.
  - Spec: none

- [x] **Stop residual naval angular velocity deterministically when a ship reaches its movement heading or no longer has a path.**
  - Spec: none

- [x] **Correct large naval hulls away from land when an in-place or low-speed** — turn makes the rendered bow/stern overlap the shoreline.
  - Spec: none

- [x] **Load and unload Hovercraft cargo through the bow/front while keeping Vehicle Ferry cargo transfer at the stern/rear.**
  - Spec: none

- [x] **Disable long-hull shoreline terrain collision only while a Hovercraft or Vehicle Ferry** — is actively approaching/aligned at a loading or unloading rendezvous.
  - Spec: none

- [x] **When a selected Hovercraft or Vehicle Ferry uses an AGF drag box** — around friendly ground units, queue every capacity-eligible boxed unit for boarding and never activate guard mode on the transport.
  - Spec: none

- [x] **Make Ferry and Hovercraft boarding reliable for grouped and sequential cargo orders** — without replacing earlier rendezvous slots or waiting forever for every queued unit simultaneously.
  - Spec: none

- [x] **Show the normal move cursor for a selected Hovercraft over passable land as well as water.**
  - Spec: none

- [x] **Start naval sinking in the same cleanup tick as its explosion and** — remove any lingering circular turning wakes around the sinking ship.
  - Spec: none

### Air and Jets

- [x] **Apache destruction rotor deceleration follow-up (2026-04-23)** — during the 2-second Apache death freeze fall, the rotor now keeps spinning while decelerating and reaches zero speed right at ground impact/explosion time.
  - Spec: none

- [x] **Apache destruction freeze-period fall animation (2026-04-23)** — when an Apache is killed and held in the 2-second destruction freeze window, it now visually falls from altitude while rotating 270° before impact, then triggers the normal ground explosion at freeze completion.
  - Spec: [Apache destruction freeze-period fall animation](../specs/067-apache-destruction-fall-animation.md)

- [x] **F22/Tesla/smoke follow-up (2026-03-24)** — restored F22 rocket damage against airborne Apache targets by validating air-hit proximity against the aircraft's altitude-adjusted visual center, switched Tesla lightning visibility checks back onto the simulation clock, and moved smoke-particle aging onto simulation time so Tesla bolts plus refinery/power-plant/damaged-tank smoke render again under the fixed-step loop.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Service-unit friendly ground targeting regression (2026-03-18)** — ammunition trucks/factories, tanker trucks, ambulances, and recovery tanks now only service same-party targets that are on the ground, preventing cases like airborne Apaches refilling over enemy service vehicles.
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Apache cheat-kill sound cleanup (2026-03-20)** — the `kill` cheat now immediately stops Apache/F35 flight loops instead of waiting for later cleanup, preventing rotor audio from lingering after cheat destruction.
  - Spec: [Apache destruction freeze-period fall animation](../specs/067-apache-destruction-fall-animation.md)

- [x] **Apache death cleanup sound follow-up (2026-03-20)** — destroyed-unit cleanup now explicitly stops Apache/F35 rotor loops before removal, so fatal hits silence active flight audio even when the normal Apache movement update no longer runs that frame.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Apache rotor loop landing/destroy cleanup (2026-03-20)** — Apache flight audio now invalidates pending loop-start requests when landing/destroyed state changes, fades out active rotor loops within 50ms, and adds unit + E2E regression coverage so helipad touchdown and destruction reliably silence the loop.
  - Spec: [Apache destruction freeze-period fall animation](../specs/067-apache-destruction-fall-animation.md)

- [x] **F35 behavior consistency pass (2026-03-08)** — blocked all grounded/taxi/landing/takeoff bomb release paths (AI/manual/remote/retaliation), removed implicit auto-landing on generic move/remote movement, switched bomb kinematics to inherited-velocity gravity drop with no trail/tracer, added airstrip parking slot reservation to prevent overlap, aligned airborne F35 loop with F22 flight audio, and corrected F35 single-center tailpipe jet stream.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Apache rockets now fly straight toward the initially aimed impact point instead** — of retargeting mid-flight, use predictive lead based on target speed/direction so steady movers can be hit precisely, and a full precise burst can destroy a moving tank; airborne direct hits only land when the aircraft remains at that impact point; added regression coverage.
  - Spec: none

- [x] **F22 landing non-passable airstrip recovery (2026-03-04)** — during `landing_roll`, F22 now gets a soft centerline correction with stronger push when on non-taxi tiles, preventing frequent landing stalls in blocked airstrip-adjacent regions.
  - Spec: [F22 landing centerline guard near airstrip non-passable region](../specs/049-f22-landing-centerline-guard.md)

- [x] **F22 rocket spawn alignment (2026-03-04)** — F22-fired rockets now spawn from the lower F22 fuselage hardpoint (below the jet body) instead of shadow-aligned coordinates; added E2E regression asserting rocket origin stays above the projected ground shadow.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 handling/combat tuning (2026-03-04)** — reduced F22 turn rate to one-third, reduced F22 top speed by 40%, and increased F22 rocket projectile speed by 50% without changing Apache rocket speed.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Enemy non-AA airborne retargeting follow-up (2026-03-02)** — fixed remaining AI target selection gaps where non-anti-air enemy ground units could still pick airborne Apache/F22 during base-defense and harvester-hunter threat scans; they now immediately ignore airborne-only threats and choose valid ground targets instead. Added E2E coverage for base-defense retargeting.
  - Spec: [Apache selection alignment](../specs/020-apache-selection-alignment.md)

- [x] **F22 border/orbit attack loop stabilization (2026-03-01)** — F22 now proactively evades map borders before impact, slows to cruise/orbit speed near combat loiter circles, and continues large multi-pass attack orbits until target destruction or ammo depletion before RTB.
  - Spec: [F22 border avoidance + stable combat orbit loop](../specs/048-f22-border-orbit-attack-loop.md)

- [x] **Enemy F22 anti-air avoidance (2026-03-01)** — F22 target selection now rejects targets inside active anti-air missile ranges (rocket tanks/rocket turrets), and F22 attack flight plans now compute safe approach waypoints that route around anti-air action radii when possible.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Enemy F22 parity follow-up (2026-03-01)** — AI F22 now spawns via shared player spawn pipeline on airstrip parking slots, grounded F22 no longer roam over grass before takeoff, AI can scale F22 production to 2 per airstrip when budget > 10k, and F22 strike priorities now favor ore-field harvesters plus unprotected player defense buildings.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Enemy AI airstrike parity (2026-02-27)** — enemy F22 now runs air combat targeting logic like Apache and triggers takeoff (`f22PendingTakeoff`) when a valid player target is acquired, so it actively attacks opponents after production.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 runway robustness + attack command regression (2026-02-28)** — hardened runway queue/operation cleanup against stale blockers, added per-state takeoff/landing timeout recovery to avoid permanent stuck phases, prevented immediate re-land when a live combat assignment exists after takeoff, and increased F22 fuel burn (3x baseline, extra 2x during takeoff states).
  - Spec: [F22 runway robustness and combat command reliability](../specs/048-f22-runway-robustness-and-combat-command.md)

- [x] **Restored F22 landing regression (2026-02-27)** — workshop-restored F22 could lose `airstripId`, so F22 runway data never initialized and landing state machine could not approach runway. Fixed by auto-rebinding F22 to nearest friendly live airstrip when runway data is needed.
  - Spec: [Restored F22 airstrip rebinding](../specs/047-restored-f22-airstrip-rebinding.md)

- [x] **F22 same-airstrip in-progress command guard (2026-02-27)** — move-blocked cursor now also appears when selected F22 are in landing/takeoff runway phases for that same airstrip, and right-click move/land commands to that strip are ignored during those in-progress states to avoid immediate relaunch/reland loops.
  - Spec: [F22 runway robustness and combat command reliability](../specs/048-f22-runway-robustness-and-combat-command.md)

- [x] **F22 parked re-land command loop (2026-02-27)** — right-clicking the same airstrip under an already parked/grounded F22 no longer triggers immediate takeoff/reland; cursor now shows move-blocked only on that specific occupied airstrip, while other friendly airstrips still show move-into.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 wreck orientation renderer follow-up (2026-02-27)** — fixed single-image wreck rotation for F22 so crash wreck no longer points opposite to crash flight direction.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 crash cap+wreck-heading follow-up (2026-02-27)** — crash glide speed is now capped at 50% of F22 max speed, and F22 wreck orientation is locked to crash heading at impact.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 crash momentum follow-up (2026-02-26)** — movement core was still zeroing F22 crash glide velocity; crash state is now treated as movement-controlled so forward motion persists through descent.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 crash momentum/fire follow-up (2026-02-26)** — when airborne F22 enters crash sequence at 0 HP it now preserves its forward momentum during descent instead of dropping vertically, and crash smoke particles now include visible fire glow while descending.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 crash sequence (2026-02-26)** — airborne F22 now enters a headed crash glide on destruction, descends to ground with engine/wing fire+smoke, plays crash impact sound on ground hit, and spawns wreck at impact location.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 wreck sprite (2026-02-26)** — added dedicated F22 wreck sprite mapping so destroyed F22 renders as greyed F22 image instead of generic fallback wreck.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 save/load (2026-02-25)** — parked F22 stuck after loading — airstripId, f22State, parking slot not serialized, so runway data couldn't be restored. Fixed by saving all F22-specific fields and re-deriving runway points on load.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 landing queue (2026-02-25)** — multiple F22 commanded to land didn't orbit in proper large circles — holding orbit was 3.5 tiles, now 10 tiles with per-unit angular staggering. Parking slot race condition fixed by marking slot occupied immediately on landing.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 command/control follow-up (2026-02-26)** — fixed parked-F22 attack command stall by skipping grounded F22 combat steering/firing (which fought runway taxi), added auto-RTB landing trigger when attack target is destroyed or F22 ammo is empty, improved mobile direct tap-to-attack for enemy units, and added F22 taxi acceleration ramp plus longer/slower post-liftoff runway phase.
  - Spec: [F22 runway robustness and combat command reliability](../specs/048-f22-runway-robustness-and-combat-command.md)

- [x] **F22 taxi-to-parking stall (2026-02-26)** — F22 stopped mid-taxi because `updateUnitRotation` was skipped for grounded F22 (listed in `noAutoRotationTypes`) while acceleration was gated on rotation alignment; fixed by allowing rotation updates for grounded F22 and disabling stuck-detection during taxi states.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 runway-state movement interference (2026-02-26)** — generic stuck-recovery logic could interfere with F22 state-machine controlled runway/taxi phases; fixed by skipping `handleStuckUnit` recovery for `wait_takeoff_clearance`, `taxi_to_runway_start`, `takeoff_roll`, `liftoff`, `wait_landing_clearance`, `approach_runway`, `landing_roll`, and `taxi_to_parking`.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22/air-targeting follow-up (2026-02-27)** — enemy non-anti-air ground units now immediately drop/skip airborne Apache/F22 targets, while rocket-capable anti-air units keep valid airborne targets.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **F22 follow-up** — stopped F22 ground-collision shove behavior against other units, enforced save/load F22 ammo cap at 8 rockets, limited F22 volley size to avoid overkill rocket spam on low-health targets, increased early takeoff-roll acceleration, added airborne target-destination fallback so post-takeoff F22 resume target approach reliably, and blocked queued takeoffs until runway start zone is physically clear (no simultaneous parking-slot rush).
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22/airstrip follow-up** — shifted all airstrip spawn/runway points up by 32px, hid logical airstrip street tiles from visual base-tile rendering, serialized F22 runway traffic with takeoff/landing queues, added eased runway acceleration/deceleration plus eased climb/descend altitude transitions, disabled airborne F22 collision/avoidance overlap blocking, forced combat wave-orbit attack paths instead of target-hover stacking, fixed F22 volleys to always continue burst release beyond first rocket, and added dedicated F22 rocket tank-damage tuning (2 direct hits destroy `tank_v1`) without changing Apache/rocketTank stats.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **F22 follow-up** — grounded F22 can no longer fire, active F22 volleys now continue to completion while approaching targets (instead of dropping after first rocket), and the selected F22 ammo bar now shows a reload progress indicator line similar to rocket tanks.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22/airstrip follow-up** — airstrip passable tiles stay visually unchanged (no visible street texture bleed) while remaining logical street for movement, street placement build sound is suppressed, F22 spawn parking orientation now points nose to top-left, runway takeoff/landing now climbs/descends between runway midpoint and strip end/right side, and airborne F22 steering uses forward-inertia turn-rate-limited flight to avoid jitter.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Ensure Airstrip uses `airstrip_map.webp` while being built/on-map (no grey placeholder fallback).**
  - Spec: none

- [x] **Ensure movement loop audio (engine/rotor) fades out immediately when a unit stops moving.**
  - Spec: none

- [x] **Ensure Apaches auto-return to helipad on empty ammo, fully land/reload, resume attacking** — the same target, and finally return to helipad after the target is destroyed.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Ensure selected Apaches still complete helipad landing immediately (no hover lock), auto-return** — reload cycles auto-relaunch to the interrupted target, and helipad return flight rotates then moves forward (no backward drifting).
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Reduce Apache speed by 25% and enforce that Apaches only land on currently unoccupied helipads.**
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Ensure ammo-empty Apaches auto-reroute to another free helipad if their currently assigned** — return pad becomes unavailable during return.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Fix Apache ammo cheat handling so ammo cheats update `rocketAmmo` reliably even** — when Apache has a populated `maxAmmunition` field.
  - Spec: none

- [x] **Fix stale `remoteControlActive` state blocking Apache auto-return/resupply combat logic after remote control inactivity.**
  - Spec: none

- [x] **Apache helipad touchdown regression (2026-03-24)** — fixed Apache landing-state altitude handling so helipad-commanded and auto-returning Apaches complete actual touchdown on the assigned helipad (instead of hovering above it), then perform pad ammo/fuel refill as intended.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Harvester + Apache player-target priority follow-up (2026-03-23)** — harvester auto-targeting now defers to manual ore targets and remote-control input for a full 2s inactivity grace period, while Apache helipad auto-return/resume now cancels cleanly whenever the player issues fresh movement/attack/remote-control commands so player targets always win.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Ensure Apache helicopters can land on helipads even while still selected.**
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Allow mobile-selected Apache helicopters to land on helipads without remote-control interference, and** — auto-lift when remote control starts from a landed state.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Skip ground-unit pathfinding for Apache helicopters so they fly directly and maintain max-range standoff positioning.**
  - Spec: none

- [x] **Boost Apache rocket damage against tanker trucks and ammunition trucks by 3x.**
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Ensure enemy Apache helicopters prioritize other helicopters in range and resume prior objectives afterward.**
  - Spec: none

- [x] **Fixed Apache helicopter false "out of ammo" notifications when rockets available**
  - Spec: none

- [x] **Fixed Apache helicopters firing rockets faster than 300ms minimum interval**
  - Spec: none

- [x] **Fixed cheat system ammo commands not applying to Apache helicopters**
  - Spec: none

- [x] **Fixed combat system not checking `rocketAmmo` field for Apache units**
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Fixed rockets targeting Apache helicopters aiming at center between Apache image and** — shadow - added altitude visual offset compensation (altitude * 0.4) in multiple locations: handleTankMovement, handleRocketBurstFire, fireBullet, homing logic, and collision detection
  - Spec: none

- [x] **Rocket tank remote control mode added with red crosshair reticle (similar to Apache)**
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Prevent Apache rockets from damaging ground units or buildings when engaging airborne targets.**
  - Spec: none

- [x] **Ensure workshop restoration displays the correct F22 wreck image (no generic default** — fallback) and rotates all restored wreck previews by 45°.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Supply-unit airstrip move UX** — when only support units (ambulance/tanker/ammunition/recovery) are selected, friendly airstrip tiles now behave like valid move targets (no move-blocked cursor), allow right-click move command on the airstrip footprint, and produce normal green move target indicators.
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Prevent F35 recovery from descending at one coordinate and snapping to a different parking coordinate after touchdown.**
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Prevent carrier final approach/landing stages from starting while the carrier is moving** — or the F22 has not reached its fourteen-tile astern staging point.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Stop carriers from retaining movement or residual rotation when given an aircraft** — strike command or after reaching their commanded position.
  - Spec: none

- [x] **Exclude flying, landing, taxiing, and parked aircraft from Aircraft Carrier collision and avoidance calculations.**
  - Spec: [Local Collision Lookahead for Units](../specs/012-local-collision-avoidance/spec.md)

- [x] **Stop an Aircraft Carrier when its rendered bow tip reaches the final** — waypoint, clear every residual movement/rotation state, and retain that heading until a new command.
  - Spec: none

- [x] **Ensure Rocket Turret homing rockets track the altitude-adjusted visible center of enemy** — Apache, F22, and F35 aircraft and detonate directly on the aircraft rather than at its ground coordinate.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Loaded-save CPU collapse + aircraft shadow targeting regression (2026-08-28)** — reproduce the delayed slowdown with `2026-08-23_19-26-21-591Z_Build.json`, analyze the direct 6 FPS state in `2026-08-28_18-37-40-820Z_issue.json`, stop per-tick failed harvester/naval/logistics pathfinding storms, keep empty Apaches on helipad-return logic instead of ground ammo-truck routes, preserve Apache flight/return state in saves with a legacy airborne fallback, and target the visible altitude-adjusted position of Apache/F22/F35 aircraft.
  - Spec: [Loaded-save pathfinding and aircraft targeting regression](../specs/078-loaded-save-pathfinding-air-targeting.md)

- [x] **Player Apache attack-order regression (2026-08-30)** — explicit attack commands must enter Apache combat immediately, fire when in range, and continuously refresh the combat flight plan as a live target moves, while recent direct-flight controls still suppress automatic combat movement.
  - Spec: none

- [x] **Added F35 behavior consistency E2E regression coverage for grounded-fire blocking, no-auto-land-on-move, airstrip** — slot reservation separation, and no-trail bomb drops.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Follow-up fix for F22 + Airstrip** — corrected F22 airstrip spawn points, made F22 air movement/attack commands work (lift-off + flight plan handling), added build-only occupancy tiles with new buildable Street ($10), made airstrip tiles passable except blocked lower-left sub-rectangle (source rect below y=200 within x=0..480), and included F22 in Vehicle Factory speed scaling.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Follow-up fix (phase 2) for F22 + Airstrip** — switched F22 to fixed-wing runway lifecycle (parking slot -> taxi -> takeoff roll -> liftoff -> airborne -> runway approach -> landing roll -> taxi to parking), disabled pathfinding while airborne but kept ground pathfinding while taxiing, added F22 flight/takeoff/landing sounds, enabled move-into cursor on airstrip hover for selected F22, prioritized landed F22 selection over airstrip click hitbox, removed ground shadow while taxiing, set airborne speed to 2x apache baseline with slower ground taxi, and aligned F22 combat range with rocket turret range.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Follow-up fix (phase 3) for F22 + Airstrip** — corrected spawn/runway coordinate conversion to use top-left source-space scaling, fixed F22 slot world/tile coordinate mixup that caused off-map spawn placement, enabled grounded F22 direct fire when target is in range, switched airstrip footprint to build-only occupancy (no movement blocking), and extended selected-airstrip HUD to show fuel (right) and ammo (left) bars like helipad.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 follow-up (phase 4)** — fixed critical liftoff velocity-zeroing bug in movementCore.js (isF22RunwayControlled guard), increased takeoff speed (MIN 0.9→1.5, MAX 1.7→2.2, easeOutQuad), dynamic parking slot claiming on landing, enhanced combat orbit wave amplitude, F22 skips all unit collision (no ground-push), post-takeoff destination fallback, cleaned up dead RTB state assignment.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Prevent airborne units from overlapping by adding air-to-air avoidance, bounce handling, and collision damage.**
  - Spec: [Local Collision Lookahead for Units](../specs/012-local-collision-avoidance/spec.md)

### Economy and Buildings

- [x] **Harvester spawn/selection/manual-ore regression bundle (2026-04-20)** — newly spawned harvesters now get immediate ore move intent again, selected harvesters keep showing active harvest/unload cycle progress instead of falling back to XP mid-cycle, multi-harvester ore commands now fan out across connected neighboring ore tiles before reusing the clicked tile, manual ore targeting now blocks density tiers above the harvester XP level, invalid ore hover targets show a blocked cursor plus XP tooltip, and player harvester promotions now emit clickable focus notifications.
  - Spec: none

- [x] **Remaining unit-test stabilization (2026-04-01)** — aligned stale assertions in `enemySpawner.test.js`, `keyboardHandler.test.js`, and `mouseCommands.test.js` with current runtime behavior (spawn arg mutation semantics, blocking-building mock behavior, and defense-building fallback target promotion), then reran full unit suite and changed-file linting cleanly.
  - Spec: [Changed-Files Lint Fix Workflow](../specs/033-changed-files-linting.md)

- [x] **Crew save/load restoration regression (2026-03-31)** — unit serialization now persists each unit's current crew-role alive/dead state, and load hydration reapplies saved crew flags instead of resetting to full defaults so partially crewed vehicles stay partially crewed after load.
  - Spec: none

- [x] **Harvester self-occupancy circling fix (2026-03-31)** — fixed coordinate mismatch between `unit.tileX` (floor-based `Math.floor(unit.x / TILE_SIZE)`) and the occupancy map (center-based `Math.floor((unit.x + TILE_SIZE/2) / TILE_SIZE)`); when a unit's center crossed into its destination tile but tileX hadn't updated yet, pathfinding saw the destination as occupied (by the unit itself) and rerouted to an adjacent tile, causing endless circling; fixed by making `buildOccupancyMap`, `updateUnitOccupancy`, and `removeUnitOccupancy` use the same floor-based formula as `unit.tileX`, and aligning `prevTileX`/`currentTileX` in `movementCore.js` accordingly.
  - Spec: [Startup Map Initialization Bugfix](../specs/017-startup-map-initialization-bugfix.md)

- [x] **AI crewless unit command loop fix (2026-03-31)** — AI was commanding crewless units (missing driver/loader) to move, attack, or harvest, causing rerouting loops and idle-at-ore behavior; fixed by: (1) adding crew checks to `harvesterLogic.js` — no driver stops all automation, no loader stops harvesting but allows unloading; (2) adding `returningToHospital` check to skip harvester automation while heading for restaffing; (3) filtering driverless units from pathfinding batch/immediate calculations in `pathfinding.js`; (4) making `enemyUnitBehavior.js` return early for mobile crewless units (clear offensive targets/paths, allow only defensive fire) so hospital pathing from `crewHealing.js` isn't overwritten.
  - Spec: [Harvester Automation Policy](../specs/060-harvester-automation-policy.md)

- [x] **Harvester retreat infinite rerouting loop fix (2026-03-31)** — `updateRetreatBehavior` (player backward-movement retreat system) no longer processes AI-initiated path-based retreats, preventing its straight-line path-block check and 2-second stuck detection from instantly clearing `isRetreating` every frame; `shouldHarvesterSeekProtection` now checks the post-retreat cooldown BEFORE nearby threats, preventing immediate re-trigger that bypassed the 4-second cooldown; `shouldStopRetreating` now terminates retreat when path is consumed (arrived or cleared by stuck system); AI retreats now set `retreatStartTime` for the 30-second safety timeout; `unitMovement.js` body direction and `canAccelerate` now properly handle AI forward-movement retreats vs player backward-movement retreats.
  - Spec: [Multi-Player & AI System](../specs/007-multi-player-ai-system/spec.md)

- [x] **Harvester policy/state-ownership fix (2026-03-31)** — player move orders now interrupt active harvesting/unloading, non-ore player moves create an explicit idle hold state, manual ore targets start harvesting immediately on arrival, assigned refineries remain preferred during stuck-unload recovery, and long-term stagnant ore routes reroute to a pseudo-random similar-distance ore tile instead of idling or looping forever.
  - Spec: [Harvester Automation Policy](../specs/060-harvester-automation-policy.md)

- [x] **Harvester ore-path recalc throttle (2026-03-29)** — added per-harvester ore repath cooldown so same-target ore routes are not recomputed every frame when no meaningful state changed.
  - Spec: none

- [x] **Harvester harvest-reservation leak fix (2026-03-28)** — interrupted harvest states now release tile reservations via `activeHarvestTileKey`, preventing ore tiles from remaining artificially locked and causing endless same-target reroute loops.
  - Spec: none

- [x] **Harvester same-target path-feedback mitigation (2026-03-28)** — when near ore and path is empty, harvesters now clear move intent and immediately attempt harvest with wider proximity acceptance, reducing back-and-forth turning at the ore tile.
  - Spec: none

- [x] **Enemy harvester ore proximity jitter fix (2026-03-28)** — broadened ore-field arrival tolerance and clear movement intent immediately on ore proximity so harvesters stop oscillating around ore tiles and start harvesting reliably.
  - Spec: none

- [x] **Enemy harvester retreat damage-loop fix (2026-03-28)** — damage-based retreat triggers now honor a short post-retreat cooldown so harvesters do not instantly bounce between retreat end and retreat restart without nearby active threats.
  - Spec: none

- [x] **Enemy harvester retreat re-trigger cooldown (2026-03-28)** — stopping retreat now applies a short harvester retreat cooldown so `recentlyDamaged` heuristics cannot immediately re-enter retreat in the same area; nearby real threats can still force immediate retreat.
  - Spec: none

- [x] **Enemy harvester retreat/economy policy conflict fix (2026-03-28)** — while `isRetreating` is active, harvester economy automation now pauses ore/unload scheduling so retreat logic is the single owner of routing; this removes the rapid retreat-vs-ore path overwrite loop seen when enemy harvesters are attacked.
  - Spec: [Harvester Automation Policy](../specs/060-harvester-automation-policy.md)

- [x] **Gas station + ammo factory service radius parity (2026-03-20)** — increased both building service radii to match the hospital's support footprint, applied the same wider radius to ammo-truck factory reload checks, and added regression coverage for service-radius math plus an end-to-end resupply scenario.
  - Spec: [Gas Station Explosion Safety and Damage Rings](../specs/013-gas-station-explosion.md)

- [x] **Prevent move-command/pathfinding attempts for selected buildings so map clicks with building selections** — do not trigger "Cannot reach that location. Move command aborted." notifications.
  - Spec: [Building Selection Should Not Issue Move Commands](../specs/046-building-selection-no-move-command.md)

- [x] **Ensure `ammo` cheat applies to selected defense buildings with ammo bars, supports** — absolute and relative (+/- number or %) ammo values for units/buildings, and update modal cheat text.
  - Spec: none

- [x] **Updated cheat system to use `this.selectedUnits` reference for all ammo/fuel/medic commands**
  - Spec: none

- [x] **Enemy units seem to aim at my units but they do not** — attack (means fire) at my units when in range. Also they do not fire at my buildings when the attack my base.
  - Spec: none

- [x] **initial building factory is still treated differently than other buildings. For example** — the health bar is not changing color when low or it does not have the party flag like other buildings. Ensure the there is not separate redundant code for the initial factory since it should be the same as any other later build additional building factory. Ensure when the map is generated with that factory already there is is as if the user has build the factory there. Before you make code changes make sure to find out everything so far what is different about the initial building factory compared to the ones that can be build later by the user. Then refactor the code to make everything coherent.
  - Spec: none

- [x] **Ensure the harvesters can only progress harvesting while they rest on an** — ore tile. Currently they can move on it and drive away immediately while havesting on the go which is not correct.
  - Spec: none

- [x] **Make sure always the clothest harvester to the refinery get unloaded first** — and reschedule the queue accordingly. Also make sure the harvesters do not move away from the refinery when they want to unload.
  - Spec: none

- [x] **Ensure when power is below 0 make that the production speed of buildings and units is calculated as follows** — normal speed * (energy production capacity / energy consumption).
  - Spec: none

- [x] **The main factory somehow does not count into the list of a** — players building so that when all other buildings are destroyed the game is already over. That mean that if you build a wall in the very beginning of the game and sell it, then you lost the game.
  - Spec: none

- [x] **When initial building factory gets destroyed there is not map background left, just black.**
  - Spec: none

- [x] **When selling a building the occupancy map is not updated and still blocked there.**
  - Spec: none

- [x] **When refinery is destroyed the harvesters can still got to building factory** — to unload ore but they should only do it at the refinery.
  - Spec: none

- [x] **Repairing a building takes no time. Make sure it takes 50% of** — the time it took to build it to restore 100% of the healthbar. also make sure the cursor turns into a wrench svg icon (path cursors/wrench.svg) when repair mode is on and mouse hovers over a building that can be repaired.
  - Spec: none

- [x] **When enemy buildings get destroyed it looks like the occupancy map is not updated and the tiles are still blocked!**
  - Spec: none

- [x] **Enemy is still building buildings even when his base is destroyed.**
  - Spec: none

- [x] **Harvesters can get stuck in the base and cannot move anymore. Make sure they can rotate on spot to solve getting stuck.**
  - Spec: none

- [x] **Enemy does not loose money when building units.**
  - Spec: none

- [x] **Enemy defense buildings are missing healthbar and don't take damage.**
  - Spec: none

- [x] **The ore tiles do not get removed after harvesting.**
  - Spec: none

- [x] **The initial construction yard building is not respected in the occupancy map.**
  - Spec: none

- [x] **Enemy units do not defend their harvesters when being attacked.**
  - Spec: none

- [x] **Sometimes the loading indicator of a harvester goes black again even when** — fully loaded and the yellow bar was visible before. Ensure the loading state is always visible.
  - Spec: none

- [x] **There are colored bars on the edges of some buildings who's map** — images do not fit exactly into the tile map grid. Those bars should be removed. Make sure when the image to place on the map does not fit into the grid that the map tiles from before are still visible in the background.
  - Spec: none

- [x] **When production queue is aborted the money goes back totally not gradually** — so you can actually earn money which is wrong!
  - Spec: none

- [x] **The game gets extremely slow when power is low. The game speed** — should not be affected by the power level only the production speed and the defence buildings loading speed.
  - Spec: none

- [x] **Harvesters are able to harvest the same tile simultaneously. That should not** — happen. The ore tile shall be blocked as soon as one harvester is at it.
  - Spec: none

- [x] **Restored normal-click enemy targeting for selected defensive buildings (without force-attack modifier) and** — changed defense forced-target queue insertion to newest-first (prepend) for both click targeting and AGF additions.
  - Spec: none

- [x] **OFC zero + immediate map updates (2026-03-04)** — ore field count now supports 0, follows center/near/spread tier rules relative to party count, and map regenerates instantly when seed/players/dimensions/ore-fields inputs change (shuffle button removed).
  - Spec: none

- [x] **Clamp a building's red pending-repair timeout fill so malformed or out-of-range cooldown** — values can never draw it wider than the building.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Restore desktop drag-to-map building placement from sidebar production buttons by leaving mouse** — pointers to native click and HTML drag/drop handling.
  - Spec: [Tablet landscape desktop sidebar behavior](../specs/057-tablet-landscape-desktop-sidebar.md)

- [x] **Fix edit mode** — remove buildings when drawing tiles over them, fix unitType initialization error.
  - Spec: none

### AI

- [x] **Enemy AI attack-path target-tile fallback fix (2026-04-14)** — the LOS stop fix was still not sufficient in tight terrain. Classic AI attack movement was pathing to the target's exact tile, and if that occupied/blocked tile had no valid path the unit kept its target with `path: []` and stood still. `enemyUnitBehavior.js` now falls back to the best reachable tile inside weapon range when direct target-tile pathing fails, so tanks can approach a firing position instead of deadlocking on impossible exact-destination paths.
  - Spec: none

- [x] **Enemy AI target-without-firing regression (2026-04-13)** — classic AI ground combat units used a throttled strategy pass to update `allowedToAttack`, while the combat loop checked that flag every tick. With `AI_DECISION_INTERVAL = 5000`, tanks could visibly keep a red target marker for several seconds or indefinitely after stale state while still being blocked from firing. `enemyUnitBehavior.js` now refreshes `allowedToAttack` every tick for already-targeted group-attack units, preserving the strategic throttle for movement decisions while letting units shoot as soon as the current target is actually allowed.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Enemy AI attack-move duplicate path owner fix (2026-03-28)** — disabled generic attack-move reroute logic for AI-controlled units in `unitMovement` so classic AI/retreat systems are the sole source of AI chase reroutes, preventing competing path rewrites.
  - Spec: none

- [x] **Enemy AI attack-move recovery gap fix (2026-04-14)** — restored shared `unitMovement` attack-path recovery for AI-controlled ground combat units only when their current target is live but their attack route is missing, so stalled tanks can rebuild a chase path without reintroducing continuous AI-vs-movement path rewrites.
  - Spec: none

- [x] **Enemy AI reroute throttle stabilization (2026-03-28)** — harvester retreat rerouting now uses a shared AI reroute cooldown and will not recompute retreat paths more than once every 2 seconds for the same retreat target, preventing rapid route flicker when harvesters are under sustained attack.
  - Spec: [Enemy AI Reroute Throttle (Harvester Under Attack)](../specs/058-enemy-ai-reroute-throttle.md)

- [x] **Sidebar legal links hidden for no-JS mobile crawlers/LLM checks (2026-04-13)** — the portrait coarse-pointer CSS fallback moved the entire sidebar off-screen unless runtime JavaScript added `mobile-portrait` or `mobile-landscape` classes. The legal links were already static anchors in `index.html`, but they were visually hidden on first paint for non-JS evaluators. The fallback now stays active only after the `no-js` marker is removed, so no-JS clients still see the sidebar footer links.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Enemy AI build stack overlay for LLM-controlled parties (2026-03-18)** — restored the enemy-base strategic backlog overlay when selecting an enemy construction yard owned by a per-party LLM-controlled AI, even if migrated settings still have the legacy global `strategic.enabled` flag set to `false`; also aligned LLM queue processing with the same per-party ownership check and added E2E coverage.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Enemy AI harvester unstuck scan follow-up (2026-03-05)** — harvesters are now treated as stuck after 60s with zero movement even when idle at ore fields (no path/moveTarget), with forced ore reassignment; out-of-fuel harvesters are left for tanker refill logic and missing-crew harvesters are left for ambulance crew-support logic.
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Enemy AI harvester unstuck scan (2026-03-05)** — every AI player now runs a 60s harvester recovery scan and reassigns stuck harvesters to different ore tiles when they fail to make movement progress.
  - Spec: none

- [x] **InceptionLabs requests must send `mercury-2` (not display label `Mercury 2`) and settings** — should remove obsolete global strategic enable/provider/interval controls in favor of model-pool + per-party selection.
  - Spec: [InceptionLabs provider + multi-provider party LLM assignments](../specs/049-inceptionlabs-multi-provider-party-llm.md)

- [x] **LLM enemy commentary misattributes ownership (e.g., says player destroyed "my" buildings when** — they were AI-owned); enforce owner-aware taunts tied to the controlled party id.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **LLM enemy AI never places ore refinery even though money and tech tree allow it — blocked position with no fallback.**
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **LLM command queue bypasses game engine unlock mechanics; buildings that require prerequisites** — can be queued before prerequisites are built.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **LLM AI builds multiple buildings simultaneously (instant placement) which is unfair to** — the player who must build sequentially.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **LLM production queue items disappear when construction starts — no completion tracking,** — causing the LLM to re-send duplicate build commands and waste money (e.g., building refinery and power plant twice).
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **LLM strategic AI first tick fires only after the tick interval elapses** — (~30s), wasting early game time instead of issuing commands immediately.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **LLM queue tooltip shows raw plan actions without status — no way** — to see which items are completed, in-progress, or failed.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Fixed LLM AI not building** — build_place actions were silently rejected by the proximity check (isNearExistingBuilding requires 3-tile Chebyshev distance). Added placement rule to bootstrap prompt and logging for rejected/accepted actions.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Fixed LLM strategic tooltip not showing when selecting enemy Construction Yard** — handleFactorySelection() did not call updateLlmQueueTooltipForSelection(). Since CY is a factory, selecting it triggered the factory handler which lacked the tooltip update.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Fixed LLM queue tooltip disappearing on mouse move** — canvas `mouseleave` event was unconditionally hiding the tooltip when the pointer entered the tooltip overlay (a sibling element). Now only hides when no enemy building is selected.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Fixed LLM queue tooltip showing oldest items first** — reversed the production plan list so latest/newest strategic decisions appear at the top.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Fixed enemy AI units aiming but never firing** — `allowedToAttack` was never set on spawned combat units (`undefined` fails `=== true` check), and `applyEnemyStrategies` was resetting it to `false` every tick when `unit.target` was null. Now combat units spawn with `allowedToAttack = true` and the strategy only overrides the flag when a valid target exists.
  - Spec: none

- [x] **The energy consumption of the player and the enemy AI is somehow** — shared. Make sure they have independent energy generation and consumption.
  - Spec: none

- [x] **Follow-up** — convert remaining gameplay-critical wall-clock timers from the game-speed fix (Tesla Coil sequencing and AI/LLM building sell timers) to the simulation clock so they obey sidebar speed changes too.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

### Multiplayer and Networking

- [x] **Candidate cursor audit (2026-09-23)** — `remoteCandidateIndex` and the host `candidateCursor` are initialized to `0` on current `main`. Both loops now treat a missing cursor as `0` so `undefined < length` cannot skip `addIceCandidate`. Cross-device joins still need TURN.
  - Spec: none

- [x] **Cross-device multiplayer join (2026-09-23)** — phones and other devices failed to join a Mac host because peers used STUN only, Chrome/Safari mDNS host candidates are not routable off-box, the service worker could cache signalling GETs, and concurrent ICE posts could drop the only useful candidate. Joins now load TURN from `GET /api/signalling/ice-servers` (`ICE_SERVERS` JSON, coturn ephemeral HMAC, or static username/password), embed gathered candidates in the offer/answer, restart ICE once, treat WebKit `iceConnectionState` and data-channel open as connected, and show that ICE state on the join screen. Signalling logs record candidate type without player names, IPs, or secrets; the alias stays in the session blob for the host UI. The QR modal warns when the invite origin is localhost or not HTTPS. Cross-network play still needs TURN credentials on the Netlify function (`ICE_SERVERS`, or `TURN_URLS` plus `TURN_SECRET` or `TURN_USERNAME`/`TURN_CREDENTIAL`). Netlify had no function-log reader and no TURN env vars; historical joins could not be retrieved, and names are not written to new function logs.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Enemy harvester ore-field retreat suppression (2026-03-28)** — damage-only retreat triggers now ignore harvesters that are actively harvesting/unloading or already at their assigned ore tile, preventing pointless turn-around loops at ore fields.
  - Spec: none

- [x] **Multiplayer sidebar host-party ownership label regression (2026-03-24)** — when `humanPlayer` used legacy id `player`, multiplayer state initialization and alias updates failed to map that to `player1`, so Green incorrectly appeared AI-controlled; fixed party-id normalization in multiplayer store/sidebar comparisons and added unit coverage.
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **Fix multiplayer remote-party economy sync** — remote human parties now receive host-authoritative money updates (harvester income + host `give [party] [amount]` cheats) via snapshot sync.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **When the number of players is changed in the map settings and** — the "shuffle map" button or the restart game button is pressed, ensure that the multiplayer section of the sidebar is adjusted to show the correct number of players.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Ensure multiplayer host alias is shown above construction yards for all players** — (including the host), updates immediately when edited in the sidebar, and persists across reloads.
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **Fixed online multiplayer game state not syncing from host to client. The** — `hasActiveRemoteSession()` function in `stateSync.js` was calling `getActiveHostMonitor()` without a partyId argument, causing it to always return `false` for the host. Initial fix used non-existent `monitor.getConnectedPeerCount()` method; corrected to use `monitor.activeSession` check instead. This prevented all game state snapshots (including initial map sync) from being sent to clients.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Fix extended multiplayer assault so RED/YELLOW/HOST all receive host-authoritative AGF orders (not** — client-local commands) and target BLUE structures only (buildings/factories), with immediate re-issue whenever new tanks become ready.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Fix multiplayer remote economy authority so host deducts per-party production costs for** — remote build/spawn commands and clients no longer locally debit/refund money during remote production progress.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Fix multiplayer Netlify 4-party E2E party mapping to match UI colors (`player3=Blue`, `player4=Yellow`)** — invite RED (`player2`) + YELLOW (`player4`), keep BLUE (`player3`) as AI, and update combat setup so all human tanks (GREEN/RED/YELLOW) focus-fire BLUE AI.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Prevent agent hang after multiplayer E2E by wrapping `npm run test:e2e:multiplayer` with** — `PLAYWRIGHT_HTML_OPEN=never` and post-run cleanup that force-kills any leftover report server on port `9323`.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

### UI, Sidebar, and Settings

- [x] **Radial placement ghost stays after a successful place (2026-09-26)** — a successful radial blueprint place from release-then-drag or the 500ms hold-drag ends planning immediately, and cancel clears the same ghost. One radial selection places one building. Sidebar shift-chain is the repeat path and is not used here.
  - Spec: [Radial build menu](../specs/093-radial-build-menu.md)

- [x] **Portrait first load leaves a black band under the build bar (2026-09-26)** — iOS WKWebView measured a short viewport before browser chrome settled and locked it into an inline canvas height that only refreshed on rotation. The document now uses `100dvh` (with `100vh` / `-webkit-fill-available` fallbacks) and a debounced viewport sync on resize, visualViewport, orientation, pageshow, load, and a short post-load settle, so the portrait build bar and canvas fill the screen on the first paint. The same fill removes the unused black bar under the portrait sidebar / PWA build bar.
  - Spec: [Mobile Initial Layout Stability](../specs/044-mobile-initial-layout-stability.md)

- [x] **Battleship HUD and carrier deck layering follow-up (2026-07-27)** — remove the obsolete per-turret green dashed/red blocked-angle HUD while retaining turret selection feedback, and always render carrier-bound landed/taxiing aircraft above the carrier hull.
  - Spec: [Airborne Render Layering](../specs/052-airborne-render-layering.md)

- [x] **Harvester XP HUD + seed-crystal tag follow-up (2026-04-19)** — harvesters now fill a visible per-star XP bar from unloads, render their cargo load on the ammo-side HUD bar to avoid overlap, restore star rendering on harvesters, and seed crystals now resolve `red` + `density_X` integrated-sheet tags without requiring the legacy `ore` tag.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Map settings expand scroll alignment (2026-04-15)** — expanding Map Settings now scrolls the sidebar so the beginning of the expanded section aligns near the top of the visible viewport, instead of auto-scrolling to the bottom of the expanded content.
  - Spec: [Map Settings expand scroll alignment](../specs/062-map-settings-expand-scroll-alignment.md)

- [x] **Portrait condensed build-category toggle initialization regression (2026-03-28)** — fixed mobile category toggle selectors to target only production tabs (`[data-tab]`) so save/load tabs cannot hijack active-tab detection; restores first-load Buildings↔Units switching in mobile portrait condensed mode.
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [x] **Air unit ammo HUD/refill consistency (2026-03-20)** — ensure Apache/F22/F35 selected ammo bars always reflect the unit's real rocket ammo in both grounded and airborne states, eliminate early touchdown-based pad reloads, and allow pad ammo/fuel transfer only after the aircraft is fully settled in its final landing spot.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Sidebar save-list delete button sizing parity (2026-03-06)** — updated save-row delete action to use the icon-button sizing class so it matches export at 40x40px and added E2E coverage for computed button dimensions.
  - Spec: [Expanded Sidebar Action Button Style Alignment](../specs/043-sidebar-action-button-style.md)

- [x] **F22 HUD bars (2026-02-25)** — selected F22 ammo bar looked stale because HUD preferred `airstrip.ammo` whenever `landedHelipadId` existed, even while airborne. Fixed renderer to use pad reserves only when aircraft is actually `flightState === 'grounded'`.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 follow-up** — blocked friendly-building attack commands/cursor (unless force-attack), fixed owner-aware target detection, added building HUD hover tooltips for HP/fuel/ammo bars, expanded F22 cruise orbit to ~5 tiles, tuned F22 rocket cadence to 333ms full-burst behavior, and restricted airborne F22 targeting/damage to rocket AA + air units.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Ensure mobile landscape initial load always shows the sidebar (condensed/open), sync safe-area** — insets on first paint so iOS portrait bottom inset fills without device rotation, and pin the landscape notification bell to top-left to avoid sidebar overlap.
  - Spec: none

- [x] **Ensure mobile portrait first paint defaults to condensed sidebar via CSS media-query** — fallback so the expanded sidebar is not visible before JS layout classes are applied.
  - Spec: none

- [x] **Continue button should unlock with a reward animation only after step goals are met.**
  - Spec: none

- [x] **Portrait condensed build bar now hides locked production buttons while keeping unlocked** — ones visible in the scrollable row.
  - Spec: none

- [x] **PWA portrait condensed build bar now reaches the bottom edge of the screen without leaving a gap.**
  - Spec: none

- [x] **Fixed swipe-up gesture in portrait condensed mode conflicting with drag-to-build - removed** — expand-from-bar gesture and added dedicated sidebar expand button instead.
  - Spec: [Mobile Portrait Sidebar Expand Button](../specs/022-mobile-portrait-sidebar-expand-button.md)

- [x] **Defeat modal subtitle overlapping statistics — now subtitle lines are wrapped and stats start below the subtitle (fix** — `src/rendering/uiRenderer.js`)
  - Spec: none

- [x] **Add ammo-based defensive turret logistics** — align rocket turret muzzle flashes to 6 spawn points, add selected ammo/reload HUD bars for turretGun V1-V3/rocket/artillery turrets, enforce turret ammo consumption + reload via ammo trucks, and enable mutual ammo-truck↔turret move-into cursor/click interactions.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Align Apache helicopter selection hits with the rendered helicopter/HUD so clicks are** — not required between the image and its shadow.
  - Spec: [Apache selection alignment](../specs/020-apache-selection-alignment.md)

- [x] **Align mobile control-groups action button icon (`1·2·3`) with other bottom-bar icons (vertical** — + horizontal centering) — fixed CSS in `styles/sidebar.css` and `styles/base.css`.
  - Spec: none

- [x] **Hide the desktop energy bar while in the mobile landscape layout so** — only the dedicated mobile status bar energy indicator is visible.
  - Spec: none

- [x] **Hide the desktop money bar while in the mobile landscape layout so** — only the dedicated mobile HUD money indicator is visible.
  - Spec: none

- [x] **Ensure the standalone/PWA mobile landscape layout can scroll upward while dragging to** — build and does not leave a stray black bar along the bottom edge of the viewport.
  - Spec: none

- [x] **Ensure the Restart Game button does also update the occupancy map when a new map is generated.**
  - Spec: none

- [x] **Some HUD elements like the health bar and the attack pins can** — get rendered under the units layer. Ensure they are always on top of the units and buildings.
  - Spec: none

- [x] **When selecting a group using number buttons the autofocus on the group** — is totally off. Fix the coordinates (maybe a retina issue) and then disable the feature on first keypress of a number key but enable it when the key was pressed twice within 500ms.
  - Spec: none

- [x] **Images in build button do not show up immediately after clicking the tab (only after 2nd click)**
  - Spec: none

- [x] **Build menu is clickable even before game was started. Disable the build** — button until the game gets started. Even the build progress starts before the game got started.
  - Spec: none

- [x] **When I click on some build button twice there is a 3 shown in the batch count.**
  - Spec: none

- [x] **Ensure in mobile condensed production rows that default/inactive build buttons stay hidden** — until they become active or unlocked.
  - Spec: none

- [x] **Bugfix: Ensure game restart button also resets the build options in the** — sidebar.
  - Spec: [Restart Resets Sidebar Build Options](../specs/043-restart-resets-sidebar-build-options.md)

- [x] **Route the `i` key and sidebar info (`ℹ️`) button to the settings** — modal keybindings tab and remove the redundant legacy "Game Controls" modal entirely.
  - Spec: [Spec: Key Bindings Editor Modal](../specs/spec-keybindings-editor.md)

- [x] **During unit-destruction freeze delay, hide HP/health bar display for destroyed units so** — no 0-HP HUD remains visible before cleanup.
  - Spec: none

- [x] **Ferry cargo HUD tooltip now lists different loaded unit types on separate lines.**
  - Spec: none

- [x] **Mobile follow-up** — set an explicit production-bar drag flag from capture-phase touch movement, consume it before release activation, and reset it only after the release decision.
  - Spec: none

- [x] **Real-iPhone portrait follow-up** — preserve immediate rapid stack taps while observing and locking the production button's actual reparented scroller and declaring its native pan axis so a horizontal bottom-bar scroll can never dispatch build activation.
  - Spec: none

- [x] **Fix HUD bar hover tooltips across all HUD modes (legacy/modern/borderless/donut) using geometry-aware** — hit zones that stay robust to HUD style/thickness changes and future mode extensions.
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [x] **Fix deferred-CSS regression where Settings/Cheat modals could stay hidden, and hide all** — production buttons by default until production setup JS reveals tech-tree-eligible options.
  - Spec: none

- [x] **Fix portrait condensed mode follow-up** — action buttons matching landscape style with background/borders, moved 10px right, toggle button stretching full height with no border-radius, build buttons visibility ensured.
  - Spec: none

- [x] **Fixed portrait sidebar swipe functionality** — prevent syncPortraitSidebarState() from overwriting user swipe actions by only syncing stored state once on initial portrait mode entry.
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [x] **Fix mobile landscape layout on iPhone 13 Pro Max so the right-side** — safe-area strip renders map content, build buttons align to the far edge, and the top-right power bar lines up with the sidebar.
  - Spec: none

### Audio and Voice

- [x] **Restart old-session sound termination (2026-03-31)** — restart now force-terminates active session audio (SFX, narrated queue, background music, and milestone video audio/queue) before reinitializing game state so old match sounds cannot leak into the new session.
  - Spec: none

- [x] **Fix tank movement loop audio lifecycle** — stop immediately on halt and prevent same-unit overlapping loop instances that caused runaway loudness.
  - Spec: none

- [x] **Avoid AudioContext start warnings by resuming audio only after a user gesture.**
  - Spec: none

- [x] **Unit destruction freeze delay (2026-04-16)** — when a unit reaches 0 HP it now remains frozen in place for 2 seconds (to allow impact animation completion) before cleanup triggers the destruction explosion, wreck registration, and synced explosion audio.
  - Spec: none

- [x] **Spec 006 Ensure the "critical_damage" sound is only played when the players** — units are hit from behind. Currently it is also played for enemy AI units.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Ensure the harvesting and ore unloading sound is not played when enemy units are doing it.**
  - Spec: none

- [x] **The sound for bullet impact seems to be missing.**
  - Spec: [Bullet Impact Explosion VFX Polish](../specs/061-bullet-impact-explosion-vfx.md)

- [x] **Prevent playing the same sound multiple times at the exact same time.** — When some sound x is already running do not add it on top but just start that sound from the beginning.
  - Spec: none

- [x] **Make sure the music does not play on startup automatically.**
  - Spec: none

### Missions and Campaign

- [x] **Mission-load sidebar party ownership reconciliation (2026-03-24)** — preloaded `partyStates` could keep Green as `AI` even for local host sessions; `ensurePartyStates` now reconciles the local party to host alias + `aiActive=false` for non-client sessions so multiplayer labels are correct immediately after mission load.
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **Multiplayer sidebar false local defeat on mission start (2026-03-24)** — `checkGameEndConditions` now treats legacy owner id `player` as equivalent to `player1` when counting surviving buildings/factories, preventing the local green player from being incorrectly marked `Defeated` at mission start; added unit regression coverage.
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **Ensure user docs modal on mobile portrait respects top safe-area inset, spans** — full screen width, and renders above the tutorial overlay; move docs/settings/cheats buttons above Multiplayer in the sidebar.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Tutorial minimize button does not collapse the tutorial overlay on mobile; ensure the button toggles a minimized state.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Tutorial continue button loses enabled state after minimize/restore; ensure state is preserved.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Ensure tutorial demo mouse indicator is hidden whenever tutorial is minimized, skipped,** — or completed so it never stays visible in the top-left corner.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Restore a voice on/off toggle inside the tutorial window.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Skip tutorial should hide the overlay and dock until re-enabled in settings.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Tutorial should not start when the show tutorial setting is disabled on reload.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Hide the tutorial dock ("?") button after completion with a visibility-hidden class** — on completion and on reload until the tutorial is restarted from settings.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Fixed tutorial step 12 completion not unlocking when user uses remote control** — by adding hasUsedRemoteControl flag to units and updating completion check.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

### Performance

- [x] **Mine layer occupied tiles and sweeper dust crash (2026-09-24)** — mine deployment now skips tiles blocked by another unit, a building, a wreck, an existing mine, or impassable terrain and continues with the next plant order. The deploy timer and progress bar use the simulation clock, so a `performance.now()` stamp can no longer freeze the bar at zero. Sweep dust radius is computed from clamped particle age on that same clock, so `renderDust` no longer passes a negative radius to `arc`.
  - Spec: [Land Mine System (Mine Layer + Mine Sweeper)](../specs/011-mine-system-planning/spec.md)

- [x] **Physical-iPhone procedural-water + street/SOT FPS collapse (2026-07-12)** — restored the known-good split rendering architecture so WebGL/WebGPU batches only animated procedural water and its SOT wedges, while static street/land art stays in the bounded prewarmed 2D chunk cache; this prevents street atlas fragments from entering the per-frame water shader batch and preserves the validated coastline/street composition.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Washed-out mobile units/buildings/map text regression (2026-07-18)** — keep adaptive/configured DPR caps scoped to WebGL/WebGPU terrain and minimap rendering while the transparent entity, building, label, and gameplay UI canvas always uses native device DPR; preserve correct game-over hit testing across the split ratios.
  - Spec: [Mobile FPS regression after sprite-sheet routing + realtime bottleneck overlay](../specs/068-mobile-fps-regression-bottleneck-overlay.md)

- [x] **Normal-game iPhone DPR/chunk-cache crash and 5fps regression (2026-07-11)** — start touch rendering at 1x, use effective rather than native DPR for offscreen texture preparation, avoid unchanged canvas backing-store reallocations, use a bounded small-chunk mobile cache, build visible cold chunks once instead of redrawing an uncached fallback every scrolling frame, and release evicted canvas memory.
  - Spec: none

- [x] **iOS Chrome/WebKit startup crash risk and Simulator FPS false-negative (2026-06-27)** — render-size calculations now use the actual canvas backing-store ratio instead of raw device DPR across 2D, WebGL, minimap, and camera-follow paths; the iOS Simulator benchmark now compares rounded displayed average FPS so `54.98` passes the configured 55fps gate.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Mobile full-map scroll FPS/crash regression (2026-05-02)** — extended `mobileFpsRegressionBenchmark` so mobile scrolls across the entire map and fails on below-60fps scroll windows, compared deploy previews 650 and 645, and prewarmed static terrain chunks after SOT/cache invalidation so scrolling into newly visible terrain does not build cold chunks on the critical frame.
  - Spec: none

- [x] **Mobile 60fps GPU terrain follow-up (2026-05-01)** — moved default street-sheet terrain rendering into the WebGL secondary-atlas path, skip CPU street repaint work in the GPU base-layer path, expose mobile canvas pixel density in the config editor from native DPR down to 1x, and validated the non-throttled mobile benchmark at the practical 60Hz ceiling.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Mobile water/crash follow-up after FPS fix (2026-05-01)** — WebGL water now uses the actual canvas backing-store ratio after adaptive DPR changes, the CPU fallback renders animated water separately so terrain chunks stay static, chunk cache hit/miss/redraw counters are visible in the FPS overlay, mobile minimap rendering is throttled, and the mobile benchmark records visible-water samples plus page errors while scrolling.
  - Spec: [Mobile FPS regression after sprite-sheet routing + realtime bottleneck overlay](../specs/068-mobile-fps-regression-bottleneck-overlay.md)

- [x] **Mobile sprite-sheet/SOT framerate regression deep follow-up (2026-05-01)** — added an opt-in E2E benchmark that reproduced the <10fps mobile failure versus >60fps desktop game-loop throughput, compared deployed preview 650 against preview 640, fixed high-DPR visible tile overdraw plus CPU street/water compositing cache bypasses, capped realtime canvas DPR to reduce mobile bandwidth, and documented remaining render candidates in spec 068.
  - Spec: [Mobile FPS regression after sprite-sheet routing + realtime bottleneck overlay](../specs/068-mobile-fps-regression-bottleneck-overlay.md)

- [x] **Mobile FPS regression from default parallel sprite sheets (2026-04-26)** — added a build-time major sprite sheet compiler that packs tagged tiles from default SSE sheets into `major_sprite_sheet_default.webp/.json`, made it the default integrated-sheet runtime selection, and wired SSE/index defaults to load the major sprite sheet tags by default while keeping per-sheet options available.
  - Spec: none

- [x] **Real iPhone crash reproduction gap (2026-07-09)** — add a separate real-device iOS benchmark that runs a 100x100 auto-scrolling map from a physical iPhone, collects heartbeat/result telemetry, detects page reload/death, black terrain, and white street flicker, while keeping the existing Simulator benchmark separate.
  - Spec: none

- [x] **Real-game mobile performance diagnosis gap (2026-07-10)** — add an opt-in `?monitor` recorder for the normal game that aggregates frame, update, render, minimap, renderer-phase, terrain-chunk, GPU, canvas, map, and entity metrics without retaining per-frame data; expose it through a red sidebar record button and a copyable JSON report for physical iPhone investigation.
  - Spec: none

- [x] **Ensure for every attacking and chasing unit that the pathfinding is not** — updated more often than every 3s to improve performance.
  - Spec: none

- [x] **Investigate and fix the sidebar game-speed regression so simulation systems follow the** — speed input via a fixed-step simulation clock while render FPS stays unchanged and gameplay remains frame-rate independent.
  - Spec: none

- [x] **Investigate severe mobile FPS regression introduced by recent sprite-sheet street routing changes;** — optimize street tile selection path and add realtime FPS-overlay bottleneck attribution (CPU update vs CPU render vs GPU/compositor wait plus JS heap visibility).
  - Spec: [Mobile FPS regression after sprite-sheet routing + realtime bottleneck overlay](../specs/068-mobile-fps-regression-bottleneck-overlay.md)

- [x] **Browser-verified iPhone 13 Pro scroll crash/performance regression (2026-05-02)** — used the in-app browser to run long map-scroll stability checks, bounded the terrain chunk cache with LRU eviction so scrolling cannot keep allocating terrain canvases indefinitely, and extended the mobile benchmark with larger maps, repeat laps, heap sampling, and chunk-cache budget assertions.
  - Spec: none

- [x] **Street-triggered iPhone FPS collapse (2026-07-12)** — replace the oversized combined major sheet used by the WebGL street sampler with the dedicated 1024px street atlas, cache topology-aware final street selections, and group secondary-sampler instances to reduce mobile GPU texture divergence.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **SSE preview+performance+popover follow-up (2026-04-15)** — static tab now hard-disables/hides animated preview loop, SSE preview RAF only runs while modal is open in Animated mode to avoid global FPS regression, and metadata popover opens to the right of `(i)` to prevent side cropping.
  - Spec: none

- [x] **Analyze the reported 75-to-40 FPS scrolling regression with source audits, GPT-5.6 Luna** — subagents, the existing mixed-biome benchmark and a function-level CPU profile; document measured findings in `rendering_analysis.md`.
  - Spec: none

- [x] **Replace the AGENTS.md 20% regression allowance with the strict 75 FPS /** — 13.333 ms requirement, retaining unchanged visual quality and animated procedural water.
  - Spec: [Rendering pipeline: strict 75 FPS and preparation](../specs/rendering-pipeline-75fps.md)

### Saves and Replay

- [x] **Multiplayer client sync (2026-09-22)** — craters, debris, and other map decals are included in the host state snapshot and applied on clients, including late joiners. Explosion effects keep host world-pixel positions and the simulation clock so clients play the same animation in the same place. Client projectiles replay parabolic and ballistic arcs and dead-reckon linear shots instead of lagging a snapshot behind the impact. Kicking a player clears reconnect state even when the data channel closes afterward.
  - Spec: [Bullet Impact Explosion VFX Polish](../specs/061-bullet-impact-explosion-vfx.md)

- [x] **Canvas save-drop persistence regression (2026-04-21)** — dropping save JSON onto the map now loads directly from file state without writing an imported entry into localStorage; drag/drop is now load-only while sidebar Import retains persistent save import behavior.
  - Spec: none

- [x] **Game speed slider localStorage persistence (2026-04-14)** — game speed changes now write to `localStorage` and startup restore now hydrates `gameState.speedMultiplier` from `rts-game-speed-multiplier`, so the sidebar speed setting survives page reloads even before loading a save/autosave.
  - Spec: none

- [x] **Replay determinism AI command phase ordering (2026-03-25)** — classic AI and LLM replay commands are now deferred to the post-tick replay phase so they execute after the same simulation step that recorded them, instead of being replayed one tick too early at tick start and drifting ore, budgets, money, and RNG state.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay determinism terminal marker tick halt (2026-03-25)** — ore spread was already driven by deterministic session RNG, but replay playback still allowed one extra fixed-step after consuming the terminal replay marker. Playback now halts that tick before any further simulation systems run, preventing the stray end-of-replay ore growth, refinery status, money, budget, and RNG-call drift.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay determinism terminal marker deferred-command flush (2026-03-25)** — the terminal-marker halt must still preserve and flush any already-due deferred classic-AI/LLM replay entries before pausing. Dropping that final deferred queue caused late-game building placements, rally points, and AI budgets to diverge sharply even though the extra simulation tick was gone.
  - Spec: [Building Selection Should Not Issue Move Commands](../specs/046-building-selection-no-move-command.md)

- [x] **Replay load sound-session cleanup (2026-03-26)** — loading a replay now force-terminates all active audio from the prior session (including queued narrated clips and background music reset) before baseline state restoration, preventing previous match sounds from leaking into replay playback.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay determinism entity-id stability (2026-03-25)** — runtime entity ids were still generated with `Date.now()`, so live and replay sessions could build the same structures with different ids even under the same deterministic RNG stream. Deterministic sessions now derive ids from seeded RNG state instead of wall-clock time, and the replay comparer sorts buildings/rally-point lists by stable gameplay coordinates before `id` so id noise cannot scramble otherwise identical building sets.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay determinism post-tick playback finalization (2026-03-25)** — replay playback no longer pauses immediately when the terminal marker is consumed at tick start; it now finalizes after the current simulation tick completes, so ore spread, unloading, AI budgets, RNG, and counters match the same post-tick state captured in the live save.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay determinism harvester retry scheduling (2026-03-25)** — harvester ore retargeting/manual-target wait loops no longer use wall-clock `setTimeout`; retries now run from deterministic simulation-time scheduling and the pending retry state is saved/restored with units so replay baselines keep the same ore-search timeline.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay determinism comparer camera/derived-stat filtering (2026-03-25)** — the replay overlap comparer now ignores camera scroll plus derived power/kill counters so mismatch reports stay focused on causal gameplay drift instead of observer/UI noise.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay guard-mode capture parity (2026-03-26)** — replay now records and restores guard assignments created by AGF drag-selection over friendly units (including multi-target guard lists), so guarded-follow behavior and guard icons match the original session instead of dropping back to non-guarded state during playback.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay guard target + cheat cursor reference parity (2026-03-26)** — guard target entity references now include deterministic unit metadata (owner/type/replaySpawnOrdinal/buildDuration) with alias-aware replay resolution so guard commands survive post-baseline id drift, and cheat replay commands now persist cursor world coordinates so spawn/build cheats replay at the recorded map position independent of viewer camera scroll.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay/save map consistency restoration (2026-03-24)** — save/replay baselines now persist full map settings (`seed`, dimensions, ore-field count, player count) plus static tile resource state, and the loader restores that canonical tile snapshot before re-placing buildings so imported replays no longer inherit ore/resource/map-setting drift from the previously loaded map.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Save/import replay unification (2026-03-24)** — the existing sidebar import button now accepts exported replay JSON in addition to save JSON, refreshes the replay list, auto-loads a single imported replay, and renames the button tooltip to "Import save game or replay".
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Ensure cheat console input supports ArrowUp/ArrowDown command history recall with localStorage persistence** — and configurable history limit (default 10).
  - Spec: [Cheat Console UI Alignment](../specs/026-cheat-console-ui.md)

### Tooling and CI

- [x] **Full-repo lint on PR 692 (2026-09-23)** — `npm run lint` failed in CI because `preparedMap.js` uses `AbortController` and `DOMException` while `eslint.config.js` browser globals omitted them. Both are now readonly globals beside `fetch` and `Request`. Prepared-map behavior is unchanged.
  - Spec: none
  - Related: [#692](https://github.com/theSystem85/code-for-battle/pull/692)

- [x] **Netlify deploy-preview install crash (2026-09-20)** — `netlify.toml` no longer deletes `package-lock.json` and runs a floating `npm install`. That resolution path crashes npm/arborist with `Cannot read properties of null (reading 'edgesOut')` while loading vitest optional peers. It failed Deploy Preview 682 and the previews for `wang-tiles-smooth-transitions` (PR 683), `cursor/organic-coast-generation-351e` (PR 684), and `cursor/loading-screen-f29f` (PR 685) during `building site`. The build command now uses `npm ci --include=dev` so Vite/Vitest stay pinned to the lockfile. Feature code on those branches was unchanged.
  - Spec: [Netlify Lockfile Install](../specs/085-netlify-lockfile-install.md)
  - Related: [#683](https://github.com/theSystem85/code-for-battle/pull/683), [#684](https://github.com/theSystem85/code-for-battle/pull/684), [#685](https://github.com/theSystem85/code-for-battle/pull/685), [#682](https://github.com/theSystem85/code-for-battle/pull/682)

- [x] **Vitest safe-area teardown error (2026-04-13)** — `src/ui/deviceLifecycle.js` scheduled delayed safe-area sync callbacks that still fired after DOM teardown; `syncSafeAreaInsets()` now no-ops when `document` is unavailable so unit runs finish without unhandled `document is not defined` exceptions.
  - Spec: none

- [x] **Headless E2E audio mute enforcement (2026-04-04, updated 2026-04-14)** — Playwright headless runs now mute audio through three layers: Chromium `--mute-audio`, a dedicated headless browser storage state that forces tutorial voice off plus master volume `0`, and an explicit `VITE_HEADLESS_E2E_MUTE_AUDIO=1` runtime flag when Playwright launches the dev server. This closes the remaining gap where browser TTS could still read tutorial steps aloud during `npm run test:e2e`.
  - Spec: [IndexedDB Browser Storage Migration](../specs/070-indexeddb-browser-storage.md)

- [x] **Rocket turret anti-air tuning (2026-03-20)** — rocket turret explosions now apply Apache-specific anti-air damage and use the airborne Apache visual center for blast-distance checks, so direct hits deal the same damage whether the Apache is grounded or airborne; regression coverage includes unit, logic, and Playwright E2E tests.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Airborne render-layer precedence (2026-03-20)** — airborne units now render after all buildings, grounded-unit bases, and grounded-unit overlays so helicopters/jets always appear visually on top; added unit coverage for render-layer partitioning and a Playwright regression that instruments the live frame pipeline to verify airborne draw order.
  - Spec: [Airborne Render Layering](../specs/052-airborne-render-layering.md)

- [x] **Fix `npm run lint:fix:changed` filename truncation bug where root-level unstaged files could** — lose their first character (e.g. `playwright.config.js` became `laywright.config.js`) due to trimming git porcelain status lines before slicing.
  - Spec: none

- [x] **Fixed smoke test failing with "Cannot read properties of null (reading 'setTransform')"** — and "Cannot read properties of null (reading 'clearRect')" by adding null checks for canvas contexts in CanvasManager and Renderer to handle headless browser environments where getContext() returns null.
  - Spec: [Playwright E2E Testing Framework](../specs/027-playwright-e2e-testing.md)

- [x] **Browser smoke test hardening (2026-04-01)** — `tests/integration/browserConsoleSmoke.test.js` now waits for `window.gameInstance` to prove startup completed and captures `console.error`, `window.error`, and `unhandledrejection` failures with readable diagnostics instead of relying only on a fixed delay.
  - Spec: [Playwright E2E Testing Framework](../specs/027-playwright-e2e-testing.md)

- [x] **Fix integration smoke test canvas mocking by patching `HTMLCanvasElement.prototype.getContext` so jsdom-created canvases** — in `index.html` no longer emit "Not implemented" startup errors.
  - Spec: [Playwright E2E Testing Framework](../specs/027-playwright-e2e-testing.md)

- [x] **Correct shoreline corner coverage, not just pixel overlap** — connect all four convex and four concave land/water corners using shared junction masks and remove isolated organic water cutouts shown in the supplied screenshot. Verified rendered alpha continuity, opaque land, chunk parity, unit tests and DPR-2 combat performance.
  - Spec: none

- [x] **SSE dropped-animation preview fix (2026-04-15)** — fixed animated preview for dropped blob/data sprite sheets by allowing non-filename paths in sprite-sheet animation instance creation and texture loading, plus added regression unit test coverage.
  - Spec: none

- [x] **Enforce agent workflow rule** — every implemented bugfix/feature must include a meaningful E2E test in the same task, and work must continue until that E2E passes without weakening test intent.
  - Spec: none

- [x] **Fix multiplayer E2E test** — pass `baseURL` to each `browser.newContext()` (Playwright does NOT inherit `config.use.baseURL` for manually created contexts), navigate clients directly to invite URLs, simplify join flow, and remove stale `test.use({ headless: false })` override.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Fix Netlify Blobs error - convert to Netlify Functions v2 format with native context**
  - Spec: none

- [x] **Fix Netlify function 404 errors - added redirect from /api/* to /.netlify/functions/api** — and removed conflicting config.path
  - Spec: none

### Other

- [x] **Landing header gap while scrolled (2026-09-25)** — smooth scrolling painted a dark band above the sticky header and left the blurred backdrop short of the viewport. Landing scroll is instant, the header stays outside the parallax layer, and the backdrop is overscanned so the shift never reveals an edge.
  - Spec: [Marketing landing page](../specs/090-marketing-landing-page.md)

- [x] **Rebase conflict cleanup (2026-04-16)** — resolved the `spriteSheetAnimation.js` merge markers by keeping the constant-based black-key blend implementation and preserving the widened near-black cutoff/soften thresholds from the stashed changes.
  - Spec: none

- [x] **Chain build ESC hard-cancel reliability (2026-04-16)** — pressing Escape now always clears chain build mode/primed state and chain build metadata, including edge cases where `gameState.paused` was true and the previous keyboard path early-returned before processing escape cancellation.
  - Spec: [Chain build escape cancellation reliability](../specs/063-chain-build-escape-cancel.md)

- [x] **Remote-control attack chase suppression regression guard (2026-04-16)** — player-selected units now keep aiming/firing at their selected target after remote-control input without auto-chasing that target for up to 5 seconds since the last remote command; chase resumes immediately on deselection or after timeout, and this behavior is codified in unit tests and the advanced-control spec to prevent regressions.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Friendly push-through yield remote-control parity (2026-04-14)** — friendly auto-yield now also triggers when the pusher is remote-controlled, even in lower-speed collisions, so manually remote-driven units can still clear blocked lanes via the same one-tile ally-yield behavior.
  - Spec: none

- [x] **Friendly push-through yield step (2026-04-14)** — when an idle friendly ground unit is physically pushed by another friendly unit, the pushed unit now automatically takes a one-tile move in the same push direction to clear the lane, but only if it does not already have a `moveTarget`/path.
  - Spec: none

- [x] **gameSetup.test.js diverging infinite loop fix (2026-03-31)** — `buildOreClusterPlan` fallback while-loop in `src/gameSetup.js` had no max-attempts guard; on small test maps (20×20, 30×30) the deterministic fallback positions cycled through coordinates all within distance 7 of existing clusters, causing `tooClose` to always be true and the loop to never terminate. Added `maxFallbackAttempts = 500` guard matching the pattern used by all other while loops in the file.
  - Spec: none

- [x] **Debug reroute false-positive reduction (2026-03-29)** — reroute logging now ignores normal path progression (head advances to prior next tile) so logs surface true recalculations instead of expected traversal updates.
  - Spec: none

- [x] **Retreat target overlay leaked AI-only retreat state (2026-03-25)** — the orange retreat marker now renders only for player-issued retreat commands, so host-party local AI retreat behavior no longer shows confusing observer-facing retreat icons during automated matches.
  - Spec: none

- [x] **Fix service worker cache writes for partial-content (HTTP 206) responses to prevent** — `Cache.put` runtime errors at startup.
  - Spec: none

- [x] **Attack step should unlock when remote-control firing is used.**
  - Spec: none

- [x] **Ensure factories spawn units only on unoccupied tiles by searching outward from** — the intended spawn tile until a free neighbor is found.
  - Spec: none

- [x] **(still an issue?) When about 10 units get stuck the game slows down significantly.**
  - Spec: none

- [x] **Fixed cheat system using non-existent `window.debugGetSelectedUnits()` function**
  - Spec: none

- [x] **Fixed ammunitionTruckLogic.js crash when target is undefined**
  - Spec: none

- [x] **Fixed player units becoming uncontrollable and moving in one direction until hitting** — obstacles after issuing move commands. The previous fix for path recalculation prevention was too aggressive - it skipped ALL stuck detection for player units with active paths, preventing recovery when units genuinely got stuck. Now stuck handling is only skipped for 2 seconds after a path is calculated, allowing stuck recovery to work after that grace period. Also added proper isDodging state cleanup when new move commands are issued.
  - Spec: none

- [x] **Clear restoration move overrides when new movement commands are issued so restored** — crewless units can't roam indefinitely.
  - Spec: [Restoration Move Override Reset](../specs/013-restoration-move-override/spec.md)

- [x] **when a construction process runs out of money and then new money** — comes in by cheat code make sure the construction process is continued.
  - Spec: none

- [x] **The initial power level shows 100 but in fact it is just 0. Make sure it actually is 100.**
  - Spec: none

- [x] **Unit when produced by the enemy leave the factory immediately not after the build time is done.**
  - Spec: none

- [x] **Enemy units come out of factory immediately before the build indicator shows that the build is done**
  - Spec: none

- [x] **Saving games does not work anymore.**
  - Spec: none

- [x] **The occupancy map shows that not the center of a unit is** — determining weather a unit is on a tile but its top left corner.
  - Spec: none

- [x] **When in attack mode unit do currently not respect the occupancy map.**
  - Spec: none

- [x] **all selected units try to go to the same tile when commanded** — to move. That causes them to get stuck there and dodge around instead of standing still. Make sure when a group is commanded to move that all units get different nearby tiles to move to.
  - Spec: none

- [x] **The harvesting animation is now working anymore.**
  - Spec: none

- [x] **When tank_v1 is produced it leaves the factory in different (random?) colors. Tank_v1 should always be blue.**
  - Spec: none

- [x] **Units move much slower only when moving to the west**
  - Spec: none

- [x] **After scrolling on the map the units get deselected**
  - Spec: none

- [x] **The yellow selection frame is not visible anymore when dragging a frame around a group of units to select it.**
  - Spec: none

- [x] **When enemy base is destroyed the game still continues but it should** — end with a message on the screen showing the current win/loss ratio of the player.
  - Spec: none

- [x] **The coloring of enemy unit types shall be the same as for** — players units. Only mark enemy units by giving them a red health bar
  - Spec: none

- [x] **The selection border when drag selection is performed by user is not visible anymore (regression). Please get it back!**
  - Spec: none

- [x] **Console warning** — "findPath: destination tile not passable (units.js:101)"
  - Spec: none

- [x] **Units when attacking should keep being close enough to target in order** — to be in range of attack but not too close so they get also hit by their own bullets impact.
  - Spec: none

- [x] **Adjusted defensive forced-target ordering so each newly assigned target becomes immediate active** — target (position 1) while previous active target is pushed to the front of the queued list.
  - Spec: none

- [x] **Give embark commands unconditional priority over guard commands in both ground-to-transport and** — transport-to-ground click directions; transports must never guard ground units.
  - Spec: none

- [x] **Make S cancel any selected transport or participating cargo unit's complete embark/disembark** — operation, restoring occupancy/embarked state and removing every pending lock/reference so a new operation can start immediately.
  - Spec: none

- [x] **Real-iPhone landscape follow-up** — defer only landscape custom tap dispatch for 50 ms so asynchronous vertical WebKit scrolling can veto the release without losing rapid stack taps, including on 120 Hz displays.
  - Spec: none

- [x] **Fix headed-window relocation across displays by launching HOST/RED/YELLOW in separate Chromium browser** — processes (instead of contexts within one shared browser), preventing CDP window-bound collisions that moved the host window back to the smaller screen.
  - Spec: none

- [x] **fix path finding/dodging algorithm. Generate flow diagram on how it currently works** — to get betting analysis on how to fix it. → Deep analysis created in `AI_Docs/PATHFINDING_MOVEMENT_DEEP_ANALYSIS.md`. Fixed stale non-occupancy path continuation bug and dodge path restoration backtracking.
  - Spec: none

- [x] **Fix right-click scrolling in edit mode by allowing right-click events to pass through to normal scrolling logic.**
  - Spec: none

- [x] **Fix image preview rendering** — add onload handlers to trigger re-render when images load.
  - Spec: none

- [x] **Fix host polling stopping after first 404 - added try-catch wrapper in _schedulePoll**
  - Spec: none

- [x] **Fix CDN caching 404 responses - added cache-busting timestamps and no-store to fetch requests**
  - Spec: none
