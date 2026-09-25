# Improvements

An improvement changes an existing feature where nothing is broken: polish, performance, UX, refactors, and balance. Broken or spec-contrary behavior belongs in [Bugs.md](Bugs.md). New capabilities belong in [Features.md](Features.md).

Open work is grouped by game area. Finished work is under [Done](#done) in the same area order. Add a new item under the matching open heading, not at the end of the file:

    - [ ] **Short title** — One-line description.
      - Spec: none

When a spec exists, replace `Spec: none` with a relative link such as `[Title](../specs/021-f22-raptor-unit.md)`. Do not invent a spec file. When the work is finished, mark the checkbox `[x]` and move the entry under Done for that area.

## Contents

- [Rendering and WebGPU](#rendering-and-webgpu)
- [Terrain and Map Generation](#terrain-and-map-generation)
- [Units and Combat](#units-and-combat)
- [Air and Jets](#air-and-jets)
- [Economy and Buildings](#economy-and-buildings)
- [AI](#ai)
- [Multiplayer and Networking](#multiplayer-and-networking)
- [UI, Sidebar, and Settings](#ui-sidebar-and-settings)
- [Missions and Campaign](#missions-and-campaign)
- [Performance](#performance)
- [Tooling and CI](#tooling-and-ci)
- [Done](#done)

## Rendering and WebGPU

- [ ] **Rendering preparation program (2026-09-19)** — Wave 2 lanes and I20 wiring are in the codebase. Remaining work is Q30/Q31 physical 75 FPS, visual, resize and memory certification on qualifying hardware. Headless/software runs stay diagnostic-only.
  - Spec: [Rendering preparation contracts](../specs/069-rendering-preparation-contracts.md)

- [ ] **Create a WebGPU transition plan (Chrome/Safari-aligned) covering adapter setup, pipeline parity, asset** — migration, fallback strategy, and a settings toggle for WebGPU/WebGL selection.
  - Spec: [Radar Offline Animation Settings Toggle](../specs/042-radar-offline-settings-toggle.md)

- [ ] **Implement mutation-driven terrain validity, startup readiness/baking, bounded byte residency and retained animated-water** — geometry per the delegation checklist.
  - Spec: [Rendering Wave 2 ownership lanes](../specs/084-rendering-wave2-lanes.md)

- [ ] **Prepare final-size map/entity imagery before gameplay; audit DPR/transforms and resolve changing raster-effect** — sizes without degrading visuals; allow only aircraft takeoff/landing size-animation exceptions.
  - Spec: [Rendering preparation contracts](../specs/069-rendering-preparation-contracts.md)

## Terrain and Map Generation

- [ ] **Move remaining sprite, overlay, and minimap rendering to GPU-backed WebGL/WebGPU pipelines; terrain** — now has opt-in WebGPU atlas instancing with automatic WebGL fallback.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [ ] **Ground units should drive 30% slower when moving over crystal tiles, with harvesters unaffected.**
  - Spec: [Crystal terrain slowdown](../specs/020-ground-crystal-slowdown.md)

- [ ] **Move main-map and minimap rendering to GPU-backed WebGL/WebGPU pipelines using atlas streaming** — and instanced quads for terrain and sprites to reduce CPU draw overhead.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [ ] **Convert all raster files in `public/images/terrain/source` to quality-85 WebP and keep terrain** — build scripts and specifications aligned with the renamed assets.
  - Spec: [Terrain source WebP conversion](../specs/082-terrain-source-webp.md)

## Units and Combat

- [ ] **Show numbered movement waypoints for active unit paths using the PPF marker** — style, with a W-key toggle to show/hide them.
  - Spec: none

- [ ] **Show out-of-range attack cursor only for combat units, switch to in-range attack** — cursor appropriately, and include distance/max-range labels on the out-of-range cursor.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [ ] **remove "tank" in favour of "tankV1" from codebase (redundant?)**
  - Spec: none

## Air and Jets

- [ ] **Slow Apache rocket volley cadence by 50% and shorten the reload cooldown** — between volleys by 30% so bursts fire slower but rearm faster.
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [ ] **Speed up Apache helicopter production based on vehicle factory count using the same multiplier as ground vehicles.**
  - Spec: none

- [ ] **Enforce one-Apache-per-helipad when issuing group landing commands by assigning each heli to** — a distinct available pad near the clicked target.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

## Economy and Buildings

- [ ] **Expand the sell buildings function so that also unit can be sold** — when they are in the repair workshop and fully repaired and the player clicks on them while in repair mode. When in repair mode and the user hovers over a unit that does not fulfill these conditions show the selling_blocked cursor instead of the sell cursor.
  - Spec: none

- [ ] **Enable symmetrical supply interactions** — supply vehicles should travel to the requesting units (not vice versa), dragging a box with any selected service unit queues every serviceable unit inside (ammo truck, ambulance, tanker, recovery), show move-into cursor, and queue requests LIFO when the provider is busy.
  - [ ] Deterministic lockstep visuals: ensure multiplayer clients render explosion animations correctly, remote building construction plays its full animation instead of popping in, and building smoke only starts after the build animation completes.
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

## AI

- [ ] **Enemy AI should automatically build next what is the current production bottleneck** — regarding money supply. Highest prio is energy. When energy is too low it will build a power plant. When there is too little money it will build harvesters but only if there is less than 4 havesters per refinery otherwiese it will build a refinery but only if the money has reached 0 before. So whenevery the money supply reached 0 the highest prio is to build another refinery (given the power supply is sufficient). When money supply is sufficient focus on building a good base defence with at least 2 turrets and one tesla coil and one rocket launcher. If that is given focus on producing as many combat units as possible. When the money raises faster than tanks can be build then build more vehicle factories to speed up the production.
  - Spec: none

## Multiplayer and Networking

- [ ] **T032 Multiplayer network stats + bullets**
  - TODO: finish host/client byte tracking for WebRTC data channels, display send/receive rates & totals inside FPS overlay/perf widget, and ensure bullet interpolation updates alongside unit interpolation on clients
  - Spec: [Multiplayer Network Stats Overlay](../specs/multiplayer-network-stats.md)

## UI, Sidebar, and Settings

- [ ] **Add HUD mode 4 with quarter-donut corner bars and crew at top/right/bottom/left** — centers with 3px spacing from arc starts; refine HUD 3 corner-centering and HUD 2 outline/bar alignment.
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [ ] **Add settings dropdown for selected-unit HUD rendering modes (classic pre-refactor, modern with** — border, modern without border + corner crew markers).
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [ ] **Follow-up HUD tweak** — constrain selected-unit edge bars to max 75% tile span so 1px selection outline remains visible, and center crew indicators horizontally beneath the bottom bar.
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [ ] **Refactor selected-unit HUD** — 1px yellow outline, 3px stat bars (ammo/hp/fuel/load/xp) centered on outline with dark grey background and no borders, move crew indicator below bottom bar, place XP stars overlapping HP bar by ~33%, and enlarge HUD footprint beyond tile size to avoid occluding the selected unit.
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [ ] **Refactor main.js via code-splitting (<1k LOC per file) into orchestrator, device lifecycle,** — and mobile layout modules while keeping tests passing.
  - Spec: none

- [ ] **Show the money/energy status bar in portrait condensed mode within the safe-area** — gap beneath the build buttons without shifting the build bar upward.
  - Spec: none

- [ ] **In non-PWA portrait condensed mode, dock the money/energy bars to the right** — of the build bar after the toggle, with vertical fill and rotated labels that do not increase sidebar height.
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [ ] **Persist mobile portrait sidebar expanded/collapsed/condensed preference across reloads and default to condensed** — on first load.
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [ ] **Disable the Buildings tab when the construction yard is destroyed and auto-switch** — to the Units tab if a vehicle factory remains available.
  - Spec: none

## Missions and Campaign

- [ ] **Ensure tutorial voice narration also reads the hint/subtext guidance for each step.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

## Performance

- [ ] **Mobile performance recovery plan (2026-05-24)** — evaluate and implement prioritized render-path improvements to move mobile back from ~10fps toward 60fps, starting with the most critical selected item after reviewing the plan.
  - Spec: [Mobile FPS regression after sprite-sheet routing + realtime bottleneck overlay](../specs/068-mobile-fps-regression-bottleneck-overlay.md)

- [ ] **Analyze `tests/lighthouse/default.report.json`, maintain a weighted top-10 Lighthouse performance TODO list, and track** — execution across `specs/lighthouse-performance/` task specs.
  - Spec: [Lighthouse Performance Remediation Plan (Top 10)](../specs/lighthouse-performance/README.md)

- [ ] **Certify the combined pipeline at 75 FPS on qualifying reference hardware through** — first/repeat full-map fast scrolling and worst-case combat, with visual parity, live procedural water and bounded memory. Current local results do not pass this target.
  - Spec: [Rendering pipeline: strict 75 FPS and preparation](../specs/rendering-pipeline-75fps.md)

## Tooling and CI

- [ ] **Add unit coverage for lockstep inputBuffer networking helpers (Task 5.1 tests).**
  - Spec: [Deterministic Lockstep Networking](../specs/015-deterministic-lockstep/spec.md)

- [ ] **Add unit test coverage for mouse handler input flows (Task 4.4) with meaningful assertions.**
  - Spec: none

- [ ] **Stabilize unit test mocks after runtime API changes (config exports, harvester runtime** — state exports, deterministic RNG export, enemy utility exports) so unit suites run without import-time failures.
  - Spec: none

- [ ] **Align unit tests with simulation-time behavior (mine deploy timestamps, AI decision timing,** — projectile timing/speed assertions) while keeping behavior-focused assertions meaningful.
  - Spec: none

- [ ] **Add more E2E scenarios (combat, multiplayer, save/load)**
  - Part of: ✅ Playwright E2E Testing
  - Spec: [Playwright E2E Testing Framework](../specs/027-playwright-e2e-testing.md)

- [ ] **Add a headless browser smoke test that fails on console errors and wire it into CI/Netlify pipelines for merge gating.**
  - Spec: [Forced Reflow + Console Error Cleanup](../specs/lighthouse-performance/10-reflow-console-errors.md)

- [ ] **Add unit tests for the multi-unit input handler utilities (task 4.9 coverage work).**
  - Spec: none

- [ ] **Add unit tests for `src/input/unitCommands.js` (utility queues, resupply assignments, recovery tank handling)** — to improve input-system coverage.
  - Spec: none

- [ ] **Add unit tests covering AI party synchronization during multiplayer disconnects (aiPartySync).**
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [ ] **Add unit tests for remote control state handling (Task 4.10 coverage for `src/input/remoteControlState.js`).**
  - Spec: none

- [ ] **Add cursorManager input system unit tests (Task 4.2) to cover cursor state transitions and range UI behavior.**
  - Spec: none

- [ ] **Add a JSON file that determines the whole tech tree. Refactor the code to obey this file.**
  - Spec: none

## Done

Completed entries stay here so the detail is not dropped. Do not add new work in this section.

### Rendering and WebGPU

- [x] **Retire legacy individual map-tile rendering (2026-09-24)** — remove grass-tile discovery, generated `map_sprites` atlas tooling, legacy tile-variation caches, and `with_grass`/grass asset references; map terrain/resource art now resolves from SSE sprite-sheet metadata, with animated/procedural water retained as the explicit water fallback.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Destruction freeze polish follow-up (2026-04-16)** — freeze now locks tank/turret orientation and carries the same turret angle into wrecks; destruction explosion is rendered 30% larger with texture prewarm to avoid startup stutter; black halo cleanup on sprite-sheet fire/explosion edges was tightened further.
  - Spec: none

- [x] **Ensure mobile planning base-proximity expansion is sequential and order-locked** — each next tile may extend range only from previously accepted planning tiles in draw order.
  - Spec: none

- [x] **Mobile chain-draw planning polish** — block starting paint when first tile violates placement/proximity, skip+red-mark invalid or too-far neighbor tiles, show per-tile draw order numbers, prevent planning onto occupied ground, and shorten planning labels (Wall/Radar).
  - Spec: none

- [x] **Apply a globally consistent open-source futuristic font (compact footprint) across CSS UI** — and canvas-rendered in-game text.
  - Spec: none

- [x] **Allow the left sidebar to be toggled while playing on touch devices** — in portrait orientation so the canvas can fill the screen.
  - Spec: none

- [x] **Remove the black strip when the portrait sidebar collapses, resize the canvas** — immediately, support swipe-to-close gestures, and keep the collapsed toggle transparent so the map stays visible.
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [x] **Limit gas station explosion damage so construction yards retain 10% health.**
  - Spec: [Gas Station Explosion Safety and Damage Rings](../specs/013-gas-station-explosion.md)

- [x] **Ensure mobile drag-to-build interactions auto-scroll the map within the last 20px near** — canvas edges on touch devices, speeding up as the cursor nears the boundary while keeping the center stationary.
  - Spec: [Mobile scroll stutter recovery](../specs/073-mobile-scroll-stutter-recovery.md)

- [x] **Cap gas-station explosion damage to construction yards at 90% of maximum health,** — including construction yards stored as factories.
  - Spec: [Gas Station Explosion Safety and Damage Rings](../specs/013-gas-station-explosion.md)

- [x] **Expose all chimney smoke emission, particle lifecycle, capacity, and animated wind parameters** — in the built-in config editor.
  - Spec: none

- [x] **Replace per-frame radial-gradient smoke paints with one prepared 128px sprite sampled at** — the puff's continuous radius. Keep flame and shade sprites, wind/growth/fade, and the gradient fallback when sprite preparation fails.
  - Spec: none

- [x] **Do not composite smoke through a WebGL framebuffer blit. That readback measured** — slower than the canvas gradients on the entity layer.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

### Terrain and Map Generation

- [x] **Gentle ground-vs-environment collision refactor (2026-03-22 follow-up)** — building/terrain/occupied-tile contact now uses a decaying local repulsion force field on collision that is capped by the unit's actual current speed, and the immediate positional correction is speed-capped too, so wall/building bumps never push back harder than the unit was already moving.
  - Spec: none

- [x] **SSE group live-feedback + cascade delete polish (2026-04-20)** — Group drag now paints live (>=2 tiles) with yellow overlay visibility, and removing one tile from an existing group removes that entire `group_X` cluster.
  - Spec: none

- [x] **SSE animated follow-up layout+preview end-state fix (2026-04-15)** — fixed border-width input handling so `0` remains valid (dashed grid lanes now actually apply), improved tag list/sidebar spacing with bottom-pinned action buttons, and auto-switch preview control back to `Play` when non-loop playback reaches the final frame.
  - Spec: [Expanded Sidebar Action Button Style Alignment](../specs/043-sidebar-action-button-style.md)

- [x] **SSE animated-mode visibility/grid polish (2026-04-15)** — fixed hidden preview rendering for processed textures, added dashed grid lanes when border width is 0, made grid overlay width follow configured border width, and made SSE sidebar/tag area reliably scrollable without visible scrollbar clipping.
  - Spec: [Spec: Sidebar Visual Gradient Polish](../specs/040-sidebar-gradient-polish.md)

- [x] **SSE mobile touch-draw + safe-area polish (2026-04-20)** — SSE now supports tap-drag tile painting on mobile touchscreens, keeps sidebar toggle button hidden while sidebar is expanded, and adds mobile safe-area top/bottom padding to avoid iOS/browser bar overlap.
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [x] **Increase the baked ground shadow length for south-facing cliffs and remove north-facing cliff shadows (2026-09-15).**
  - Spec: none

- [x] **Remove rectangular cropping from outer plateau silhouettes, add 2x2/2x3/2x4 cliff-block assets with** — more gray-to-canyon color variants, and make generated rock formations prefer compatible broad blocks.
  - Spec: none

- [x] **Strengthen thin outer plateau faces, render one-sided south/east escarpments on long narrow** — rock chains, and broaden generated formations to better match the layered reference terrain.
  - Spec: none

- [x] **Restrict plateau cliffs and shadows to actual rock tiles, require a solid** — three-tile rock width, use ordinary boulders for narrower chains, add visible crack/stone overlays to plateau tops, and generate sufficiently broad rock formations.
  - Spec: none

- [x] **Enlarge plateau crack decals to span multiple tiles while clipping them to plateau-owned rock surfaces (2026-09-15).**
  - Spec: none

- [x] **Distribute enlarged plateau crack decals sparsely at one deterministic tile in ten** — and keep them beneath cliff faces on plateau ground (2026-09-15).
  - Spec: none

- [x] **Make the water-effect zoom configurable, default it much farther out, and render** — water SOT tiles with the same animated water treatment as full water tiles in the GPU path.
  - Spec: none

- [x] **Tune procedural water rendering** — sharper/smaller pattern scale, remove soft shoreline smoothing, lock pattern to world scroll (no parallax), and use the same procedural effect for water SOT overlays.
  - Spec: none

- [x] **Replace tile-image-based water rendering with a procedural WebGL water shader that animates** — seamlessly and applies shoreline blending using logical water tiles for placement.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Add a subtle horizontal gradient to sidebar money/power bars (desktop + mobile** — portrait) and remove rounded corners from the expanded portrait radar/minimap.
  - Spec: none

- [x] **Make generated ore-field density fall off with distance from each seed crystal** — so richer ore visually radiates outward from the seed in deterministic bands.
  - Spec: [Crystal terrain slowdown](../specs/020-ground-crystal-slowdown.md)

- [x] **Portrait condensed mode minimap** — add toggle button on left of action bar, show minimap only when button held (matching landscape behavior), use overlay approach instead of static dock.
  - Spec: none

- [x] **In portrait condensed mode, stack action icons bottom-up without button chrome, match** — the landscape minimap styling, and rotate the build category toggle text vertically.
  - Spec: none

- [x] **Add a portrait-only condensed sidebar state with a bottom build bar, right-side** — actions, and left-side minimap, plus swipe-to-hide behavior from the condensed build bar.
  - Spec: none

- [x] **Make scrolling on the minimap on mobile super smooth.**
  - Spec: none

- [x] **Ensure ore placement in edit mode follows same rules as ore spreading** — (land/street tiles only, no buildings/factories/occupancy).
  - Spec: none

- [x] **Enforce edit mode unit placement rules** — units replace existing buildings/units at placement location, prevent placement on water/rock tiles.
  - Spec: none

- [x] **Create and begin the WebGPU transition with a persisted WebGPU/WebGL setting, atlas-backed** — instanced terrain, procedural water parity, asynchronous initialization, and device-loss fallback.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Restore animated water tiles within the GPU rendering path so shoreline movement matches the 2D renderer.**
  - Spec: none

- [x] **T035 Sync player count from host to client for matching map generation**
  - done: Added playerCount to game state snapshot; Updated syncClientMap() and regenerateMapForClient() to accept and set playerCount before map generation; Fixed issue where roads were generated differently due to different player positions being used in street network generation
  - Spec: none

- [x] **T046 Clear wrecks and SOT on client join and shuffle map**
  - done: Added gameState.unitWrecks cleanup and mapRenderer.invalidateAllChunks() in both resetGameWithNewMap() (shuffle map button) and regenerateMapForClient() (client joining multiplayer); Ensures stale wrecks from previous games don't persist and SOT (Smoothening Overlay Texture) mask is recomputed for the new map
  - Spec: none

- [x] **Use the same corner smoothing algorithm that is used for streets also for water tiles.**
  - Spec: none

- [x] **Make sure the map generation makes the streets that connect the bases** — and ore fields are 1 tile thinner. Also Make sure that for multiple parties the streets merge and not overlap to prevent covering major parts of the map in streets.
  - Spec: none

- [x] **Restore iPhone 13 Pro Max map scrolling smoothness by reducing mobile terrain** — chunk churn and keeping the RAF scheduler from racing native frame cadence during scroll/combat.
  - Spec: [Mobile scroll stutter recovery](../specs/073-mobile-scroll-stutter-recovery.md)

- [x] **Normalize directional cliff-face depth and scaling so north, east, west, corner, and** — short cliff textures have the same open rock detail density as the preferred south-facing horizontal macro cliffs.
  - Spec: none

- [x] **Render sand and other shoreline transition tiles above water but below rock/cliff** — artwork, decals, buildings, and units in CPU and GPU terrain paths.
  - Spec: none

- [x] **Move the irregular beach-like contour from the inland grass/sand edge to the** — sand/water edge, and render the inland shoreline edge with the longer corner-weighted blend used by other biome intersections.
  - Spec: none

- [x] **Add five deterministic beach-contour variations, select them per shoreline tile, and keep** — every variation edge-compatible so adjacent tiles remain seamless.
  - Spec: none

- [x] **Torpedoes render below the water surface at 50% opacity.**
  - Spec: none

- [x] **Make outward land/street and inward water corner transition tiles share a one-pixel** — orientation-aware overlap on all four edges, keeping solid legs aligned while eliminating diagonal join gaps.
  - Spec: none

- [x] **Keep the shared SOT geometry in the organic terrain and legacy/GPU fallback** — renderers so CPU, WebGL and WebGPU-visible paths use identical corner placement.
  - Spec: [Organic terrain, shorelines and connected cliffs](../specs/organic-terrain.md)

- [x] **Default new maps to 200×200 with four players, water on every shore, a center lake, 5% rocks, and 20,000 starting money.**
  - Spec: none

- [x] **Shape procedural shorelines and the center lake in map generation only, leaving** — coastline shaders, sprites, and autotiles unchanged.
  - Spec: none

- [x] **Integrate macro grass and grouped rock silhouettes in bounded terrain chunk caches.**
  - Spec: none

- [x] **Preserve gameplay grids, runways, water and explicit custom spritesheets.**
  - Spec: none

- [x] **Smooth land/water borders and SOT diagonals, preserve opaque connected legs.**
  - Spec: none

- [x] **Connect road tiles to SOT edges without grass holes; replace stale SOT materials.**
  - Spec: none

- [x] **Inspect the result and document further visual suggestions in specs/organic-terrain.md.**
  - Spec: [Organic terrain, shorelines and connected cliffs](../specs/organic-terrain.md)

- [x] **Restrict cliff art to qualifying plateaus, make cliff exposure camera-directional, prevent mixed** — one/two-tile height joins, and cluster cliff geology palettes across complete formations.
  - Spec: none

- [x] **Replace condensed one-cell straight cliff rendering with the same broad macro artwork** — used by the preferred non-condensed cliff style on every terrace level.
  - Spec: none

### Units and Combat

- [x] **T026 Host-authoritative architecture fix**
  - done: Implemented proper host-authoritative architecture where host runs all game logic and clients only render + send user commands; Fixed updateGame.js to skip game logic on remote clients (early return after visual updates); Removed CLIENT_STATE_UPDATE sending from client in gameCommandSync.js; This fixes: HP oscillation (only host computes damage), turret rotation sync (only host updates), bullets visibility (mainBullets synced via snapshot), bidirectional unit production (all units synced via snapshot)
  - Spec: none

- [x] **T028 Client commands, wrecks sync, and remove interpolation**
  - done: Added debug logging for client UNIT_MOVE commands; Removed interpolation entirely - using faster 100ms sync interval instead; Added unitWrecks to snapshot and applyGameStateSnapshot(); Direct position sync for consistent rendering with host
  - Spec: none

- [x] **T036 Fix wreck unitType not syncing to clients**
  - done: Fixed wreck serialization in createGameStateSnapshot() to use `unitType: wreck.unitType` instead of incorrect `type: wreck.type`; Also added spriteCacheKey to wreck snapshot for proper sprite lookup on client
  - Spec: none

- [x] **Ensure tesla and rocket turret coil can only be build after radar.**
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **The rocket tank should not have a turret but instead 3 small static tubes on top of it to indicate a rocket launcher.**
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Spec 006 Make sure the tanks (and turrets) when they fire have:**
  - [x] ✅ (1) a recoil animation on their gun.
  - [x] ✅ (2) a muzzle flash animation
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Ensure the players tanks do not move away from the target or** — towards the target when attacking. ONLY when the target moves out of range they should follow until they get in range again.
  - Spec: none

- [x] **Tanks movement speed should be 50% higher in general.**
  - Spec: none

- [x] **Spec 006 Rocket tank shall fire 3 projectiles instead of 1 but** — with lower damage each. The projectiles are currently way too fast and need to be at least 4x slower.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Tank projectiles make too much damage.**
  - Spec: none

- [x] **Make sure the bullets from tanks and turrets fire at an exact** — location on the map and explode there rather than fly over the entire map.
  - Spec: none

- [x] **Make the enemy more intelligent so it does not just run into** — players defense over and over again but moves away when his units are too weak to break into players base turret defense. Then the enemy gaters units in safe distance to players base and starts another attack with more units trying to break players defense and so on. The enemy should also try to find a way around the players defense to attack weak spots of the base.
  - Spec: none

- [x] **Mobile landscape production category toggle now uses compact uppercase labels so "BUILDINGS"** — fits reliably, and building button labels use short forms only in mobile landscape (e.g., Vehicle Fab, Radar, Ammo Fab, Turret V1/V2/V3).
  - Spec: none

### Naval

- [x] **Ground, naval, and air production advance concurrently in independent queues.**
  - Spec: none

- [x] **Hovercraft can navigate continuously across both land and water.**
  - Spec: none

- [x] **A ferry commanded to shore turns offshore first, reverses tail-first to the** — coast, and prepares even without nearby cargo.
  - Spec: none

- [x] **Naval collisions cause light, cooldown-limited damage; broadside impacts take more damage than bow/stern impacts.**
  - Spec: none

- [x] **Complete every previously deferred naval/domain-production item in the checklist above.**
  - Spec: none

### Air and Jets

- [x] **F35 strike-pass cadence + sprite scale fix (2026-03-08)** — F35 attack flight plans now overfly the target and release bombs only while passing directly over target center, bomb releases are rate-limited to one drop every >=300ms, map sprite regenerated from original source and scaled to a full 64x64 fit, and a new E2E test validates over-target drop distance plus minimum inter-drop delay.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Added shared F35 behavior guards (`canF35ReleaseWeapons`, `canF35StartLanding`) plus deterministic slot reservation lifecycle** — for airstrip landing intents.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Add building spawn cheat (`build [type] [party]`) and use it in Apache** — helipad auto-return E2E for minimal setup runtime.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Ensure Apache helicopter stays focused during E2E test by enabling auto-focus with** — Shift+E keyboard shortcut after unit selection.
  - Spec: [Apache selection alignment](../specs/020-apache-selection-alignment.md)

- [x] **Center camera on spawn location before Apache E2E test begins to ensure proper view positioning.**
  - Spec: none

- [x] **Enemy AI must build Apaches (one per helipad), use them to strike** — unprotected harvesters and bases, and retreat from rocket-based air defenses before re-engaging.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Jet takeoff and landing sounds play once per operation rather than looping.**
  - Spec: none

- [x] **A carrier attack command holds the carrier stationary and dispatches every deck aircraft to the target.**
  - Spec: none

- [x] **A carrier-launched F22 move command reaches its requested tile before considering recovery.**
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Enemy Destroyers fire their gun at ships in range and anti-air rockets against attacking aircraft.**
  - Spec: none

### Economy and Buildings

- [x] **Harvester ore-gradient/manual-target/map-settings follow-up (2026-04-20)** — initial ore fields now spread density-1 ore across reachable tiles before enriching the inner seed area so low-level harvesters always have starting ore, single-harvester ore commands now preserve and physically reach the exact clicked ore tile while multi-harvester commands still fan out across connected ore, harvester wagon turn rate is capped to about 150% of tank rotation, and Map Settings now exposes a host-controlled ore spread interval input in seconds beside Total Ore Value with multiplayer sync.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Let planned building footprints extend base build proximity for additional plans, render** — per-plan build order numbers, and support sell-mode cascading plan cancellation with two-click warning/preview highlights.
  - Spec: none

- [x] **Follow-up** — ensure two-finger tap-and-release on the map also exits mobile building placement/construction mode immediately (not only active chain-paint mode).
  - Spec: none

- [x] **Ensure all build/production button labels use the global futuristic font and automatically** — fall back to existing mobile short building labels when desktop text overflows.
  - Spec: [Global Futuristic Font Refresh](../specs/040-global-futuristic-font.md)

- [x] **Add a money bar tooltip that breaks down refinery revenue and harvester** — cycle stats with click-to-focus shortcuts for each entity.
  - Spec: none

- [x] **Adjusted mobile portrait condensed sidebar money and power bars** — removed rounded borders, added vertical text display (bottom-to-top) matching Buildings/Units tab direction, ensured PWA mode bars display with labels and matching colors.
  - Spec: none

- [x] **Refined portrait condensed build bar** — Moved toggle to left, reduced width by 33%, and ensured Buildings/Units label is visible as a vertical column of letters. Optimized CSS hierarchy for reliable production button visibility and scrolling.
  - Spec: none

- [x] **Stabilize tanker truck refueling** — build visible to-do lists (10s auto-scan interval), lock in priorities, and let user AGF selections override auto targets until finished.
  - Spec: none

- [x] **Add a host-only map edit mode with tile painting, random brushes, and instant building/unit placement tools.**
  - Spec: none

- [x] **Add ore to the tile options available in edit mode.**
  - Spec: none

- [x] **Add Command/Ctrl+click eraser, right-click pipette tool, prevent same-tile redraw flickering, instant building/unit** — placement in edit mode.
  - Spec: [Building Selection Should Not Issue Move Commands](../specs/046-building-selection-no-move-command.md)

- [x] **Enable all buildings and units in edit mode regardless of tech tree requirements.**
  - Spec: none

- [x] **Add image preview for buildings/units under cursor in edit mode, disable range-to-base restrictions in edit mode.**
  - Spec: none

- [x] **T022 Fix client→host building sync and AI on client issues**
  - done: Added broadcastBuildingPlace() calls to eventHandlers.js, buildingRepairHandler.js, and productionQueue.js; Added isHost() check in enemy.js to disable AI on clients; Added processPendingRemoteCommands() in updateGame.js to process BUILDING_PLACE commands from clients on host
  - Spec: none

- [x] **T025 Unit visibility, building sell, and money sync fixes**
  - done: Fixed unit array sync by using mainUnits from main.js (the actual rendering array) instead of gameState.units; Bullets now sync to mainBullets array; Added broadcastBuildingSell() for building sell action sync with sellStartTime in snapshot; Removed incorrect money sync from snapshot (each player manages own money)
  - Spec: none

- [x] **T040 Sync ore spread and shadow of war settings from host to clients**
  - done: Added oreSpreadEnabled and shadowOfWarEnabled to game state snapshot; Clients receive and apply host settings on snapshot; Ore spread and shadow of war checkboxes disabled for clients with "(host setting)" indicator; Settings re-enabled on disconnect; Explosions now hidden under fog of war for shadow of war mode
  - Spec: none

- [x] **The game is lost for any player when he has no more** — buildings left. Make sure the game is not over only when the base construction building got destroyed!
  - Spec: none

- [x] **only show health bars if units or buildings are damaged**
  - Spec: none

- [x] **The selection indicator for units should only be visible at the conrers (like with buildings).**
  - Spec: none

- [x] **Make sure buildings cannot be selected when dragging a selection box. (Works for AGF though).**
  - Spec: none

- [x] **Make the box that indicates a selection around a building only 2px** — wide and only show it at the corners not the entire edges.
  - Spec: [Building Selection Should Not Issue Move Commands](../specs/046-building-selection-no-move-command.md)

- [x] **The health bar for player's own units and buildings as well as** — the one for the enemies should only be visible if those units/buildings are damaged or selected.
  - Spec: none

- [x] **cut out the images for the buildings to be rendered on the** — map so that the background tiles around are merging with the building. Make sure to use transparency for those images.
  - Spec: none

- [x] **Spec 005 Make sure every unit factory has its own individual assembly** — point that can be set by selecting the factory and then right clicking on the map. This will replace the current mechanism where the building factory is selected to define the assembly point. Whenever a factory gets selected their assembly points get visible otherwise they are hidden.
  - Spec: [Building System Enhancements](../specs/005-building-system-enhancements/spec.md)

- [x] **Show some progress when the harvester is unloading the ore at the** — refinery by showing how the load indicator at the harvesters goes to zero.
  - Spec: none

- [x] **Add refinery building costing 2500$. Its size is 3x3 tiles. Its armor** — is same as for the base factory. Any harvester can be assigned to one specific refinery to unload only there by having a harvester selected an clicking then on the refinery. The refinery needs 30 energy.
  - Spec: none

- [x] **When player builds the radar station it enables the overview mini map.** — Before that map is just gray. It consumes 50 energy. When it get destroyed and no other radar station is in the players building list the mini map gets disabled again.
  - Spec: none

- [x] **Ensure harvesters spawn from the vehicle factory not the building factory.**
  - Spec: none

- [x] **Lower harvester unload time to 10s.**
  - Spec: none

- [x] **Ensure that production queues for buildings and units can be filled even** — when no more money is available. Ensure the money is only charged when production is actually starting.
  - Spec: none

- [x] **Make sure the newly produced vehicles get spawned from the vehicle factory** — and not from the construction yard. When there are multiple vehicle factories make sure the units come out alternatingly from all of the factories one by one.
  - Spec: none

- [x] **For harvesters to be build it is required to have a refinery and a vehicle factory.**
  - Spec: none

- [x] **Harvesters can only bring the ore the the refinery not to the** — construction yard anymore. At the refinery it takes the harvester 20s to unload the ore before it can go again to harvest automatically. At each refinery there can only be on harvester at the time being unloaded all othery have to wait for it.
  - Spec: none

- [x] **Follow-up mobile landscape tweak** — keep the BUILDINGS/UNITS toggle button position unchanged but left-align the toggle label text and reduce label font-size by 1px to avoid clipping.
  - Spec: none

- [x] **Add mobile bulk-planning for building placement** — tap ready build button, press-and-hold a start tile, drag to preview a line, and place the full planned line on release while keeping the build-button bulk count in sync.
  - Spec: [Mobile Portrait Sidebar Expand Button](../specs/022-mobile-portrait-sidebar-expand-button.md)

- [x] **Refine mobile bulk building planning to freeform paint mode (not forced line** — mode), disable yellow selection rectangle during paint, and fix edge auto-scroll direction to match drawing direction.
  - Spec: none

- [x] **Place enemy gas stations and ammunition factories away from the base center** — and outside their blast radius from critical infrastructure.
  - Spec: [Gas Station Explosion Safety and Damage Rings](../specs/013-gas-station-explosion.md)

- [x] **Validate full building footprints so every AI gas station has at least** — two completely empty tiles between its outer occupied tiles and every owned construction yard or other critical building.
  - Spec: [Gas Station Explosion Safety and Damage Rings](../specs/013-gas-station-explosion.md)

### AI

- [x] **Migrate runtime game persistence from direct Web Storage calls to an IndexedDB-backed** — browser storage layer, including saves, replays, tutorial/settings preferences, aliases, keybindings, LLM settings, sprite-sheet metadata, and legacy data migration.
  - Spec: [IndexedDB Browser Storage Migration](../specs/070-indexeddb-browser-storage.md)

- [x] **Provide the LLM with the entire building/unit tech tree in a compressed** — CSV-style `techTreeCsv` string for long-term planning, while keeping live `productionOptions` for immediately legal actions.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Strengthen strategic economy-recovery guidance so the LLM explicitly treats selling lower-priority buildings** — as valid funding for replacement refineries and harvesters.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Let strategic LLM planning look further ahead** — when the active queues are short, top them up with several legal, affordable future base-build and production actions so the local AI keeps working between LLM ticks.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Refocus commentary on the host player, repair commentary read-aloud playback, and combine** — commentary into the first AI player's strategic request whenever the same provider/model is selected for both.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Enforce economy-first strategic LLM behavior** — unstable AI economies now deterministically prioritize the next required `powerPlant -> oreRefinery -> vehicleFactory -> harvester` step ahead of non-economy build spending, even if the model suggests tanks or tech first.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Implement the spec 054 strategic delta and degradation slice** — strategic prompts now keep only strategy-relevant recent-delta highlights, track deltas from each AI player's last successful strategic tick, degrade through smaller compact-input variants before skipping, and prune transition history only after all consumers advance.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Implement the spec 054 strategic prompt-slimming slice** — remove the static strategic unit/building catalogs from the bootstrap prompt, move current live build/unit options into `productionOptions` inside the compact strategic digest, and reduce the bootstrap/follow-up prompt prose to invariant planning rules.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Implement the spec 054 compact commentary digest** — commentary prompts now send `inputMode: compact-commentary-v1` with owner context, compact recent-delta highlights, anti-repeat comment memory, correct AI-player perspective, and trimmed fallback payloads instead of the raw snapshot.
  - Spec: none

- [x] **Implement the spec 054 compact strategic digest** — strategic prompts now send `inputMode: compact-strategic-v1` with grouped forces, compact owned-building state, priority-target enemy intel, compact map/base intel, queue state, and recent delta highlights instead of the raw strategic snapshot.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Implement spec 054 request-path follow-up** — add LLM request-size instrumentation, remove OpenAI system/instruction prompt duplication, cap strategic/commentary output tokens, and reset long `previous_response_id` chains with compact carry-forward memory.
  - Spec: [LLM Token Reduction Follow-up Tracker](../specs/054-llm-token-reduction-tracker.md)

- [x] **Add a persistent SpecKit-style implementation tracker for LLM token-reduction follow-up work, including** — completed progress, remaining gaps, and next-agent tasks in `specs/054-llm-token-reduction-tracker.md`.
  - Spec: [LLM Token Reduction Follow-up Tracker](../specs/054-llm-token-reduction-tracker.md)

- [x] **Reduce LLM API token usage to avoid 429 rate-limit errors** — remove redundant world-pixel `position` from unit snapshots (keep only `tilePosition`), omit null/default `status` and `orders` fields, omit null `rallyPoint` from buildings, and aggregate damage transition events per target instead of sending every individual hit.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Show FPS-overlay LLM token/cost rows only while LLM is enabled, and fix** — uncapped benchmark chart FPS sampling so final report points no longer collapse to 0 FPS when frame limiter is off.
  - Spec: [Uncapped Benchmark FPS Fix + Conditional LLM Overlay Rows](../specs/039-uncapped-benchmark-llm-visibility.md)

- [x] **Rework dual FPS/performance widgets** — position both below the notification bell without overlap, move frame-limiter control into Settings modal, remap sidebar button to FPS/canvas overlay toggle, and remove LLM cost block from HTML debug widget while keeping LLM stats in the main FPS overlay.
  - Spec: [Sidebar Performance Widget Toggle Button](../specs/037-sidebar-performance-toggle-button.md)

- [x] **Temporarily lock LLM settings to OpenAI only** — remove invalid remote cost URL usage, keep other provider sections visible but collapsed, and show a "coming soon!" hint for Anthropic/xAI/Ollama.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **When LLM comments on the game show a bubble with the color** — of the party the LLM is controlling on the left hand side of the notification. Inside the bubble show the same robot icon that is already used in the multiplayer section of the sidebar to show that the LLM is active on a party.
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **Wire strategic LLM flow to OpenAI `/v1/responses` with JSON-schema output, per-player conversation** — continuity via `previous_response_id`, and bootstrap prompt + protocol schema on first tick.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Apply 10-second cooldown to enemy AI tanker truck target assignment in both** — unitCommands and non-unitCommands paths to prevent frequent target switching.
  - Spec: none

- [x] **Ensure enemy AI has at least one tanker truck stationed at the** — refinery to refuel harvesters (designate closest tanker as refinery station tanker).
  - Spec: [Tanker auto-refuel priority and thresholds](../specs/020-tanker-auto-refuel-priority.md)

- [x] **Enemy AI building placement must enforce a 2-tile gap to other structures** — (except defence-with-defence and wall-to-wall placements that may touch), only relaxing to a 1-tile gap after all nearby 2-gap options are blocked.
  - Spec: none

- [x] **Enemy AI must repair damaged buildings using the same post-attack cooldown rules** — as the player and prioritize critical infrastructure (construction yard, power, refinery, factory/workshop, radar) whenever its cash reserves are low.
  - Spec: none

- [x] **Ensure enemy AI sells non-essential buildings when broke and lacking refineries or** — harvesters so it can afford the missing structure and restart harvesting income.
  - Spec: none

- [x] **Ensure enemy also has to build ore refineries and vehicle factories to** — produce harvesters and vehicles. Same build rules should apply for enemy AI like they are now for the player.
  - Spec: none

- [x] **Enforce enemy gas-station safety for LLM-requested positions, advanced placement, simple fallback placement,** — and final pre-build validation, keeping its blast origin at least six tiles from owned construction yards, refineries, power plants, and vehicle factories.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

### Multiplayer and Networking

- [x] **Expanded left sidebar follow-up (2026-09-23)** — order the accordions Save/Load, Multiplayer, then Map Settings; keep the settings button row on one line; animate accordion height for 200ms and honor reduced motion.
  - Spec: [Expanded left sidebar layout](../specs/088-expanded-left-sidebar.md)

- [x] **Expanded left sidebar polish (2026-09-23)** — Multiplayer and Save/Load Game collapse with the Map Settings accordion, Statistics has a visible headline, section spacing is scoped to `#sidebar.expanded-left-sidebar`, form rows cap at two controls, and the master volume sample plays on release instead of every drag tick.
  - Spec: [Expanded left sidebar layout](../specs/088-expanded-left-sidebar.md)

- [x] **Remove borders from multiplayer sidebar colored owner badges (party bubbles) so the** — solid fill style matches the updated multiplayer row visuals.
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **Make multiplayer owner badge width content-driven, force dark text on green/yellow badges,** — and add right-side spacing in party-info row alignment for consistent sidebar padding.
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **Move multiplayer owner labels into the colored party badge to save row** — space and force dark text on yellow-like badge colors for readability contrast.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Keep multiplayer row status text free of defeated/invite-readiness labels and use compact** — invite-button copy (`Invite`/`Copied!`/`Defeated`) to fit narrow sidebar controls.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Disable invite actions for defeated parties and show `Defeated` on their invite** — buttons so hosts cannot generate/copy invites for eliminated players.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Remove per-party "Invite ready" sidebar status labels and reflect invite lifecycle state** — directly on each Invite button (Generating…/Copied!/Invite Ready) to avoid duplicate multiplayer UI signals.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Keep floating-label sidebar input wrappers exactly 40px tall with refined internal spacing,** — move "Your alias" above invite link controls in Multiplayer, align map inputs into Seed+Players and Width+Height shared rows, and ensure number spinners match input text color without separate spinner background.
  - Spec: [Sidebar Floating Label Inputs](../specs/050-sidebar-floating-label-inputs.md)

- [x] **Apply Rajdhani to sidebar build tabs (desktop/mobile), map settings/edit/shuffle buttons, invite/join controls,** — save/invite placeholders, all sidebar input fields, and user docs with a 14px minimum.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **README follow-up** — add section icons and document `netlify dev` as an optional local multiplayer test path when Netlify CLI is installed globally.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Change extended multiplayer full-assault win condition to complete when all BLUE structures** — are destroyed (buildings + factories, excluding walls), without waiting for total BLUE unit elimination or victory screen flow.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Replace flaky UI-mouse AGF in extended multiplayer E2E with deterministic programmatic AGF-equivalent** — engine commands (selected combat units + attack queue + attackGroupTargets) so all BLUE structure targets remain visibly highlighted during selection.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Ensure extended multiplayer assault uses real UI AGF drag per human party** — (HOST/RED/YELLOW) over the full BLUE base so all BLUE structures (construction yard, refinery, vehicle factory, power plant) are included as attack targets.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Simplify the extended multiplayer E2E variant to reuse baseline flow, build to** — 2 tanks per human party, and issue immediate AGF assaults to BLUE whenever a new tank is ready until BLUE is eliminated.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Keep multiplayer remote-command/network processing active during paused frames (zero-delta paused tick) so** — invite join handshakes can complete before host resume.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Stabilize multiplayer invite joins by requiring client-side remote session `connected` state and** — host-side human party confirmation (`aiActive === false`) before resume.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Update Netlify multiplayer E2E so HOST/RED/YELLOW each build their own visible progression** — (power plant → ore refinery → vehicle factory → harvester → tank) using normal production flow, without direct spawn/provision shortcuts.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Ensure Netlify multiplayer E2E closes the host invite/QR modal after YELLOW invite** — flow before provisioning/combat assertions.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Ensure host (GREEN/player1) builds the same required progression as RED/YELLOW in multiplayer** — E2E (construction yard, power plant, ore refinery, vehicle factory) and participates in BLUE-targeted combat.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Detect largest available host display (macOS via `system_profiler`) in multiplayer E2E runner** — and pass screen dimensions into the test so host/RED/YELLOW windows are positioned across that largest monitor.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Optimize multiplayer invite setup speed** — open RED/YELLOW clients directly on `/?invite=...` (skip loading home + sidebar paste flow), keep explicit QR modal dismissal after each invite, and position HOST/RED/YELLOW windows on screen edges via Chromium CDP bounds for non-overlapping headed runs.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Multiplayer E2E invite stabilization** — expand Map Settings accordion before filling host map inputs, scroll sidebar to multiplayer invite section before invite/join interactions, auto-dismiss invite QR modal between consecutive invites, and add timestamped verbose step logs for host/client invite operations.
  - Spec: [Map Settings expand scroll alignment](../specs/062-map-settings-expand-scroll-alignment.md)

- [x] **Multiplayer E2E invite hardening** — make host generate/copy RED invite first, then launch RED browser and paste invite link into the in-game join input; if paste-triggered navigation fails, fallback to direct `/?invite=` open, and only launch YELLOW browser after YELLOW invite is copied.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Comprehensive user documentation rewrite** — mobile-responsive borderless design, 14 sections covering all game systems (tech tree graph, HUD explanation, crew system, XP/promotions, fuel/ammo logistics, mine system, remote control, multiplayer, combat mechanics, keyboard reference), complete numerical stats for all 13 units and 18 buildings.
  - Spec: [In-Game User Documentation](../specs/032-user-documentation.md)

- [x] **Extracted lockstep synchronization logic from gameCommandSync.js into dedicated lockstepSync.js module with all** — lockstep-related functions and state management.
  - Spec: [Deterministic Lockstep Networking](../specs/015-deterministic-lockstep/spec.md)

- [x] **Move multiplayer settings below save games list on sidebar (party list and join section no longer part of map settings).**
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **ensure there is an input field in the network section of the** — game so that a user can input the entire invite link into that field to connect to a game invite. This is useful when using the app as a pwa!
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **when a multiplayer game gets paused by the host ensure that there** — is a permanent message on the top of the screen showing that the host paused the game. The client can still scroll around on the map though but cannot do any commands. Also: cancel button added to connecting modal, beautified modal UI.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Spec 015 Deterministic lockstep multiplayer refactor:**
  - [x] ✅ Seedable PRNG module (`src/network/deterministicRandom.js`) - Mulberry32 algorithm with session seed
  - [x] ✅ Lockstep manager (`src/network/lockstepManager.js`) - tick coordination, peer state tracking, 20 Hz tick rate
  - [x] ✅ State hash system (`src/network/stateHash.js`) - FNV-1a inspired hashing with quantized positions
  - [x] ✅ Input buffer system (`src/network/inputBuffer.js`) - 3-tick delay, duplicate detection, command queuing
  - [x] ✅ Game random utilities (`src/utils/gameRandom.js`) - wrapper for game code to use deterministic random
  - [x] ✅ Extended gameCommandSync.js with lockstep message types (LOCKSTEP_INPUT, LOCKSTEP_HASH, LOCKSTEP_RESYNC, etc.)
  - [x] ✅ Added lockstep state properties to gameState.js
  - [x] ✅ Integrated tick-based simulation into gameLoop.js with fixed timestep
  - [x] ✅ Desync detection via periodic hash exchange and automatic resync from host
  - [x] ✅ Replaced Math.random() calls in game-critical code with gameRandom imports
  - [x] ✅ Integrated lockstep initialization into multiplayer game start flow (webrtcSession.js)
  - Spec: [Deterministic Lockstep Networking](../specs/015-deterministic-lockstep/spec.md)

- [x] **Added lockstep UI status indicator in FPS overlay (tick counter, desync warning, host/client role)**
  - Spec: [Deterministic Lockstep Networking](../specs/015-deterministic-lockstep/spec.md)

- [x] **Convert Express signalling server to Netlify Functions using serverless-http**
  - Spec: none

- [x] **Update frontend signalling.js to use relative /api/ URLs in production**
  - Spec: none

- [x] **Test multiplayer on Netlify production - WebRTC signalling works end-to-end**
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T044 Host only starts polling signaling server after user clicks invite button**
  - done: Removed automatic polling start from initSidebarMultiplayer(); polling now only starts when user clicks "Invite" button in handleInviteClick()
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **T042 Multiplayer defeat handling and spectator mode**
  - [x] ✅ Defeated human players see beautiful, mobile-optimized defeat modal with game statistics
  - [x] ✅ Two buttons on defeat modal: "New Game" and "Spectator Mode"
  - [x] ✅ Spectator mode allows viewing entire map (shadow of war disabled) but no interactions
  - [x] ✅ Host defeat doesn't end game for other players - all players see same defeat modal
  - [x] ✅ Fixed "money earned" statistics showing 0 on end game screen (totalMoneyEarned now tracked in harvesterLogic.js)
  - [x] ✅ Spectator input blocking in mouseHandler.js and keyboardHandler.js (view-only commands like FPS, occupancy, grid still work)
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T043 Multiplayer defeat modal improvements**
  - [x] ✅ Defeat modal now shown for invited clients (defeatedPlayers synced via snapshot)
  - [x] ✅ Fixed battleLost sound playing only once (guard flag _defeatSoundPlayed)
  - [x] ✅ Defeat label text wrapped properly inside modal (split into title + subtitle)
  - [x] ✅ Player alias shown above construction yards in multiplayer (from partyState.owner)
  - [x] ✅ Host can toggle "Show Enemy Resources" to show/hide money and power on enemy construction yards
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T011 persist host invite UI state so party rows keep their button visibility state**
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **T012 begin User Story 2** — remote alias/offer flow + WebRTC data channel and host-only controls
  - done: remote landing alias form wired through `src/network/remoteConnection.js`, offers reach the STUN helper, and the polling loop handles answers/ICE
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T013 start User Story 2 host WebRTC handling**
  - done: host now polls `/signalling/pending`, answers offers, consumes remote control snapshots, and broadcasts pause/running updates via the data channel
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T015 emit join notification when a remote WebRTC session flips to connected (host alert)**
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T016 [US3] detect remote disconnects/host drops, flip `aiActive` back on, and keep** — invite usable within seconds of failure
  - done: HostSession state change handler detects DISCONNECTED/FAILED, calls markPartyControlledByAi, emits AI_REACTIVATION_EVENT, and shows notification
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T017 [US3] regenerate `/invite-regenerate` when a non-host loads a save so the** — loader becomes new host and sidebar invites refresh
  - done: multiplayerStore exports regenerateAllInviteTokens() and isHost(); saveGame.js calls regeneration on load
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T019 Game command synchronization - broadcast unit commands (move, attack) and build** — commands between multiplayer players via WebRTC DataChannel
  - done: gameCommandSync.js module created with broadcastUnitMove/broadcastUnitAttack, integrated into unitCommands.js and webrtcSession.js/remoteConnection.js
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T020 Client initialization fixes - parse partyId from invite token, set humanPlayer, center camera on party's base**
  - done: invites.js exports parsePartyIdFromToken(); remoteInviteLanding.js sets humanPlayer and centers camera; gameCommandSync.js syncs factories in snapshots
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T021 Fix multiplayer sync issues - building IDs, unit visibility, render loop resume, building disappearance**
  - done: buildings.js now assigns unique IDs via getUniqueId(); gameCommandSync.js uses full array replacement for buildings/units with position-based fallback; gameLoop.js always schedules frame when paused
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T023 Enhanced multiplayer sync - tech tree, building damage, occupancy, animations**
  - done: Tech tree syncs on client join via setProductionControllerRef() and requestTechTreeSync(); Building damage broadcasts bi-directionally via broadcastBuildingDamage(); New buildings from network placed in occupancy map via placeBuilding(); Building construction animation triggered for network buildings; Milestone video volume reduced by 60%
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T024 Comprehensive multiplayer sync - all units, buildings, bullets, explosions**
  - done: Extended unit snapshot with muzzleFlashStartTime, recoilStartTime, path, vx/vy, attackTarget, guardPosition, isMoving, isAttacking, remainingMines, sweeping; Extended building snapshot with constructionStartTime, constructionFinished, turretDirection, muzzleFlashStartTime; Extended bullet snapshot with full trajectory properties; Added explosions to snapshot; Added CLIENT_STATE_UPDATE command type for bidirectional sync; Client now sends owned entity updates to host; Host merges client updates into authoritative state
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T031 Fix multiplayer client issues** — tank barrel, promotion stars, stop command
  - done: Fixed tank barrel disappearing on client by converting animation timestamps (recoilStartTime, muzzleFlashStartTime) to elapsed times for cross-machine sync; Added level, bountyCounter, baseCost to unit snapshot for promotion stars; Added broadcastUnitStop() and integrated into handleStopAttacking(); Fixed UNIT_STOP handler on host to clear target property
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T034 Sync map seed and dimensions from host to client**
  - done: Added mapSeed to game state snapshot; Replaced ensureClientMapGridInitialized() with syncClientMap() that regenerates map using host's seed; Added regenerateMapForClient() export in main.js; Map settings UI hidden for clients on invite token detection and connection; Settings restored on disconnect
  - Spec: none

- [x] **T039 Kick invalidates invite, regenerates token, client becomes standalone host**
  - done: kickPlayer() now sends kick message before disconnecting, invalidates old token, generates new invite; client handles kick message by converting to standalone host with all AI parties; invite URL cleared from browser
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T041 Improve multiplayer party list UI and add alias persistence**
  - done: Party rows now show only color dot (with tooltip) instead of "Green: AI"; Changed "Human (Host)" to "You (Host)" for clarity; Added "Your alias:" input field in map settings; Alias persisted to localStorage and synced between sidebar input and join modal input
  - [x] ✅ Party rows now show only color dot (with tooltip) instead of "Green: AI"; Changed "Human (Host)" to "You (Host)" for clarity; Added "Your alias:" input field in map settings; Alias persisted to localStorage and synced between sidebar input and join modal input
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T045 Add QR code hover display for invite buttons**
  - done: When hovering over an invite button after generating an invite, a QR code popup appears showing the invite URL; Mobile users can scan the QR code to join the game; Created src/ui/qrCode.js with lightweight pure JS QR code generator; Added CSS styles for QR popup positioning and animations
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Improve multiplayer network stability with heartbeat-based responsiveness checks, forced host/client pause while** — reconnecting, delayed AI takeover fallback, and reconnect timer visibility for hosts and clients (2-4 player compatible).
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

### UI, Sidebar, and Settings

- [x] **Physical iPhone foreground RAF starvation (2026-07-12)** — a monitor capture showed 2.41fps despite only 2.02ms frame work; race mobile RAF with a display-cadence watchdog, preserve bounded simulation catch-up, and report scheduler source/delay telemetry.
  - Spec: none

- [x] **Circular selected-unit HUD (mode 4) draws an inward party-colored glow** — strongest just inside the donut ring and fading toward the center, only while the circular HUD is selected (2026-09-21).
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [x] **Ensure dropdown carets have balanced horizontal spacing by adding explicit right inset/padding** — (matching left-side visual padding) for sidebar/settings selects.
  - Spec: none

- [x] **Ensure all dropdowns and input fields use square corners (`border-radius** — 0`) across sidebar and modal form controls.
  - Spec: none

- [x] **Ensure number-input spinner buttons keep the same background color as the floating** — input field while the spinner triangle icons use the same color as the input text.
  - Spec: none

- [x] **Improve mobile chain-build planning UX** — two-finger tap release now instantly cancels planning (without cancelling two-finger drag panning), edge auto-scroll speed reduced to ~33%, and ready-to-place build button highlight made more visually dominant.
  - Spec: none

- [x] **Follow-up polish** — make sidebar money/power gradients end brighter (not darker) and use the same desktop sidebar gradient on mobile portrait expanded + condensed sidebars.
  - Spec: none

- [x] **Increase sidebar gradient visibility with a left-to-right professional blend and add a** — tiny 5-10px rounded highlight/drop near the top-right edge for subtle depth.
  - Spec: [Spec: Sidebar Visual Gradient Polish](../specs/040-sidebar-gradient-polish.md)

- [x] **Improve sidebar rendering with a subtle professional gradient treatment so the panel** — feels less flat while preserving readability.
  - Spec: [Spec: Sidebar Visual Gradient Polish](../specs/040-sidebar-gradient-polish.md)

- [x] **Disable desktop edge auto-scroll by default, stop edge scrolling immediately when cursor** — leaves the map canvas, and set HUD mode 4 (modern donut) as the default selected-unit HUD mode.
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [x] **Keep the in-game default arrow cursor when hovering a selected unit and** — its HUD, preventing move/blocked cursor overrides on that selected target context.
  - Spec: none

- [x] **Add tiny hover tooltips for selected-unit HUD segments so each exact hovered** — element shows its label (fuel, ammo, health, experience, rank stars, commander, loader, gunner, driver).
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [x] **Show absolute hovered-value tooltips on selected-unit HUD bars (health/ammo/fuel), with fuel converted** — using 1 tile = 10m, and keep behavior data-driven so newly added units/buildings with standard stat fields work automatically.
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [x] **Add desktop + mobile screenshots to README, converting docs images to WebP (quality 85) and removing the original PNGs.**
  - Spec: none

- [x] **HUD mode 4 (donut) polish** — remove yellow selection box, make donut bars 2px thinner, and raise XP stars to avoid overlap with the top HUD arc.
  - Spec: [Selected Unit HUD Refactor](../specs/034-selected-unit-hud-refactor.md)

- [x] **Add a selected-tank HUD preview inside Settings next to the HUD style** — selector, and add a persistent HUD bar-thickness input (default 3px) restored from localStorage on load.
  - Spec: none

- [x] **Refine HUD settings preview to use a real rocket tank and mirror** — in-map HUD rendering for modes 1/2; set default HUD bar thickness to 4px; move HUD4 XP stars higher and slightly right.
  - Spec: none

- [x] **Build a reusable professional floating-label input wrapper (Rajdhani font) and apply it** — to all sidebar text/number inputs, removing redundant static labels.
  - Spec: [Sidebar Floating Label Inputs](../specs/050-sidebar-floating-label-inputs.md)

- [x] **Ensure expanded sidebar repair/sell active state is visibly highlighted in green (matching condensed sidebar behavior).**
  - Spec: [Expanded left sidebar layout](../specs/088-expanded-left-sidebar.md)

- [x] **Remove borders from expanded sidebar action buttons, keep them square, and enforce** — spaced flex container layout to match the settings-button style.
  - Spec: [Expanded Sidebar Action Button Style Alignment](../specs/043-sidebar-action-button-style.md)

- [x] **Move the mobile landscape notification bell icon from top-right to the top-left safe-area position.**
  - Spec: [Mobile Landscape Safe-Area Fill](../specs/016-mobile-landscape-safe-area/spec.md)

- [x] **Ensure mobile portrait top notifications render below the notch/protective safe-area inset so** — text never overlaps the device cutout.
  - Spec: none

- [x] **Keep mobile portrait modal overlays, expanded sidebar content, and notification history bell/list** — below the top safe-area notch inset.
  - Spec: none

- [x] **There is an issue when a unit is commanded to move to** — an unreachable place. Ensure the engine recognises unreachable targets, aborts the move command, and shows a notification to the user. (Completed 2026-02-10; refined: strict destination + reject partial enclosed paths + preserve long-distance reachable paths and full route rendering)
  - Spec: none

- [x] **Reduce key bindings and cheat modal height caps on small screens to avoid cropping.**
  - Spec: [Spec: Key Bindings Editor Modal](../specs/spec-keybindings-editor.md)

- [x] **Cap all modal dialogs at 80% of the viewport height to prevent oversizing on small screens.**
  - Spec: none

- [x] **Update the mobile action bar so repair/sell buttons use green active icons,** — keep the play/pause icon white, and hide unit group controls outside the condensed sidebar.
  - Spec: none

- [x] **Add desktop edge auto-scroll after a short hover delay with configurable speed and a settings toggle to disable it.**
  - Spec: none

- [x] **Restore the sidebar Settings button so it opens the settings modal (runtime + keybindings) reliably again.**
  - Spec: [Spec: Key Bindings Editor Modal](../specs/spec-keybindings-editor.md)

- [x] **Add a tabbed sidebar settings modal with a Key Bindings editor (keyboard/mouse/touch),** — map-edit context groupings, and JSON export/import with version metadata.
  - Spec: [Sidebar Save Game Import/Export](../specs/051-save-game-import-export.md)

- [x] **Hide the portrait sidebar toggle while the panel is open and guarantee** — the collapsed state instantly fills the freed space with the map so no black bar ever remains.
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [x] **Move edit mode button to the top of map settings.**
  - Spec: none

- [x] **Match cheat console modal styling with the settings menu UI.**
  - Spec: [Cheat Console UI Alignment](../specs/026-cheat-console-ui.md)

- [x] **Offset the left-edge drag-to-build scroll trigger on mobile by the action bar** — width and safe-area inset so accidental scrolling near the controls is avoided.
  - Spec: [Mobile scroll stutter recovery](../specs/073-mobile-scroll-stutter-recovery.md)

- [x] **T014 enforce host-only start/pause/cheat controls when a remote client is connected**
  - done: session events disable pause/cheat buttons in `src/ui/sidebarMultiplayer.js` and the cheat hotkey is blocked in `src/inputHandler.js`
  - Spec: none

- [x] **T037 Update sidebar party display when player takes over AI or disconnects**
  - done: Added PARTY_OWNERSHIP_CHANGED_EVENT in multiplayerStore.js; markPartyControlledByHuman() and markPartyControlledByAi() now emit ownership change events; sidebarMultiplayer.js subscribes to these events and refreshes the party list display when ownership changes
  - Spec: none

- [x] **T038 Add kick button for connected players**
  - done: Added kickPlayer() function in webrtcSession.js; sidebarMultiplayer.js shows "Kick" button instead of "Invite" when a human player is connected; kick disconnects the WebRTC session and returns party to AI control; red-styled button in CSS
  - Spec: none

- [x] **Clear previous notifications before showing a new one.**
  - Spec: none

- [x] **When game ist restarted with the restart button there should NOT be** — a page reload but the game state should be resetted AND the statistics should be kept (win/loss)
  - Spec: none

- [x] **For any vehicle to be build a vehicle factory is required. Make** — sure the build options in the sidebar are disabled until the factory is built. Disabled sidebar buttons are grayed out (just add 50% transparency). The more vehicle factories are build the faster the vehicle production gets. If production speed with one factory is 1x it is 2x with two factories and so on.
  - Spec: [Restart Resets Sidebar Build Options](../specs/043-restart-resets-sidebar-build-options.md)

- [x] **Restore mobile double-tap cancel behavior for placement/planning mode and keep two-finger pan** — scrolling functional after using draw-to-plan mode.
  - Spec: none

### Audio and Voice

- [x] **Portrait condensed mode UX refinement** — action buttons horizontal left-aligned with no background/borders (icon-only), hide menu/restart/music buttons, swipe up on build bar to expand sidebar.
  - Spec: [Mobile Portrait Sidebar Expand Button](../specs/022-mobile-portrait-sidebar-expand-button.md)

- [x] **Make sure narrated sounds like (unitReady) can be chained and will not** — be played at the same time but one after another up until a stacking size of 3 everything after that will be skipped if it comes before the stackable sounds are finished playing. So for all playSound calls in the code that play a "narrated sound" make sure to add the new stacking boolean to true and update playSound so it is able to provide stacking behaviour as described.
  - Spec: none

- [x] **Implement milestone system and show first milestone of building a refinery by** — showing a video with sound of a tank running over crystals.
  - Spec: [Building System Enhancements](../specs/005-building-system-enhancements/spec.md)

- [x] **Ensure all sound files are loaded on demand only (no initial browser-load** — audio prefetch/preload); keep playback lazy-loaded at first use.
  - Spec: none

### Missions and Campaign

- [x] **Refine sidebar floating-label inputs to stay compact at 40px height with solid** — brightened backgrounds, no borders/gradients, tutorial-green labels, and desktop-only styled number spinners.
  - Spec: [Sidebar Floating Label Inputs](../specs/050-sidebar-floating-label-inputs.md)

- [x] **Harden multiplayer Netlify E2E invite flow** — suppress tutorial on invite sessions, pause host immediately after startup to prevent AI pre-actions, use RED/YELLOW invite-link paste join flow only (BLUE stays AI), resume when human joins are connected, and switch setup defaults to seed `4` with `40x40` map.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Replace the minimize and docs buttons in the tutorial modal with icons** — (no text) and add tooltip labels. Fixed icon being overwritten by renderStep method.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Refactor tutorialSystem.js into modular files (<1k LOC each) while keeping tutorial behavior intact.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Optimize the mobile portrait sidebar layout and tutorial overlay spacing/typography for a** — more professional small-screen presentation.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Default the tutorial modal to the top-left corner in mobile portrait condensed mode.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Keep base land, land routes, water-percentage scaling, and hand-authored mission maps intact.**
  - Spec: none

### Performance

- [x] **Heavy-battle frame time (2026-09-24)** — Profile a deterministic multi-player battle and cut the measured hot phases without dropping the WebGL fallback. The performance widget shows sim/move/combat/path/AI/fog/terrain/units/effects/UI/minimap average and p95, refreshed once per second. On headless Playwright Chromium 145 (Linux VM, WebGL water-only because no WebGPU adapter, 1280×720, DPR 1, seed 11, map 96, 240 units, 2s warmup, 5s measure) frame time went from 58.63 ms avg / 73.8 ms p95 (17.06 FPS, 86 frames) to 27.25 ms avg / 36.1 ms p95 (36.7 FPS, 184 frames). Sim 39.02→9.05 ms, movement 18.25→5.15 ms, combat 13.94→0.81 ms. Terrain draw calls stayed at 8. GPU pass time was unavailable. This run does not certify 75 presented FPS.
  - Spec: [Heavy-battle frame phases](../specs/072-heavy-battle-frame-phases.md)

- [x] **Replace repetitive cliff ridges with continuous biome-transparent plateaus, width-dependent terraces, all eight** — descending directions, seamless joins and five artwork variants per topology; deliver one quality-85 WebP sprite sheet and verify visual seams and live performance.
  - Spec: [Terrain source WebP conversion](../specs/082-terrain-source-webp.md)

- [x] **Remove terrain chunk monitoring from the FPS/performance overlay so the widget no** — longer shows the verbose `Chunks:` line.
  - Spec: [Frame Limiter Toggle for Performance Widget](../specs/036-frame-limiter-performance-widget.md)

- [x] **Pin the iOS Simulator benchmark to an explicit `iPhone 13 Pro Max`** — simulator device by default, create/use the local simulator UDID, and document install/create commands for missing devices.
  - Spec: none

- [x] **Make benchmark-mode emulator startup leave Safari navigation to the E2E test, so** — the plain app URL is not opened before Vite is reachable and the Simulator no longer sits on the home screen after an early emulator-script failure.
  - Spec: [iOS Simulator Benchmark E2E](../specs/069-ios-simulator-benchmark-e2e.md)

- [x] **Add a sidebar icon button (with tooltip) next to the keyboard-mappings info** — button to toggle the performance widget directly.
  - Spec: [Sidebar Performance Widget Toggle Button](../specs/037-sidebar-performance-toggle-button.md)

- [x] **Add a performance-widget frame limiter toggle (default ON) and support uncapped FPS** — measurement by decoupling scheduler from vsync for bare-performance profiling.
  - Spec: [Frame Limiter Toggle for Performance Widget](../specs/036-frame-limiter-performance-widget.md)

- [x] **Implement rendering P01 strict benchmark and diagnostic tooling (2026-09-20)** — add timed full-map/repeat-lap route evidence, 75 FPS deadline tails and missed-frame reporting, cold/steady CDP captures, backend/refresh eligibility labels, opt-in resize/decode/asset audits, and WebP-85 visual golden manifests. See `specs/083-rendering-p01-diagnostics.md`.
  - Spec: [P01 rendering benchmark and diagnostic tooling](../specs/083-rendering-p01-diagnostics.md)

- [x] **Improve bullet-impact explosion visuals with layered cached fireball/core sprites, shockwave jitter rings,** — and low-count ember accents while preserving frustum culling and sprite-cache performance.
  - Spec: [Bullet Impact Explosion VFX Polish](../specs/061-bullet-impact-explosion-vfx.md)

- [x] **Ensure benchmark results modal stays hidden on startup and opens only lazily when a benchmark run completes.**
  - Spec: none

- [x] **Implemented lighthouse spec 04 main-thread long-task reduction by introducing startup task scheduling** — (post-paint + idle deferrals) and startup performance markers for init phases.
  - Spec: [Lighthouse Performance Remediation Plan (Top 10)](../specs/lighthouse-performance/README.md)

- [x] **Implement `specs/lighthouse-performance/06-critical-css-render-blocking.md` by deferring non-critical UI stylesheets and adding no-script/FOUC guards for** — first paint.
  - Spec: [Critical CSS + Render-Blocking Reduction](../specs/lighthouse-performance/06-critical-css-render-blocking.md)

- [x] **Route the map Settings gear directly into the modal (runtime tab +** — benchmark), move sidebar settings actions into the modal, keep the keybindings tab scrollable with flush section headers, and always show the app version in the sidebar footer.
  - Spec: [Spec: Key Bindings Editor Modal](../specs/spec-keybindings-editor.md)

- [x] **Performance** — Implement O(n×k) spatial quadtree for collision detection replacing O(n²) brute-force iteration
  - [x] Created `src/game/spatialQuadtree.js` with separate trees for ground/air units
  - [x] Created `src/game/flowField.js` for on-demand flow fields at chokepoints
  - [x] Created `src/game/steeringBehaviors.js` with Boids-style separation, alignment, cohesion
  - [x] Integrated quadtree into `unifiedMovement.js` collision detection functions
  - [x] Integrated quadtree into `units.js` resolveUnitCollisions function
  - [x] Quadtree rebuilt once per frame in game loop for consistent spatial queries
  - [x] **Optimized quadtree:** eliminated array spreading, reuse result arrays, pre-compute unit centers
  - [x] **Force-field collision:** units experience exponential repulsion preventing overlap proactively
  - [x] **No velocity inversion:** collisions slow units down gradually instead of bouncing them
  - [x] **Direct movement fix:** units now rotate to face target before moving instead of going opposite direction first
  - Fixed 1-frame delay in `canAccelerate` flag by calling rotation update before position update
  - Reduced rotation threshold from 45° to 15° for non-tank units
  - Reset velocity when receiving new movement command to prevent coasting in wrong direction
  - Spec: none

- [x] **Performance** — Pre-cached gradient sprites for smoke and explosions - moves gradient creation from per-frame CPU to one-time startup + GPU texture sampling
  - [x] Created sprite cache with pre-rendered gradients for sizes [4-32px] at initialization
  - [x] Smoke particles now use `drawImage()` instead of `createRadialGradient()` per frame
  - [x] Explosions use on-demand cached sprites with LRU eviction (max 50 entries)
  - [x] Added view frustum culling for smoke (64px padding) and explosions (128px padding)
  - [x] Reduced `MAX_SMOKE_PARTICLES` from 600 to 300 for better baseline performance
  - [x] Replaced `.forEach()` with `for` loops and removed per-particle ctx.save()/restore()
  - Spec: none

- [x] **Performance** — Batch and throttle pathfinding calculations
  - [x] Extended `PATH_CACHE_TTL` to 4000ms (2x the calc interval) for better cache utilization
  - [x] Added `MAX_PATHS_PER_CYCLE` limit (5 paths max per update) to prevent CPU spikes
  - [x] Units sorted by distance to target - closer units get pathfinding priority
  - [x] Spreads pathfinding work across multiple frames instead of calculating all at once
  - Spec: none

- [x] **Performance** — Smart path recalculation to prevent unnecessary path updates
  - [x] Added `MOVING_TARGET_CHECK_INTERVAL` (5000ms) for distance trend monitoring
  - [x] Added `TARGET_MOVEMENT_THRESHOLD` (2 tiles) for target movement detection
  - [x] Paths only recalculated when target has moved beyond threshold distance
  - [x] For moving targets, paths only recalculated if distance to target is increasing (unit going wrong direction)
  - [x] Tracks `lastKnownTargetPos` and `lastDistanceToTarget` per unit for smart decisions
  - [x] **Architecture fix:** Clear separation of path calculation responsibilities:
  - [x] Attack mode units (with `unit.target`) handled ONLY by `updateUnitMovement()`
  - [x] Regular movement (moveTarget without attack) handled by `updateGlobalPathfinding()`
  - [x] Skip recently calculated paths (within 100ms) to prevent same-frame conflicts
  - [x] Removed problematic `path.length < 3` trigger that caused constant recalculation
  - [x] Removed duplicate path calculation from `handleTankMovement()` in combatHelpers.js
  - [x] Fixed range mismatch: `updateUnitMovement()` now uses `getEffectiveFireRange()` instead of hardcoded range
  - [x] Suppress stuck/dodge detours for human-issued move paths so a single player path stays intact
  - [x] Standardize enemy AI pathfinding on `getCachedPath()` to match player pathfinding algorithm
  - [x] **Architecture fix:** Clear separation of pathfinding responsibilities:
  - Spec: none

- [x] **Performance** — Throttle AI updates with frame skipping
  - [x] Added `AI_UPDATE_FRAME_SKIP` config (default: 3) - AI runs every 3rd frame (~20 FPS AI at 60 FPS game)
  - [x] Frame counter in enemy.js skips AI processing on non-AI frames
  - [x] Reduces AI CPU overhead by ~66% while maintaining responsive gameplay
  - Spec: none

- [x] **Performance** — View frustum culling for units and buildings
  - [x] Added `VIEW_FRUSTUM_MARGIN` config (64px buffer = 2 tiles) to prevent pop-in artifacts
  - [x] Units outside visible viewport + margin are skipped in `shouldRenderUnit()`
  - [x] Buildings outside visible viewport + margin are skipped in `shouldRenderBuilding()`
  - [x] Frustum check runs before fog-of-war visibility check (cheaper early exit)
  - [x] Affects both base rendering and overlay rendering passes
  - Spec: none

- [x] **Performance** — Precompute SOT (Smoothening Overlay Texture) masks when map is loaded/mutated instead of examining 4 neighbors per land tile each frame.
  - [x] Created `sotMask` 2D array in MapRenderer storing precomputed orientation and type for each tile needing smoothening overlays
  - [x] `computeSOTMask()` generates the full mask once on initial render (lazy initialization)
  - [x] `updateSOTMaskForTile()` efficiently updates only affected tiles and neighbors when tile mutations occur
  - [x] `drawBaseLayer()` now uses O(1) mask lookup instead of O(4) neighbor checks per land tile
  - [x] Integrated SOT mask updates into `clearBuildingFromMapGrid()` for runtime tile type changes
  - [x] Exposed `getMapRenderer()` and `notifyTileMutation()` in rendering.js for external mutation notifications
  - [x] **Bug Fix:** SOT tiles now correctly update when loading save games or missions by invalidating the SOT mask cache
  - [x] **Bug Fix:** SOT now renders below ore overlays in GPU rendering mode by adding second pass for ore/seed overlays in `renderSOTOverlays()`
  - [x] **Feature:** SOT now applies to street tiles crossing water - water corner smoothening on streets
  - Spec: none

- [x] **Performance** — Cache building smoke emission scale factors on construction completion
  - [x] Added `cacheBuildingSmokeScales()` function in buildings.js to precompute scale factors
  - [x] Scale factors cached when building is created or when image first loads (async callback)
  - [x] `updateGame.js` now uses cached `cachedSmokeSpots` instead of per-frame image lookups and scale calculations
  - [x] Removes per-frame `getBuildingImage()` calls for smoke emission, deferring to cached values
  - Spec: none

- [x] **Throttle heavy-damage unit fume smoke to prevent particle overload and performance drops.**
  - Spec: none

- [x] **Ensure the money display updates only every 300ms to save performance on DOM rendering updates.**
  - Spec: none

- [x] **Rotation-aware capsule contact pushes adjacent ships when a rotating hull touches them** — while retaining quadtree broad-phase performance.
  - Spec: none

- [x] **Add topology, chunk-boundary edit and opt-in combat performance coverage; document rebuilds and** — measured limits in specs/organic-terrain.md.
  - Spec: [Organic terrain, shorelines and connected cliffs](../specs/organic-terrain.md)

- [x] **Preserve cached rendering and verify shorelines, edits, direction masks, units and live performance.**
  - Spec: none

- [x] **Add opt-in live function rankings (self/inclusive time, calls, tails), CPU/GPU/memory capability diagnostics,** — and cumulative draw/upload/resize counters to the performance overlay. The transformed-image resize audit itself remains owned by P01.
  - Spec: none

- [x] **Add the independent, persisted Function timings toggle to the performance overlay with** — a disabled fast path for legacy `logPerformance` callers (2026-09-19).
  - Spec: [Sidebar Performance Widget Toggle Button](../specs/037-sidebar-performance-toggle-button.md)

- [x] **Add an opt-in full-capacity smoke performance benchmark that records FPS, render CPU time, and heap behavior.**
  - Spec: none

- [x] **Record the isolated before/after smoke-pass times and the pixel comparison in `specs/087-gpu-chimney-smoke.md`.** — Qualifying-hardware 75 FPS certification is still outstanding.
  - Spec: [Rendering pipeline: strict 75 FPS and preparation](../specs/rendering-pipeline-75fps.md)

### Landing Page and i18n

- [x] **Landing gameplay shots and parallax backdrop (2026-09-25)** — replace the February 2026 desktop, landscape, and portrait shots with captures of the demo battle, and show a large blurred gameplay image behind the page with scroll parallax that stays still under reduced motion.
  - Spec: [Marketing landing page](../specs/090-marketing-landing-page.md)

- [x] **Adjust legal quick links visibility** — hide floating shell links when mobile portrait sidebar is condensed or collapsed; keep them visible only when the sidebar is expanded.
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [x] **Ensure the German `Impressum` links to `/kontakt` and the English `Imprint` links** — to `/contact` even when the shared config stores only one base contact-form route.
  - Spec: none

- [x] **Remove the "Back to game" header link from all legal/contact pages so** — opening legal routes in a new tab no longer shows a misleading in-tab return action.
  - Spec: none

- [x] **Generate `dist/impressum.config.json` during `npm run build` from `IMPRESSUM_CONFIG_JSON` (with local-file fallback) so** — Git-based Netlify deploys can serve the private legal config without committing it.
  - Spec: none

- [x] **Move the legal implementation into `src/legal`, add Vite dev-route rewrites plus post-build** — HTML relocation so `/impressum`, `/privacy`, `/contact`, and related pages keep their existing public URLs, and complete the remaining legal-text fixes (address split, dispute-resolution notice, legal bases, retention, third-country transfer, TLS, and Netlify Forms disclosure).
  - Spec: none

- [x] **Add bilingual Netlify Forms contact pages (`/contact` EN, `/kontakt` DE) with honeypot** — spam protection, custom success pages, and matching dark-theme form styling.
  - Spec: none

- [x] **Add `vite.config.js` with multi-page `rollupOptions.input` so all root HTML pages (legal, contact,** — success) are included in `vite build` output.
  - Spec: none

- [x] **Remove the floating `global-legal-links` shell element so the homepage no longer shows** — fixed legal quick links; legal pages remain available through their dedicated routes and existing in-game entry points.
  - Spec: [Legal pages setup](../docs/legal-pages.md)

### Saves and Replay

- [x] **Replay follow-up polish** — replay rows now show start date + duration only, replay loads auto-start with synced play/pause icon, drag-to-build blueprints replay correctly, remote-control/cheat inputs are recorded, and record button moved beside speed slider.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — shrink the speed slider so the record button fits on the same row, make replay list rows match save-game row styling with export/delete actions, record player-triggered production pause/resume events, restore replay-mode camera panning for right-drag and two-finger pan, and block drag-to-build while replay mode is active.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — replay-applied production commands now bypass replay-mode user locks correctly, and replay row labels now use `YYYY/MM/DD, hh:mm:ss, DURATION`.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — record and replay production cancels so paused-then-aborted builds preserve the remaining pipeline, and execute recorded player unit commands through the real input handlers so movement, attack, retreat, guard, support, and keyboard-issued commands replay correctly.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — keep all user unit commands locked for the full replay session, fix replayed unit-command execution fallback so commands no longer no-op, and pause the game automatically when replay playback finishes until the user explicitly resumes normal play.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — replay keyboard-driven remote-control inputs through the real remote-control state helpers, move speed/volume values into the left slider labels to free slider width, use green slider knobs, and match the replay-list scrollbar styling to the save-list scrollbar.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — restore selected unit context when replaying keyboard remote-control commands so direct-control actions drive the recorded unit again, and decouple replay playback from the remote-control module import path.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — restore selection for every replayed unit command and use a dedicated replay-side UnitCommandsHandler fallback so move/attack playback no longer depends on a window-owned live handler reference.
  - Spec: [Building Selection Should Not Issue Move Commands](../specs/046-building-selection-no-move-command.md)

- [x] **Replay follow-up polish** — replay unit commands now resolve post-baseline spawned units via deterministic replay unit references and a legacy id-alias fallback, so exported replays still move newly produced units even when playback regenerates different runtime ids.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — user-set rally points on the construction yard, vehicle factory, and vehicle workshop are now recorded and replayed so produced and restored units follow the same building rally destinations during playback.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — classic AI building placements, unit spawns, and unit-order changes are now recorded into replay logs with the correct owner, host-applied remote-party commands are recorded the same way, and live AI is disabled during replay so playback follows the recorded actions for any party in larger matches.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replay follow-up polish** — replay loading now restores the embedded baseline directly from memory instead of writing a temporary save into localStorage first, preventing quota errors when loading larger 4-player replays.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Expand OpenAI API key settings with security-critical disclosure (hover/focus), dedicated limited-permission key** — guidance, localStorage/XSS risk warning, official OpenAI safety link, low-cost model recommendation, and explicit at-your-own-risk opt-in checkbox before key entry.
  - Spec: [Map Settings expand scroll alignment](../specs/062-map-settings-expand-scroll-alignment.md)

- [x] **Add startup query-param map overrides (`size`, `width`, `height`, `players`, `seed`) that dominate** — localStorage for the current session only (non-persistent), and update the Netlify multiplayer E2E host flow to use `?size=25&players=4&seed=11` with only 3 browsers (host/red/yellow) while blue remains local AI.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **T033 Fix client building sync when host loads save game**
  - done: Added mapTilesX/mapTilesY to game state snapshot so client knows map dimensions; Added ensureClientMapGridInitialized() to initialize client mapGrid/occupancyMap before building placement; Fixed building placement bounds checking with proper mapGrid readiness validation; Added mainFactories sync to keep factories array from main.js in sync with gameState.factories
  - Spec: none

### Tooling and CI

- [x] **Rebase-only history (2026-09-25)** — Feature branches rebase onto main (`git fetch && git rebase origin/main`) and push with `git push --force-with-lease`. Do not merge main into a feature branch and do not create merge commits. Pull requests merge by squash or rebase. The rule is in `AGENTS.md` under Git / Workflow.
  - Spec: none

- [x] **Fix building system unit tests failing due to missing `hasLineOfSightToTarget` mock export.**
  - Spec: [Building System Enhancements](../specs/005-building-system-enhancements/spec.md)

- [x] **Add one prepared Playwright E2E covering a Ferry with ten tanks, a** — land-based Hovercraft with five tanks, and a coast-water Hovercraft with five tanks, including command priority, cancellation cleanup, cursor behavior, and completed capacity loading.
  - Spec: none

- [x] **Stabilize the repair-countdown HUD unit test in shared CI workers by resetting** — its dynamically imported module graph and loading mocked `gameState` before its renderer consumer.
  - Spec: none

- [x] **Ensure CI runs lint, unit tests, and integration tests on pull requests.**
  - Spec: none

- [x] **Add unit tests for the remote WebRTC peer connection workflow (remoteConnection module).**
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Add lockstep manager unit tests to validate deterministic lockstep synchronization behavior.**
  - Spec: [Deterministic Lockstep Networking](../specs/015-deterministic-lockstep/spec.md)

- [x] **Add unit coverage for control group handling (KeyboardHandler control group assignment/selection/rebuild tests).**
  - Spec: none

- [x] **Add keyboard handler unit tests (Task 4.3) to cover hotkey modes, dodge logic, control groups, and stop-attacking flows.**
  - Spec: none

- [x] **Add unit tests for the cheat system input flows (Task 4.1) to cover parsing, spawning, and state updates.**
  - Spec: none

- [x] **Add unit test coverage for WebRTC session monitoring, AI fallback, and kick flow (Task 5.5).**
  - [x] ✅ Unit tests for multiplayer invite lifecycle, host regeneration, and party ownership changes (Task 5.3).
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Add unit tests for selection manager input flows (Task 4.6).**
  - Spec: none

- [x] **Add round-trip and 200×200 reduction unit coverage with a less-than-one-tenth size target.**
  - Spec: none

- [x] **Add an opt-in iOS Simulator Safari benchmark E2E that starts the emulator** — script, opens the app benchmark in Simulator Safari, collects the in-app FPS result, and currently fails below 55 average FPS while keeping the threshold configurable.
  - Spec: [iOS Simulator Benchmark E2E](../specs/069-ios-simulator-benchmark-e2e.md)

- [x] **Add explicit hidden `form-name` inputs to the Netlify contact forms so deploy-preview** — submissions reliably include the form identifier and custom success-page redirects do not fall through to a 404.
  - Spec: none

- [x] **Ensure GitHub PR CI explicitly reruns unit tests on `pull_request.synchronize` so every** — new commit pushed to an open PR exercises `npm run test:unit`.
  - Spec: none

- [x] **Enable hardware GPU acceleration defaults for headed multiplayer Playwright role browsers (prefer** — Chrome channel + GPU flags) and run HOST/RED/YELLOW build progression in parallel instead of sequentially.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Align multiplayer E2E browser window and rendered content sizes (no viewport-window mismatch),** — enforce host stays paused until all invited parties connect, and assert per-party refinery unload income accounting for HOST/RED/YELLOW.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Improve headed Playwright multiplayer FPS** — keep Chromium frame pacing stable by default (remove uncapped rendering flags), cap per-role window size for lower GPU load, and make browser channel/uncapped rendering opt-in via env (`PLAYWRIGHT_BROWSER_CHANNEL`, `PLAYWRIGHT_UNCAPPED_RENDERING`).
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Improve headed Playwright multiplayer performance by launching role browsers with anti-throttling Chromium** — flags (`--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`) to reduce FPS drops in non-focused windows.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Refine the Netlify 4-party multiplayer Playwright E2E to enforce host setup choreography** — host sets 25x25/4 players, minimizes tutorial, pauses before invites, opens RED/YELLOW invite links with alias submission, keeps BLUE as AI, resumes only after human joins, then validates GREEN/RED/YELLOW build-out and tank-vs-tank combat.
  - Spec: [Multiplayer invite status on button](../specs/061-multiplayer-invite-button-status.md)

- [x] **Force Netlify multiplayer Playwright runs into non-headless mode (visible windows) and harden** — 4-party E2E teardown/timeouts to avoid diverging/pending runs.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Add a Netlify-dev Playwright E2E that simulates a 4-party multiplayer session (host** — + 2 remote humans + 1 AI), validates per-party build-out, harvester income sync, movement sync, projectile sync, and destroyed-unit sync on a 25x25 map.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Add a changed-files-only lint fix command (`npm run lint:fix:changed`) and update agent** — instructions to use it instead of repo-wide lint fixing.
  - Spec: none

- [x] **Add meaningful unit tests to boost coverage in main.js, inputHandler.js, updateGame.js, and** — saveGame.js (focus on least-covered functions and branches).
  - Spec: none

- [x] **Extend unit tests for Task 16.1-16.10 coverage targets (config, game setup, map** — editor, retreat, benchmark runner, ambulance/building systems, game state manager, hospital logic, mine system).
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Expand unit tests for tasks 16.11-16.20 (recovery tank, remote control, unit movement,** — selection manager, lockstep, multiplayer store, remote connection, state hash, enemy AI player, logger).
  - Spec: [Deterministic Lockstep Networking](../specs/015-deterministic-lockstep/spec.md)

- [x] **Expand unit test coverage for workshop logic, keyboard input handling, cheat system** — behaviors, and cursor management (Tasks 15.12-15.15).
  - Spec: none

- [x] **Add unit tests for command queue sweeps, game loop pause/lockstep behavior, harvester** — recovery, and unit combat firing edge cases (Tasks 15.7-15.11; minerBehavior blocked due to missing file).
  - Spec: [F22 runway robustness and combat command reliability](../specs/048-f22-runway-robustness-and-combat-command.md)

- [x] **Add unit tests for hospitalLogic crew healing and ambulance refill behavior.**
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Add unit tests for helipadLogic.js covering fuel, ammo, landing, and resupply behavior.**
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Add unit tests for gameStateManager (task 3.4) covering scrolling, ore spread, cleanup paths, and win/loss logic.**
  - Spec: none

- [x] **Add unit tests for `src/game/buildingSystem.js` to cover sell/destruction handling, defensive firing, and** — Tesla coil effects.
  - Spec: none

- [x] **Add unit tests for enemy AI building placement (Task 2.2) covering defensive placement, spacing, and guardrails.**
  - Spec: none

- [x] **Add unit coverage for enemy AI unit behavior (ambulance, harvester hunter, base defense, and apache retreat logic).**
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Add unit tests for enemyStrategies AI behaviors (repairs, retreats, attack coordination, crew** — recovery, logistics, and ammo monitoring).
  - Spec: none

- [x] **Extend unit tests for `webrtcSession` and `enemyStrategies` (Tasks 15.16-15.17) to cover WebRTC** — session edges, AI coordination, and logistics behaviors.
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Add unit tests for `src/ai/enemyAIPlayer.js` to cover AI economy recovery, building completion,** — and unit production logic.
  - Spec: none

- [x] **Add comprehensive unit test plan and implement first unit tests for `baseUtils.js`** — (24 tests covering `getBaseStructures()` and `isWithinBaseRange()` utilities)
  - Spec: none

- [x] **Add meaningful unit tests for `src/ai/enemySpawner.js` covering spawn placement, harvester setup, crew/gas** — initialization, and cheat-system handling.
  - Spec: none

- [x] **Add Priority 6 command sync unit tests covering command payload helpers and state hash verification.**
  - Spec: none

- [x] **Add unit tests for 0% coverage files** — enemyUtils.js (29 tests), guard.js (12 tests), dangerZoneMap.js (32 tests), seedUtils.js (39 tests), helipadUtils.js (23 tests), inputUtils.js (28 tests) - total 163 new tests bringing coverage from 839 to 1002 tests
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Add additional unit tests for smokeUtils.js (26 tests), debugLogger.js (19 tests), logic.js** — (42 tests), retreat.js (33 tests) - total 120 new tests bringing test count from 1002 to 1128
  - Spec: none

- [x] **Add more unit tests for hitZoneCalculator.js (36 tests), soundCooldownManager.js (19 tests), serviceRadius.js** — (31 tests), version.js (4 tests) - total 90 new tests bringing test count from 1128 to 1218
  - Spec: none

- [x] **Expand bullet system unit tests (Task 3.1) to cover updateBullets and fireBullet behaviors with meaningful scenarios.**
  - Spec: none

- [x] **Integrated Vitest 4.0.18 for headless unit and integration testing (no video/audio/rendering). Extracted** — building data and validation functions into `src/data/buildingData.js` and `src/validation/buildingPlacement.js` to break circular imports. Created 31 building placement tests covering MAX_BUILDING_GAP_TILES variations (0, 1, 2, 3 tile gaps) with positive and negative test cases.
  - Spec: none

- [x] **Add map clicks before cheat commands in Apache E2E test to properly** — position cursor for helipad, helicopter, and tank spawning.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Replace in-memory session storage with Netlify Blobs for persistence**
  - Spec: none

- [x] **Update netlify.toml with functions config and API redirects**
  - Spec: none

- [x] **Replaced unreliable Netlify Blobs prefix listing with explicit index-based peer tracking**
  - Spec: none

- [x] **Refactor** — move all constants into config.
  - Spec: none

- [x] **Refactor** — split unifiedMovement.js into modular files under 1k LOC each while preserving existing unit test behavior.
  - Spec: none

- [x] **Refactor** — split mouseHandler.js into submodules (<1k LOC each) to reduce complexity while keeping unit tests green.
  - Spec: none

- [x] **Refactor** — split unitCommands.js into submodules (<1k LOC each) while keeping existing unit tests passing.
  - Spec: none

- [x] **Refactor** — split unitCombat.js into submodules (<1k LOC each) while keeping existing unit tests passing.
  - Spec: none

- [x] **Refactor** — remove the soundMapping and use soundFiles directly instead.
  - Spec: none

- [x] **Refactor** — updateGame.js is too big and needs to be modularized.
  - Spec: none

- [x] **Refactor** — enemy.js is too big and needs to be modularized.
  - Spec: none

- [x] **Refactor** — Rendering.js is too big and needs to be modularized.
  - Spec: none

- [x] **Refactor** — inputHandler.js is too big and needs to be modularized.
  - Spec: none

- [x] **Extend bullet system unit tests to cover apache rockets, dodge logic, and crew damage (Task 15.6).**
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Add meaningful unit tests to boost coverage in unifiedMovement.js (improved from 28.57%** — to 35.71% function coverage with 56 tests covering checkMineDetonation, isUnitCenterInsideMineCircle, normalizeAngle, isAirborneUnit, isGroundUnit, ownersAreEnemies, isValidDodgePosition functions)
  - Spec: none

- [x] **Added npm script 'test:e2e:file' to run specific E2E test files in headless mode**
  - Spec: none

### Other

- [x] **Follow-up polish for save sharing** — fix import/export icons, auto-load exactly one imported save, support multi-file import without auto-load, and export filenames as timestamp-first.
  - Spec: [Sidebar Save Game Import/Export](../specs/051-save-game-import-export.md)

- [x] **Friendly-unit click action hierarchy (2026-07-27)** — when selected units click a friendly unit, apply exactly one eligible action in strict `board/load into -> request service -> guard` order, and select the clicked unit only when none of those interactions can apply.
  - Spec: none

- [x] **Rewrite README professionally with clear project purpose/origin (December 2024, fully vibe coded),** — local install/run instructions, user-doc references, architecture-doc references, and preserve the prior README as a legacy file.
  - Spec: none

- [x] **Add a proper standard MIT license to the project (`LICENSE`), add `license** — MIT` in package metadata, and mention license in README.
  - Spec: none

- [x] **Rename all in-repo and in-game title variants to Code for Battle.**
  - Spec: none

- [x] **Extracted state synchronization logic from gameCommandSync.js into dedicated stateSync.js module for better** — code organization and modularity.
  - Spec: none

- [x] **Refactored gameCommandSync.js (2068→302 lines) into a thin coordinator that imports/re-exports from commandTypes.js,** — networkStats.js, commandBroadcast.js, stateSync.js, and lockstepSync.js while maintaining full backward compatibility.
  - Spec: [Deterministic Lockstep Networking](../specs/015-deterministic-lockstep/spec.md)

- [x] **Split `src/ui/productionController.js` into smaller UI modules (<1k LOC each) while preserving production behavior.**
  - Spec: none

- [x] **Split the monolithic stylesheet into modular CSS files and update HTML/service worker references for the new layout.**
  - Spec: none

- [x] **Ensure window.logger is not used in any server (Node.js) context - all scripts now use console.log/console.warn**
  - Spec: none

- [x] **Change right-click erase in edit mode to require Shift + Right Click,** — allowing normal map scrolling with right-click alone.
  - Spec: none

- [x] **Hide cheat console scrollbars while keeping vertical scroll and preventing horizontal scroll.**
  - Spec: [Cheat Console UI Alignment](../specs/026-cheat-console-ui.md)

- [x] **Buffer GPU tile rendering with off-screen margin rows/columns so no black bars appear while panning to map edges.**
  - Spec: none

- [x] **Add short-range occupancy-based lookahead so moving units steer away from nearby blockers** — before colliding while keeping their planned paths unchanged.
  - Spec: none

- [x] **T018 [US3] sync host metadata (start/pause/cheat authority, party state) during save/load handover** — so the new host gains exclusive controls
  - done: aiPartySync.js module observes AI reactivation events and reinitializes AI controllers for disconnected parties
  - Spec: none

- [x] **T027 Client unit spawn and smooth movement fix**
  - done: Client no longer spawns units locally - sends UNIT_SPAWN command to host; Host processes UNIT_SPAWN and creates unit; Added easeOutQuad interpolation for smooth unit movement between 500ms snapshots; Movement interpolation runs each frame on client via updateUnitInterpolation()
  - Spec: none

- [x] **T029 Fix client unit movement not working on host**
  - done: Fixed updateUnitPathfinding() in unitMovement.js to iterate over ALL units with moveTarget, not just selectedUnits; Previously host would receive UNIT_MOVE and set moveTarget but pathfinding only ran for local player's selected units; Now any unit with moveTarget gets path calculated
  - Spec: none

- [x] **T030 Client movement interpolation**
  - done: Added linear interpolation for smooth unit movement on client between 100ms host snapshots; unitInterpolationState Map tracks prev/target positions per unit; updateUnitInterpolation() called every frame interpolates x, y, direction, turretDirection; Handles angle wraparound for rotation
  - Spec: none

- [x] **When a group of units attack a target and there are friendly** — units in line of sight so they can't fire then this unit needs to walk around the target in a circle until line of sight is free to attack the target. Make sure the circle's circumfence the unit is using to walk along has the radius that is equivalent to the distance between the target and the unit.
  - Spec: none

- [x] **Refine the coloring of the power bar and its logic on impacting the production.**
  - Spec: none

- [x] **Add all favicons and shortcut icons.**
  - Spec: none

- [x] **When entering the save game's name the user can save by pressing enter.**
  - Spec: none

- [x] **Ensure the leveling stars on a unit when not selected look like the same as when they are not selected (smaller).**
  - Spec: none

- [x] **Make sure the showNotification clears the previous one immediatly before showing a new one.**
  - Spec: none

- [x] **On pressing R Key the repair mode should be toggled unless there is no input having focus.**
  - Spec: none

- [x] **Enemy unit types need to have the same color as the player** — unit types. That means for example that a tank_v1 of the player should be blue as well as a tank_v1 for the enemy.
  - Spec: none

- [x] **The tesla coil should make little damage to the target.**
  - Spec: none

- [x] **Spec 006 Ensure that enemy units always attack player units when they** — are being attacked themselves, unless they are in "flee to base" mode
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Ensure money for builds is gradually spend during build process**
  - Spec: none

- [x] **Increase map scroll speed inertia by 3x.**
  - Spec: none

- [x] **Add save and load game functionality with a menu containing a list with save games and their labels.**
  - Spec: none

- [x] **Vehicles now spawn on the tile directly below the center of the** — vehicle factory. If that tile is occupied, the existing unit is moved to a nearby free tile using algorithm A1 before the new unit appears.
  - Spec: none

- [x] **Add fuzzy runtime-config search that matches variable names/IDs/current values and allows editing** — directly from filtered results.
  - Spec: [Runtime Config Fuzzy Search](../specs/053-runtime-config-fuzzy-search.md)

- [x] **Reduce repeated dense sampling on diagonal cliffs while restoring a shorter north-facing** — perspective depth than the south-facing cliffs.
  - Spec: none

- [x] **Rotated ship hulls, including ships with coincident centers, cannot retain overlapping rendered hulls.**
  - Spec: none

- [x] **Remote-controlled ships ramp to top speed while Up is held and brake to zero while Down is held.**
  - Spec: none

- [x] **Submarines fire half as many torpedoes per minute as before (5.2-second cooldown).**
  - Spec: none

- [x] **Destroyed ships explode immediately, large hulls show distributed explosions, and sinking follows the blast.**
  - Spec: none

- [x] **Replace the five-tile constant-damage gas-station blast with a four-tile blast using discrete** — inward damage rings of 25%, 50%, 75%, and 100%.
  - Spec: none

- [x] **Vary shore depth with seeded smooth noise and round corners where two** — shores meet, so coasts are irregular curves at the tile level.
  - Spec: none

- [x] **Replace the circular center-lake stamp with a seeded radial blob that stays connected around the map center.**
  - Spec: none

- [x] **Generate cohesive grass/road source materials and transparent rock formation art.**
  - Spec: none

- [x] **Bake complete 47-mask road atlas, deterministic variants and diagonal fringe wedges.**
  - Spec: none

- [x] **Replace noisy grass with generated meadow art and restore generated natural decorations.**
  - Spec: none

- [x] **Prefer eight-direction connected neutral cliffs for chains, neutral boulders for isolated parts.**
  - Spec: none

- [x] **Create `performance_improvement.md` and `rendering_improvement_todos.md` with detailed design, file ownership, parallel waves, integration** — barriers and validation gates; this is documentation only.
  - Spec: none

- [x] **Increase chimney puff particle density and make particles start small, grow while** — rising, fade slowly, and drift with animated wind.
  - Spec: none
