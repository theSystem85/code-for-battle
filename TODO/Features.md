# Features

A feature is a new capability that does not exist yet. Broken or spec-contrary behavior belongs in [Bugs.md](Bugs.md). Polish, performance, UX, refactors, and balance of working features belong in [Improvements.md](Improvements.md).

Open work is grouped by game area. Finished work is under [Done](#done) in the same area order. Add a new item under the matching open heading, not at the end of the file:

    - [ ] **Short title** — One-line description.
      - Spec: none

When a spec exists, replace `Spec: none` with a relative link such as `[Title](../specs/021-f22-raptor-unit.md)`. Do not invent a spec file. When the work is finished, mark the checkbox `[x]` and move the entry under Done for that area.

## Contents

- [Units and Combat](#units-and-combat)
- [Air and Jets](#air-and-jets)
- [Economy and Buildings](#economy-and-buildings)
- [AI](#ai)
- [Multiplayer and Networking](#multiplayer-and-networking)
- [Audio and Voice](#audio-and-voice)
- [Missions and Campaign](#missions-and-campaign)
- [Tooling and CI](#tooling-and-ci)
- [Done](#done)

## Units and Combat

- [ ] **Add a cheat code `recover [party]` to instantly restore the selected wreck** — and assign it to the specified party (defaults to the player).
  - Spec: [Cheat Code: Recover Selected Wreck](../specs/025-cheat-recover-wreck.md)

- [ ] **Spec 011 Land mine system planning:**
  - [x] ✅ Mine layer truck (1000 cost, 30 health, ammo-truck fuel profile, rotationSpeed 0.04) requires workshop + ammunition factory + vehicle factory
  - [x] ✅ 20-mine capacity using ammo HUD bar, refilled by ammo truck/factory, 20% slower than tanker (half speed while deploying)
  - [x] ✅ Deploy mines via ctrl+click stacking or drag-area checkerboard auto-deploy with chain-of-commands markers, auto-refill + resume if mines depleted, mines arm after unit leaves tile
  - [x] ✅ Mines: skull tile indicator (70% opacity), friendly occupancy only, 10 HP, 90 damage center + 50 orthogonal neighbors, chain reactions for contiguous lines, explode on any unit, remaining payload explodes on truck death
  - [ ] Mines detonate only when a unit’s center lands inside the deploying tile’s inner circle so grazing the edge doesn’t trigger the blast.
  - [x] ✅ Mine sweeper tank (workshop + vehicle factory, 1000 cost) inherits tank stats sans turret, double armor, 70% tank speed (normal) / 30% (sweeping)
  - dust animation while sweeping, negates mine damage while sweeping
  - Sweeper controls: click to move, drag rectangle to sweep zig-zag with PPF markers, ctrl+paint area with orange overlay then PPF lines
  - [x] ✅ Mine sweeper must physically traverse every sweep tile before disarming (no remote area clears when merely entering the field) — enforced via tile-by-tile movement reissue in `commandQueue.js`.
  - [x] ✅ Keep mine sweepers locked in sweeping mode and moving in straight serpentine lanes without re-pathing detours by overriding movement during sweep commands (see `commandQueue.js` + `unitMovement.js`).
  - [x] ✅ Mine Layer drag deployments now reuse the Mine Sweeper serpentine path ordering so trucks follow the same efficient lanes when planting checkerboard fields (`mineInputHandler.js`).
  - [x] ✅ When multiple Mine Layers or Mine Sweepers receive the same area command, automatically split the serpentine path into contiguous segments so each unit handles its share without overlap (`mineInputHandler.js`).
  - [ ] Owner-aware mine avoidance (in progress 2025-11-19): ensure occupancy/pathfinding/movement block only the owning party while other players can traverse and trigger mines.
  - [ ] Adjust mine explosions so damage falls off over a 2-tile radius (full damage on the mine tile down to zero at the border) instead of targeting individual orthogonal tiles.
  - [ ] Add cheat codes `mine [party]` and `mines [WxH][gG]` so testers can drop a single mine or a patterned field (e.g., `mines 2x3g1` or shorthand `3x1` which equals `3x1g0`) and document the usage in specs.
  - Must also make sure enemy units trigger detonations when entering armed tiles and friendly units treat their own mine tiles as blocked in pathfinding/occupancy calculations.
  - Current focus: propagate owner-aware `findPath` options through AI behaviors/strategies and path caching so every path request knows the unit owner.
  - [ ] Make the occupancy map player-aware: `o` cycles between `Players` and individual player views, shows a notification for the current overlay, and only highlights each party's mines on their own occupancy map.
  - Minesweeper uses gas only (no ammo), mine deploy indicators persist until destruction
  - Enemy AI deploys mines (ore fields + approach roads) once ammo factory + truck exist and fields ammo, AI builds sweeper units when mines destroy their units
  - [ ] Continue post-Phase-5 mine-system implementation per latest directive: finish optional steps, ensure Mine Layer and Mine Sweeper PPF flows are fully integrated before moving forward.
  - [ ] Play `AllMinesOnTheFieldAreDisarmed.mp3` when an area sweep completes and `The_mine_field_has_been_deployed_and_armed.mp3` when a Mine Layer finishes arming every tile of a dragged minefield.
  - [ ] Make rectangle sweep commands route the sweeper to the nearest entry tile, flip to clearance mode with dust and 30% speed before entering, and pick the serpentine order (left-right/top-to-bottom versus reverse) that minimizes the approach distance while covering every tile.
  - Spec: [Land Mine System (Mine Layer + Mine Sweeper)](../specs/011-mine-system-planning/spec.md)

- [ ] **Add AI policy scripts** — Make sure to come up with a sophisticated modular extensible unit AI policy architecture that can be used for humand and AI players' units. Create and integreate some JSON policy script to manage the AI's combat behaviour including priorities and another one to manage the AI's base build und unit production behaviour. Add the following initial scripts for this behaviour:
  - [ ] when player attacks -> defend or retreat into base if the unit under attack is too weak (havesters or combat units that are outnumbered) to regroup in the protection of the base defence. When attack was defended strike back.
  - Spec: [Production Button Input Architecture](../docs/production-button-input-architecture.md)

- [ ] **Wrecks and recovery/recycling** — Ensure the units when destroyed do not just vanish from the map but their left overs keep lying on the map. The left overs should look totally color desaturated and slightly noisy to indicated dirt and damage (cache those desaturated images and reuse them). Any (also the ones from the enemy) left over unit can be pulled by a recovery tank to the base when player has the recovery tank selected and clicks on the tank. The the recovery tank will drive to the target then mount (indicated by a 2px black string that connects both units) and then automatically drive to the workshop where it unmounts and the unit gets fully restored but without crew.
  - 2nd option is that the user has the recovery tank selected and clicks on the left over unit while holding shift key. Then the leftover unit get recycled completely (vanishes from the map) but the owner of the recovery tank gets 33% of the value of the unit added to his budget (like a harvesting of resources). This process takes about as long as it took the unit to build. Show blue progress bar on the recovery tank while this mode is active.
  - Spec: none

- [ ] **Add permanent per-tile decals for combat events:**
  - `impact` decal when unit-fired shots impact a tile/target tile.
  - `crater` decal when a unit explodes.
  - `debris` decals across full building/factory footprints on destruction.
  - Decal selection must be pseudo-random from map seed and replace prior tile decal when a new event occurs.
  - Save/load support required for tile decals (type + deterministic variant state/counter).
  - Rendering order requirement: ore/seed overlays must remain above decals.
  - Spec: none

## Air and Jets

- [ ] **F22 combat follow-up (2026-03-20)** — only fire rockets while targets remain inside the active firing window, and hard-cap effective F22 firing range at 20 tiles including bonuses.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [ ] **Add F35 stealth strike fighter unit with generated sidebar/map assets, VTOL landing** — on helipads/airstrip parking/empty ground, JDAM multi-target AGF bombing, radar stealth, F22-relative speed/cost tuning, ground-only attack rules, landed logistics servicing/refill, crash wreck recovery parity, build prerequisites ((airstrip OR helipad) AND ammo fab), F35 sound hooks, and cheat-spawn support.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

## Economy and Buildings

- [ ] **Add long-press production tooltips that show unit/building stats, damage totals, and clickable** — focus rows aligned to the money bar tooltip style.
  - Spec: none

## AI

- [ ] **Add LLM strategic AI settings + provider model pickers, commentary toggle/TTS, cost** — tracking, and in-game usage overlays.
  - [x] ✅ Add quota exceeded error handling that stops LLM polling, shows user-friendly error messages, and falls back to local AI only.
  - [x] ✅ Add authentication (401) and API parameter (400) error handling with appropriate user notifications.
  - [x] ✅ Only show error messages when API key is configured (silent logging otherwise).
  - [x] ✅ Use `max_completion_tokens` parameter for OpenAI API compatibility with newer models.
  - [x] ✅ Handle unsupported parameter values (e.g., temperature constraints) across all providers.
  - [x] Add a bootstrapped strategic system prompt with game overview + JSON schema details; follow-up ticks should only send compact state/transitions.
  - [x] Include full unit/building stat catalogs (cost, HP, speed, armor, damage, etc.) in the LLM bootstrap prompt so the AI knows all game capabilities.
  - [x] Filter LLM input by fog-of-war so the AI only sees enemy units/buildings visible to its own forces.
  - [x] Include owner/party information on every unit and building in the LLM game state updates.
  - [x] Allow LLM-locked units to retaliate against attackers and auto-target enemies in range while still following strategic orders.
  - [x] Skip LLM commentary on boring ticks (no combat/production events) and prevent commentary repetition by tracking recent messages.
  - [x] Add notification history panel with bell icon badge in top-right corner, scrollable reverse-chronological list, unread count, and clear/close actions.
  - [x] Show enemy strategic backlog on any selected enemy building with LLM strategic intent, production plan, and unit/sell/repair commands.
  - [x] Ensure LLM is aware of money supply mechanics (harvester + refinery income loop) in bootstrap prompt.
  - [x] Add sell_building and repair_building actions to LLM schema and applier.
  - [x] Add base defense avoidance tactical guidance to LLM bootstrap prompt.
  - [x] Enforce tech tree availability in LLM applier (reject out-of-order builds with TECH_TREE_LOCKED).
  - [x] Fix LLM-locked enemy units not firing at targets (set allowedToAttack, auto-target buildings).
  - [x] Make LLM respond with strategic commands on the very first POST request instead of waiting for next GET tick (bootstrap prompt instructs immediate economy build order).
  - [x] Skip LLM API calls when no API key is configured for providers that need one.
  - [x] Remove API key input for Ollama (local provider, no key needed).
  - [x] Add per-party LLM toggle in multiplayer sidebar to switch between LLM AI and local AI per party.
  - [x] Add building placement proximity rule to LLM bootstrap prompt (3-tile Chebyshev distance).
  - [x] Add rejected/accepted action logging for LLM applier debugging.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [ ] **Danger Zone Map Feature (aka DZM)** — Let each enemy AI create a DZM where for each tile the damage per second is calculated based on the defence buildings of all non friendly other players on the map (including human and ai players). For each tile the damage per second will be calculated by checking which non allied defence buildings are in range and how much damage they could make based on their firing rate and damage per shot (also take burst shots into account). Whenever a new defence building is added to the map update that DZM. Ensure not to make this updates on a frame base in the game loop. Only do updates event based when new defence buildings get added or destroyed/sold. Also ensure this map is generated whenever a game is loaded (do not persist the DZM itself in save games). the DZM for each player can be show as an overlay on the map when pressing the z key. first time z key is pressed the DZM for the user player is shown. 2nd time the z key is pressed the DZM for the next player is shown and so on until all players were looped. Then it will hide the DZM overlay. Next time it will again start from user player DZM and so on.
  - The DZM overlay will look like a height map overlay with red 1px width lines that have 50% opacity. The closer the lines are together the higher the gradient is at this tile. Ensure to put the DZM overlay renderer into a separate new file. the DZM will be rendered on the map tiles but below buildings, units and HUD. When DZM overlay is active show in top right corner which player's (player red, yellow, green, blue) DZM is visible.
  - Spec: none

- [ ] **Implement an allies system so that the player can ask an enemy** — to become an allie by clicking at thier base building and click the "unite" button that will appear when the diplomacy level between both parties reached 100%. The diplomacy level "DL" will level is a value that is hold for each party to each party. So party A can have another DL to B than B to A. When A attacks the enemy of B then DL for A raises on B. If A attacks B or an allie of B then the B's DL of A falls. When player clicks a base building then the DL of the party will be shown for each other party on the map with another "loading" bar below the health bar with the title "Diplomacy". The color of each bar indicates to which party it relaes to (each parties color).
  - Spec: none

- [ ] **Ensure for each party P there is an internal statistic that tracks** — for each other party how much economical damage was made by adding the cost of the units and buildings destroyed by that specific party. Make sure there is a shortkey that toggles the display of that statistics during gameplay. Each enemy AI focusses on attacking the party that caused the most amount of economical harm to them so far.
  - Spec: none

- [ ] **Enemy AI builds**
  - Part of: Spec 008 Add Ammunition Factory & Supply Truck
  - [x] ammunition factories
  - [x] produces supply trucks
  - [ ] and manages unit resupply automatically
  - Spec: [Ammunition Factory & Supply Truck System](../specs/008-ammunition-system/spec.md)

- [ ] **Add fog-of-war-safe, token-budgeted strategic state tool calls by region/entity/player/objective/revision.**
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [ ] **add support for up to 3 optional LLM players (could also be** — steered by different models or all by the same to safe requests (make it configurable))
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

## Multiplayer and Networking

- [ ] **For the initial webRTC connection setup use a small express server that provides STUN services to connect peers**
  - Part of: Add online multiplayer support where humans can join
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

## Audio and Voice

- [ ] **Add a sound for when party A attacks party B for the first time.**
  - Spec: none

## Missions and Campaign

- [ ] **Add an interactive tutorial system that demonstrates UI/UX actions with a tutorial** — cursor, speech narration, skip controls, restart control, and persistent settings (show tutorial + voice). Include steps for building the starter economy, unit selection/movement, tank production/rally points, remote control, combat goals, and tech tree explanations for tanker/gas station, ambulance/hospital/crew, ammo factory/ammo truck, and workshop/recovery tank.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

## Tooling and CI

- [ ] **Add `skills.md` OpenAI image generator setup for Codex workflows, including 4 prompt** — templates (unit sidebar/map + building sidebar/map).
  - Spec: [OpenAI Image Generator Skills File](../specs/043-openai-image-generator-skills.md)

- [ ] **Integrate E2E tests into CI/Netlify pipelines for merge gating**
  - Part of: ✅ Playwright E2E Testing
  - Spec: [Playwright E2E Testing Framework](../specs/027-playwright-e2e-testing.md)

## Done

Completed entries stay here so the detail is not dropped. Do not add new work in this section.

### Input and Controls

- [x] **Gamepad and couch co-op (2026-09-25)** — Settings lists every button, axis, and trigger of up to two controllers with live meters and click-to-bind. Each controller keeps its own saved profiles. Player 1 drives the cursor; player 2 remote-controls another unit of the same party, including off screen, and the camera eases between that unit and player 1. Controller commands reuse the mouse, keyboard, and remote-control paths so lockstep stays in sync.
  - Spec: [Gamepad and Controller Support](../specs/092-gamepad-controller-support.md)

- [x] **Player profiles for controllers (2026-09-25)** — A player profile stores one person's standard-button layout and can be chosen separately for P1 and P2. A controller-type profile overrides only controls that have no standard equivalent. Resolution is player, then controller type, then that controller's profile, then the slot defaults.
  - Spec: [Gamepad and Controller Support](../specs/092-gamepad-controller-support.md)

- [x] **Stick deadzones, vibration, and controller-type suggestion (2026-09-25)** — Each player profile stores a left and right stick deadzone, with a live preview in the mapping menu. A remote-controlled unit firing or taking damage, and menu navigation, can pulse the pad when the browser supports vibration, with an on/off switch and intensity. Connecting a pad suggests its Xbox, PlayStation, or generic type layout and does not replace an explicitly chosen player profile.
  - Spec: [Gamepad and Controller Support](../specs/092-gamepad-controller-support.md)

- [x] **Standard gamepad defaults (2026-09-25)** — Every controller command has a Standard Gamepad binding. The left trigger toggles remote control: the left stick drives and the right stick turns the turret, and otherwise those sticks are the cursor and the map. Start pauses. The mapping menu lists the layout that Reset restores.
  - Spec: [Gamepad and Controller Support](../specs/092-gamepad-controller-support.md)

- [x] **Controller settings layout (2026-09-25)** — The Controllers tab stacks on a narrow dialog and uses two columns only when the dialog is wide enough. Player profiles, live inputs with deadzones, the command list, and the standard-layout table no longer overlap. Settings tabs scroll in the modal body only, and app scrollbars use a slim themed thumb.
  - Spec: [Gamepad and Controller Support](../specs/092-gamepad-controller-support.md)

- [x] **Controller menu column and chip polish (2026-09-25)** — The two-column cards size to their content. The standard-layout table uses content-sized columns. A long controller id stays on one line in the slot chip, with the full name in the tooltip.
  - Spec: [Gamepad and Controller Support](../specs/092-gamepad-controller-support.md)

- [x] **Gamepad cursor, toggle, and scroll (2026-09-25)** — The gamepad crosshair shares the circle's center. Stick axes in settings show signed deflection. Left trigger toggles remote control of the selected units and shows an on-screen chip until they are gone. Gamepad map scroll has its own speed, and the cursor scrolls the map inside a 20px screen margin.
  - Spec: [Gamepad and Controller Support](../specs/092-gamepad-controller-support.md)

- [x] **Gamepad player overlay only while connected (2026-09-25)** — The in-game P1 / P2 lights stay hidden until a controller connects. One pad shows only P1. Two pads show P1 and P2. Disconnecting a pad removes that chip, and with none connected the overlay is gone. The Controllers tab still shows slot status.
  - Spec: [Gamepad and Controller Support](../specs/092-gamepad-controller-support.md)

### Rendering and WebGPU

- [x] **WebGPU terrain shader and performance overlay (2026-09-24)** — Sample both atlases before any per-fragment branch so `textureSample` stays in uniform control flow. When WebGPU still fails, log one `[WebGPU]` validation line and show a short reason in settings. The performance widget shows the active backend, fallback reason, adapter, canvas resolution, draw calls, timestamp-query GPU time when available, `maxBufferSize` as VRAM, and tracked buffer/texture bytes in use.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **WebGPU default terrain renderer (2026-09-24)** — Fresh profiles and legacy implicit `webgl` graphics records use WebGPU when an adapter and device can be created, and WebGL otherwise. An explicit WebGL or WebGPU settings choice is stored as `rendererBackendChoice` and kept. Legacy stored `webgpu` stays explicit because that value was never the old default.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Generic sprite-sheet destruction VFX (2026-04-14)** — parse tile/grid/frame metadata from animation filenames (`<tileW>x<tileH>_<cols>x<rows>_*.webp`), add reusable time-based sprite-sheet animation rendering with additive blending, and trigger one centered one-shot explosion animation for destroyed units/buildings/factories.
  - Spec: none

- [x] **Add some some animations for the cooling towers of the refinery and** — the power plant. Make sure to analyse the map image assets to determine the center fore the each somke animation. Make sure to add some wind effect for the direction of the smoke animation. Reuse when possible the somke animations from the tank when it is damaged or use utility functions for both.
  - Spec: none

- [x] **Add some smoke animation on the back of tanks when they are below 25% health.**
  - Spec: none

### Terrain and Map Generation

- [x] **Street sprite-sheet v24 routing follow-up (2026-04-26)** — replaced retired street-sheet defaults with `streets24_q90_1024x1024`, tightened street sprite selection to exact directional-tag matches, and made `full` street tiles dominant for diagonal corner clusters.
  - Spec: [Street sprite-sheet routing (streets24 default)](../specs/051-street-sheet-routing.md)

- [x] **Street-coast WebGL land-SOT gating follow-up (2026-04-24)** — restored general WebGL land SOT overlays for non-street scenarios (inverse-island/parity tests) while selectively skipping only street-adjacent water land-SOT overlays so CPU biome-sampled wedges own street coastline smoothing.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **Street-coast SOT source-tile stabilization (2026-04-24)** — land SOT wedges rendered on water now sample neighboring land/street tile coordinates (instead of water-tile random land variation), preventing gray/impassable wedge artifacts; GPU path now leaves non-water SOT overlays to CPU for parity with this biome-accurate sampling.
  - Spec: none

- [x] **Street-water SOT directionality correction (2026-04-24)** — disabled all street-hosted SOT again and added water-tile land-SOT corners (triggered near street coastlines) so ground underlay cuts into water rather than water cutting street overlays.
  - Spec: none

- [x] **Street-water coastline SOT texture routing follow-up (2026-04-24)** — street tiles at water corners now emit biome/land SOT (not street texture SOT) so smoothing along street coastlines uses grass/selected biome underlay visuals instead of any street texture.
  - Spec: [Street sprite-sheet routing (streets24 default)](../specs/051-street-sheet-routing.md)

- [x] **Street SOT artifact + coastline smoothing follow-up (2026-04-24)** — removed street-type SOT generation entirely (eliminates gray old-street SOT triangles), while restoring water SOT rendering on street-hosted tiles so coastline smoothing still applies to biome underlay beneath street overlays.
  - Spec: none

- [x] **Street rendering GPU-path parity follow-up (2026-04-24)** — when GPU terrain base is active, CPU overlay pass now repaints street tiles through the tagged street-sheet pipeline so street-sheet tiles appear even with `Custom sprite sheets` off, while keeping street-hosted SOT fully suppressed.
  - Spec: none

- [x] **Street rendering follow-up hardening (2026-04-23)** — fully suppress street-hosted SOT in all render paths (including WebGL water-only overlays), always draw biome underlay beneath sprite-sheet street overlays (integrated biome when enabled, grass fallback when disabled), and keep tagged street rendering active even when `Custom sprite sheets` is unchecked.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Street-sheet tag-driven rendering + street SOT suppression (2026-04-23)** — added the bundled street sprite sheet to default SSE sheet lists/selectors, made street tile rendering resolve `street` + directional (`top`/`bottom`/`left`/`right`) tags from valid street neighbors with best-match scoring and biome-aware preference (`grass`/`soil`/`snow`/`sand`), and disabled SOT overlay rendering on street-hosted tiles.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **SSE JSON tag import + reset-all tags action (2026-04-20)** — SSE now accepts dropped `.json` metadata files (same format as `Apply tags` export) and applies tag data immediately to the currently loaded sheet with instant tag-list/canvas/runtime updates; added `Reset all tags` button to clear all tile-tag assignments on current sheet.
  - Spec: none

- [x] **SSE group-tag UX cleanup (2026-04-20)** — group paint now writes only `group_X` tags (no redundant plain `group` tile tag), single-click with Group selected removes existing group tags, and group creation requires drag coverage of at least 2 tiles.
  - Spec: none

- [x] **SSE grouped-tile exclusivity hardening (2026-04-20)** — tiles tagged with `group`/`group_X` are now excluded from non-group candidate buckets so grouped art can only render as its full declared rectangle, never as 1x1/non-group fallback or smaller implicit groupings.
  - Spec: none

- [x] **SSE rectangular tile-group tagging + grouped runtime rendering (2026-04-19)** — added `group` tag workflow with auto-incrementing `group_X` ids, manual `group id` input, rectangle-only drag assignment, grouped rock/decorative integrated selection, and debris footprint-aware grouped decal lookup with 1x1 fallback.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **SSE sidebar converter relocation + floating input parity (2026-04-18)** — moved the SSE image converter accordion from the main game sidebar into the Sprite Sheet Editor sidebar directly above the Tile size control, and updated SSE text/number controls to use the same floating-label input treatment as integrated game-sidebar inputs.
  - Spec: none

- [x] **SSE uploaded-sheet checklist filename labeling (2026-04-19)** — when on-the-fly uploaded sheets are applied, Map Settings now shows their human filename label (from SSE upload metadata) instead of raw blob/data URL text in the enabled/disabled sprite-sheet checklist.
  - Spec: none

- [x] **SSE uploaded-sheet render parity + full rerender toggle (2026-04-19)** — integrated runtime now keeps applied tagged metadata for on-the-fly uploaded static sheets (including blob/data paths), texture loading now accepts direct blob/data URLs without slash-prefix corruption, and each sprite-sheet checklist toggle forces full terrain chunk invalidation with SOT-mask recomputation so map rendering updates immediately.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **SSE uploaded-sheet runtime selection parity (2026-04-18)** — newly applied non-default/on-the-fly static sheets now auto-appear in the Map Settings `sprite sheets to use` checklist, remain eligible in the selected-sheet set, and are included in integrated runtime composition based on their applied tags.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **SSE sidebar image converter (2026-04-18)** — added a bottom-of-sidebar expandable section with drag/drop local image conversion to WEBP, default 90% compression + 1024x1024 target size, editable compression/width/height numeric controls (resolution capped at 2048), optional `_qXX_WIDTHxHEIGHT` filename suffix toggle, and immediate download after conversion.
  - Spec: [SSE sidebar image converter](../specs/064-sse-sidebar-image-converter.md)

- [x] **Harvester crystal-density economy + XP stars (2026-04-19)** — introduced 5 ore density levels with value scaling, density-aware harvesting gates by harvester stars, star-based harvester upgrades (capacity/armor/speed), density-aware ore depletion visuals, deterministic seed-crystal density assignment, and 4-neighbor ore spread density growth rules.
  - Spec: [Harvesting density + harvester XP progression](../specs/050-harvesting-density-xp.md)

- [x] **SSE coastline underlay cutout fix (2026-04-16)** — in the no-water custom-sheet fallback, land/street tiles with `type: water` SOT now cut out that triangle on the top canvas instead of painting over it, so the underlying GPU procedural-water shoreline renders exactly like the normal non-custom path.
  - Spec: none

- [x] **SSE procedural water SOT shader parity fix (2026-04-16)** — in the no-water custom-sheet fallback, coastline `type: water` SOT now comes from the WebGL water-only path instead of the 2D procedural-water painter, so edge triangles match the surrounding procedural water.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **SSE coastline SOT restoration (2026-04-16)** — in the no-water procedural fallback, suppress only water-hosted SOT masks while preserving land/street-hosted `type: water` coastline smoothing so coast edges still render correctly with custom sheets enabled.
  - Spec: none

- [x] **SSE base-layer water SOT suppression fix (2026-04-16)** — propagated `skipWaterSot` through the active 2D base-layer fallback path and skip any SOT that would render into water there, so custom sheets without tagged water no longer paint masked triangles over procedural GPU water.
  - Spec: none

- [x] **SSE GPU water-only fallback cleanup (2026-04-16)** — the WebGL water-only path now skips clipped water-SOT triangle instances entirely, so custom sheets without tagged water show only pure procedural water instead of polygon artifacts.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)

- [x] **SSE no-water procedural-only fallback follow-up (2026-04-16)** — when custom sheets are enabled without tagged water tiles, the top 2D pass now skips both water base tiles and water SOT overlays so only the GPU procedural water remains visible.
  - Spec: none

- [x] **SSE custom-water SOT follow-up (2026-04-16)** — when SSE water tiles exist, water corner overlays now use clipped custom water tiles instead of procedural water, so integrated mode no longer mixes procedural triangles into custom water rendering.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **SSE water renderer path follow-up (2026-04-16)** — stop switching integrated mode back to full legacy GPU terrain when SSE water tags exist, and in no-water fallback leave top-canvas water tiles transparent so the legacy GPU procedural water can show through underneath.
  - Spec: none

- [x] **Map Settings sprite-sheet selection list (2026-04-17)** — under `Custom sprite sheets`, Map Settings now shows a checkable list of all available static sheets (max-height five rows) so only checked sheets feed integrated tile rendering.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **SSE water SOT follow-up (2026-04-16)** — keep coastline smoothing enabled when custom sheets use GPU water-only fallback, so procedural water matches the non-custom appearance instead of showing hard tile edges.
  - Spec: none

- [x] **SSE rock underlay + GPU water fallback follow-up (2026-04-16)** — render integrated rock tiles over land so black-key transparency reveals terrain, widen near-black chroma-key removal for compressed sheets, and keep the legacy GPU procedural-water look when custom sheets are enabled without tagged water tiles.
  - Spec: none

- [x] **SSE blend-mode follow-up (2026-04-16)** — added `black`/`alpha` transparency selection to SSE metadata and runtime rendering, renamed the Map Settings toggle to `Custom sprite sheets`, and preserved procedural-water fallback when custom sheets provide no water-tagged tiles.
  - Spec: none

- [x] **SSE toggle-all + map-aura parity fix (2026-04-15)** — turned "apply current tag to all tiles" into apply/remove toggle behavior based on current coverage, and aligned map explosion blending with SSE preview by disabling smoothing for additive sprite-sheet draws to remove dark halo artifacts.
  - Spec: none

- [x] **SSE preview background + drop-upload follow-up (2026-04-15)** — added preview `Background` toggle beside `Loop`, fixed info-bubble popover layering above workspace, enforced preview panel `display: none` on Static mode, and added drag-drop image upload into SSE canvas with temporary in-browser sheet selection for both Static/Animated tabs.
  - Spec: none

- [x] **SSE static-preview+row-height follow-up (2026-04-15)** — enforced hidden preview canvas on Static tab and added independent row-height input so sprite-sheet rows can be configured separately from tile width.
  - Spec: none

- [x] **SSE Version B animated tab integration (2026-04-15)** — added Static/Animated tabs to Sprite Sheet Editor, animation-sheet source selector from `public/images/map/animations`, per-tag frame-sequence numbering overlay, in-sidebar play/pause+loop preview that follows selected tag, and apply-to-runtime animation metadata used instantly for destruction VFX.
  - Spec: none

- [x] **Terrain layering follow-up** — rocks are generated first and water is applied afterward so rivers/lakes/coasts dominate and break rock lines at intersections.
  - Spec: none

- [x] **Map generation terrain controls follow-up** — water/rock percentages now generate line-based terrain (no random scatter), coast water scales inward/outward with water%, and water+rock are auto-balanced to a hard 50% combined cap.
  - Spec: [Map Generation Terrain Controls (Water/Rock %, Shores, Center Lake)](../specs/057-map-generation-terrain-controls.md)

- [x] **Extend Map Settings map generation controls with water % and rock %** — inputs plus shore toggles (north/west/east/south) and big-center-lake toggle, while guaranteeing all base spawns remain on land and every base is land-reachable from every other base.
  - Spec: none

- [x] **Add persisted Graphics settings for water rendering** — procedural/classic toggle plus procedural tone and saturation controls in the settings modal and runtime config, with defaults of +35% tone and 40% saturation.
  - Spec: none

- [x] **Add Sprite Sheet Editor (SSE) modal under Map Settings with tag-paint workflow,** — per-sheet metadata JSON apply/export, and integrated sprite-sheet map rendering mode toggle.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Extend SSE with zoom controls (in/out/100%/snap), apply-current-tag-to-all action, and resizable/maximizable modal UX.**
  - Spec: none

- [x] **Refine SSE to fullscreen-only edge-to-edge layout with no top bar, default snap-to-canvas** — fit, functional zoom controls, and right-click drag inertia panning (no native scrollbars).
  - Spec: none

- [x] **Refine SSE so red overlay follows active tag selection only, and apply** — action immediately loads generated JSON into runtime memory for next map reload/regeneration.
  - Spec: none

- [x] **Refine SSE label behavior so labels (if enabled) stay visible for all** — tagged tiles while only red overlay is filtered by active tag.
  - Spec: none

- [x] **Add Map Settings SSE biome dropdown (soil/sand/grass/snow) to control integrated land-tile biome tag preference.**
  - Spec: none

- [x] **Add SSE checkbox to toggle red tag overlay visibility in the editor canvas.**
  - Spec: none

- [x] **SSE mobile sidebar swipe parity (2026-04-20)** — in the Sprite Sheet Editor modal on mobile, sidebar now swipes left to hide, can be reopened via left-edge swipe or bottom-left menu toggle button, and the spritesheet workspace expands when hidden.
  - Spec: none

- [x] **8.2 it now runs at reduced mobility** — base speed 0.175 (65% slower) with a 4.0x street multiplier
  - Spec: none

- [x] **Introduce a new seed crystal that cannot be harvested and has 2x** — the spreading rate but only spreads normal blue crystals. Use the ore1_red.webp image asset for it. Make sure during map generation those seed crysals (1-3 of them) are always in the center of an ore filed.
  - Spec: [Crystal terrain slowdown](../specs/020-ground-crystal-slowdown.md)

- [x] **Add corner smoothening rendering algorithm to the map renderer where the corners** — of streets get cut smoothly to form straight diagonal lines. Smoothening Overlay Textures (SOT) use the street texture, work in all diagonal orientations, apply only on grass tiles, render above streets but below rocks, ore and buildings, and expand slightly to hide single-pixel gaps.
  - Add corner smoothening rendering algorithm to the map renderer where the corners of streets get cut smoothly to form straight diagonal lines. Smoothening Overlay Textures (SOT) use the street texture, work in all diagonal orientations, apply only on land tiles, render above streets but below rocks, ore and buildings, and expand slightly to hide single-pixel gaps.
  - Spec: none

- [x] **Spec 007 Support up to 4 parties in a game. Each player** — starts in one corner. One party can be played by human player. The others by AI (or later via network by ohter humans -> keep the interface abstract to upport AI and other humans). Define a set of 4 Colors that can identify each party. Add a number input to the end of the sidebar to define the number of players (label: "Players") on the map. Whenever the map is newly generated it will affect the map creation but not instantly. Make sure each AI player is attacking any player on the map (there is no teams feature yet, will come later). Make sure the map creation process is influenced by the number of players (regarding the direction of streets and ore spots)
  - Spec: [Multi-Player & AI System](../specs/007-multi-player-ai-system/spec.md)

- [x] **Keep cargo under ordinary pathfinding until it reaches its assigned shoreline slot,** — then rotate it toward the stern before the visible boarding tween and lock commands during transfer.
  - Spec: none

- [x] **Place Start Money beside the SSE biome selector on a dedicated two-column, 50/50 map-settings row.**
  - Spec: none

- [x] **Push a rotated large-ship hull back into clear water using a bounded** — shoreline-overlap correction that only searches when the oriented hull probe intersects land.
  - Spec: none

- [x] **Add seamless biome base-ground materials for legacy non-custom terrain rendering** — convert meadow source to quality-85 WebP, add soil/snow/sand sources, and route the Map Settings biome choice to the selected ground material without baking structures into the base tile (2026-09-14).
  - Spec: [Terrain source WebP conversion](../specs/082-terrain-source-webp.md)

- [x] **Terrain visual follow-up (2026-09-14)** — keep grass on the original meadow material, remove the overly green alternate grass asset, and replace soil with a muted olive-brown aerial ground texture matching the supplied reference.
  - Spec: none

- [x] **Mixed-biome intersection follow-up (2026-09-15)** — replaced multi-tile distance-band fades with a single deterministic edge tile and feathered curved mask; shoreline sand now uses the same one-tile feather to prevent chained checkerboards.
  - Spec: none

- [x] **Mixed-biome coastline direction follow-up (2026-09-15)** — orient the single shoreline sand feather toward the nearest ocean tile so north/south and east/west coasts use perpendicular transition masks.
  - Spec: none

- [x] **Mixed-biome shoreline width and plateau priority (2026-09-15)** — expose shoreline width in tiles and ensure plateau snow overrides nearby shoreline sand.
  - Spec: none

- [x] **Organic water shoreline transitions (2026-09-15)** — replace legacy grass-only coast lips with masked water-over-land fades for coasts, lakes, and diagonal SOT corners.
  - Spec: none

- [x] **Dynamic shoreline blend controls (2026-09-15)** — add optional animated water-over-land rendering, configurable transition feather pixels, and two-control Map Settings rows with floating select labels.
  - Spec: none

- [x] **Shoreline water/land layering correction (2026-09-15)** — keep procedural water and water SOT tiles beneath land-material shoreline transitions, including water-hosted land/street SOT corners, so all visible shoreline animation comes from the continuous water layer.
  - Spec: [Shoreline water/land layering](../specs/081-shoreline-water-land-layering.md)

- [x] **Shoreline SOT material and seam follow-up (2026-09-15)** — render diagonal land/street SOTs above cardinal water feathers with alpha gradients, preserve street material on street-over-water corners, and keep horizontal-to-diagonal-to-vertical shoreline transitions connected.
  - Spec: none

- [x] **Shoreline SOT ownership correction (2026-09-15)** — remove land underlays from every water-adjacent street tile, place procedural water beneath transparent street art, route mixed street/land water corners to street SOT, and suppress cardinal blend overlap on diagonal SOT cells so the feather remains perpendicular and seam-free.
  - Spec: none

### Units and Combat

- [x] **Mobile/desktop guard-mode parity (2026-03-25)** — tapping/clicking friendly units with selected combat units now activates guard mode without Cmd, guard cursor appears on friendly hover, selected guarding units show guard icon above guarded targets, and AGF drag over mixed enemy/friendly units attacks enemies first while activating guard mode for enclosed friendlies.
  - Spec: none

- [x] **Add cheat code `xp [amount]`, `xp +[amount]`, and `xp -[amount]` to set** — or adjust experience for all selected combat units.
  - Spec: none

- [x] **Implement articulated howitzer gun using the tankV1 barrel asset with ballistic elevation,** — directional muzzle flash, stronger recoil, and movement/firing lockouts while the barrel adjusts.
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Rotate the shared howitzer barrel sprite by 180° and realign recoil/muzzle effects** — so the muzzle matches the wagon's facing.
  - Spec: [Howitzer Artillery Gun Animation & Control](../specs/009-howitzer-artillery-system/spec.md)

- [x] **Ensure ammunition trucks leave no wrecks on destruction and detonate with scattered** — munitions that threaten all nearby units and buildings.
  - Spec: none

- [x] **Spec 004 Add remote control feature (aka RCF) for tanks**
  - [x] ✅ when one or multiple tank(s) are selected the user can
  - [x] ✅ move it forwards by holding the arrow up key
  - [x] ✅ move it backwards by holding the arrow down key
  - [x] ✅ turn the wagon left by holding the left key
  - [x] ✅ turn the wagon right by holding the right key
  - [x] ✅ fire forwards by pressing the space key. Then the tank aims at the farthest point within range.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **3.1 driver (top left blue) if dead tank cannot move wagon anymore** — but can still rotate the turret and fire at targets within range
  - Spec: none

- [x] **3.2 gunner (top right red) if dead tank cannot rotate the turret** — anymore but the tank can still fire at a target by rotating the entire wagon until gun points at target (might look funny)
  - Spec: none

- [x] **3.3 loader (bottom left yellow) if dead tank cannot fire anymore at all**
  - Spec: none

- [x] **3.4 commander (bottom right green) if dead tank cannot be moved anymore** — by the user => it will only operate own and only defend itself or move back to base or complete it path when it was added before the commander died. Prio is as follows then: first defend yourself then continue path/waypoints if there is one then go back to base ideally directly to repair if there is a workshop.
  - Spec: none

- [x] **4) when the tank goes to the 3 tiles in below the** — hospital dead people will fill up again. One person will take 10s to be restored and costs 100.
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **5) when a tank gets hit the likelyhood for each individual crew member to be killed is 15%.**
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Add a unit repair building to the buildings menu. It costs 3000$** — and has 3 times the armor of a tank. Any unit can be directed to move there when selected and player clicks on the building. Then the unit will move to any surrounding tile and stays there. As long as the unit is close to the repair building it will get repaired (restore healthbar) gradually 2% every second.
  - Spec: none

- [x] **Add artillery unit with 100% more range than tank and a radius** — of 3 tiles damage area around the impact. The accuracy is only 25% of hitting the target tile directly but 100% of hitting any tile in the radius of 3 tiles around the targetted tile.
  - Spec: none

- [x] **Spec 004 Add guard mode feature (GMF) for combat units. When guard** — mode is active and the unit is selected and the player clicks on a friendly unit the guarding unit will follow that unit and attack any incoming enemy in range without following the enemy but only following the unit to guard. Guard mode can be activated when a unit is selected and the cmd key is hold and then the unit to be guarded it selected by left click. As soon as the cmd key is pressed while a unit is selected the cursor turns into the "gurad.svg" cursor.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **Make sure there is some 2px yellow levelup progress indicator inside the** — health bar on top of it in the same box overlaying it so I can see the progress up to the next level when unit is in combat. When next level is reached it starts again from 0.
  - Spec: none

- [x] **Spec 006 Change tank rendering to support tank image assets consisting of** — 3 images with transparency to render one tank dynamically. (1) the tank wagon (tank_wagon.png) with the mounting point 32x60y in pixels from top left to mount the turret's center. The image asset for turret is named "turret_no_barrel.png". It has a mounting point for the gun barrel at 32x,68y pixels from top left. The gun barrel rotates with the turret in sync. The turret can rotate on the wagon. When the tank fires the gun barrel moves (dampened movement) up to 5 pixels to the top (reduces y coord) to indicate a recoil. Basically use the same mechanism like before but with image assets instead. Make sure to cache the images to make the rendering of hundreds of tank performant. Also shift the muzzle flash to coords 2x, 64y based on the gun barrel image. The rotation of all 3 image assets is aligned by default within the assets (they all point south).
  - [x] ✅ Make sure to implement this as an alternative rendering method to the existing non image based tank rendering so it can be toggled on and off during combat by the user (use some keyboard shortcut). Make sure to put the image based rendering in at least one separate file to have the code separated from the previous tank rendering. If possible use code fragments from the previous rendering technique or at least make sure there is not too much code redundancy.
  - [x] ✅ (1) Make the mounting points I described configurable by some json file so I can tweek them if needed.
  - [x] ✅ (2) Do not change the aspect ratio of the 3 images!
  - [x] ✅ (3) when the wagon rotates the turret should also rotate in the same way BUT only if the turret is aiming at some thing then it will rotate independently from the wagon to keep aiming at the target.
  - [x] ✅ (4) The orientation of the wagon is by default in the image asset facing down (to bottom). Same for the gun barrel and the turret. Make sure that the driving direction in the game is aligned with the facing of the wagon. If tank drives from top to bottom then the wagon should face also to the bottom.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

### Naval

- [x] **Naval unit audio (2026-09-23)** — positional submarine surface/dive and torpedo sounds, battleship cruise and hovercraft movement loops, random battleship gunfire, a shared sinking sound, and stackable narrator lines when the local player's battleship, submarine, carrier, hovercraft, or other ships are attacked.
  - Spec: [Naval unit audio](../specs/088-naval-unit-audio.md)

- [x] **Battleship turret visual hierarchy (2026-07-26)** — render all four turret housing/barrel assemblies 30% smaller and draw both inner mounts after their outer counterparts so the inner turrets overlap on top and read as higher-mounted.
  - Spec: none

- [x] **Battleship layered broadside follow-up (2026-07-25)** — split the map sprite into a turretless hull, independent turret housings, and independently recoiling barrels; rotate each turret toward its assigned target; turn the hull side-on for hull-issued broadsides; enforce tower-blocked firing arcs; sequence barrels/turrets at 300ms/1s with an 8s ship reload; expose destroyed turret wells; increase range 50%; add four equally likely directional sinking modes; and allow surface ships to attack land while submarines can attack only naval targets and partly-water buildings such as the Shipyard.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Battleship four-turret follow-up (2026-07-25)** — replaced map/sidebar art with matching four-turret twin-barrel imagery; made all four mounts independently selectable and targetable; disable one deterministic-random remaining turret below each 80/60/40/20% HP threshold with a turret-local explosion and restore disabled turrets in reverse order as HP is repaired; persist/synchronize/replay turret state and commands.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Add shoreline-only Shipyard building that requires Radar Station and Vehicle Factory, uses** — the provided map/sidebar assets, and launches naval units from adjacent water. Shipyard and Destroyer are implemented. Spec 073 and the later done naval entries cover this request.
  - Add the first naval unit, Destroyer, with water-only movement, reusable naval pathing helpers, fuel/ammo/crew/health/cost stats, rotated map visuals, wake trails while moving, and anti-ground/naval plus anti-air combat behavior.
  - Add new-unit and ship-unit implementation checklist skill files for future agent guidance.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Refine Shipyard/Destroyer integration** — require a 50/50 land-water footprint, add eight transparent directional ship assets, complete water-domain command/path/cache/collision handling, render a water-only three-tile Shipyard service zone with per-resource infrastructure prerequisites, move V-wakes below ships with stop fading, disable Shipyard smoke, and add Destroyer range/distance aiming feedback.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Replace the schematic Supply Ship sidebar and map art with photorealistic military** — replenishment-ship assets matching the Destroyer's build-button and map-image styles, converted to optimized 512x512 and transparent 256x256 WebP files.
  - Spec: [Supply Ship](../specs/074-supply-ship/spec.md)

- [x] **Naval follow-up** — swap Supply Ship asset perspectives (three-quarter sidebar over water with second-quarter horizon; strict top-down south-facing transparent map sprite), keep guarding Supply Ships inside support range, split the donut supply quarter into equal ammo/fuel/repair arcs, show selected supply radius, add 67% bow-first and 33% corrected split-hull sinking animations, halve Destroyer HP to 250, rotate its (55,260) gun origin, widen bow wakes to 70 degrees, and consolidate Destroyer art to the parent-level south sprite.
  - Spec: [Supply Ship](../specs/074-supply-ship/spec.md)

- [x] **Replace the Destroyer build-button art with a photorealistic elevated three-quarter sea view** — matching the Supply Ship sidebar convention, including a horizon in the second quarter from the top and optimized 512x512 WebP output.
  - Spec: [Supply Ship](../specs/074-supply-ship/spec.md)

- [x] **Naval direct-command priority/disembark follow-up (2026-07-20)** — direct friendly-unit clicks must trigger transport boarding or carrier recovery before ordinary selection/guard behavior, while group guard remains an AGF-box interaction; land clicks with a loaded transport must approach the coast, unload safely, and order cargo onward to the clicked land destination.
  - Spec: [Building Selection Should Not Issue Move Commands](../specs/046-building-selection-no-move-command.md)

- [x] **Cluster A — finish ferry shoreline operations as one state machine** — stop/jitter fix, stern alignment, sequential visible cargo tweening, and movement lock.
  - Spec: none

- [x] **Cluster B — finish carrier deck operations as continuous eased approach, roll,** — taxi, parking, launch-taxi, and takeoff phases.
  - Spec: none

- [x] **Cluster C — finish naval motion as eased translation/rotation plus quadtree-backed oriented hull/shore collision.**
  - Spec: none

- [x] **Cluster D — finish enemy naval behavior as persisted 50/50 force preference,** — active assault targeting, and supply-ship/Shipyard recovery logistics.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Render all non-submarine naval units 50% larger.**
  - Spec: none

- [x] **Show a move-into cursor when a selected loaded ferry hovers over valid land for disembark.**
  - Spec: none

- [x] **Add smooth ferry embark/disembark alignment and visible cargo ramp movement animation before units load/unload.**
  - Spec: none

- [x] **Add smoother carrier landing/takeoff deck animations for jets without rapid position changes.**
  - Spec: none

- [x] **Add AI naval assault behavior so enemy-built ships actively attack human targets and retaliate against valid attackers.**
  - Spec: none

- [x] **Add per-enemy 50/50 naval-first versus air-force-first strategy preference.**
  - Spec: none

- [x] **Add high-performance naval image-footprint collision against ships and shoreline.**
  - Spec: none

- [x] **Route ferries/hovercraft and cargo to one coastal land rendezvous, align the rendered** — hull stern exactly to the land/water boundary, and begin boarding only after alignment.
  - Spec: none

- [x] **Add forward/reverse, inertial steering, and forward Space firing to direct control for** — every naval unit, with weapons limited to armed ship types.
  - Spec: none

- [x] **Match remotely controlled ship top speed to autonomous naval top speed for every ship class.**
  - Spec: none

### Air and Jets

- [x] **Jet fuel, emergency landing, and recovery-tank tow (2026-09-19)** — F22 and F35 return home with enough fuel for the inbound leg, refuse takeoff or attack orders that cannot complete a round trip, emergency-land with the existing landing animation plus a notification if they still run dry, accept tanker refill while grounded, and must be towed onto a street by a recovery tank before they can take off again. S releases any mounted unit, not only jets. Merged with the completed jet-fuel work. Spec 080 and src/game/jetFuel.js describe the shipped behavior, and a matching done entry already existed.
  - Spec: [Unit Under-Attack Focus Notification](../specs/045-unit-under-attack-focus-notification.md)

- [x] **Full base test save (2026-09-24)** — locked builtin save "Full Base Test" in the Save Games list. The local player starts with one of every unit and building, extra power plants so the base is not power-starved, a coastal shipyard, and an airstrip. The enemy has only a construction yard. Mission 01 stays locked and listed first.
  - Spec: [Full base test save](../specs/090-full-base-test-save.md)

- [x] **Update the in-game user documentation to cover the Airstrip building plus the** — F22 Raptor and F35 jet workflows, unlocks, and stat entries.
  - Spec: [In-Game User Documentation](../specs/032-user-documentation.md)

- [x] **Ensure enemy AI maintains F22:F35 build parity at 1:1 and uses F35** — strike logic against anti-air-uncovered ground buildings.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Consolidated all F22 (non-street) chat requirements into a single numbered spec checklist** — with conflict resolution (latest wins), parallel agent clusters by file ownership, and explicit implementation vs gameplay-verification status markers.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **F22 follow-up** — adjusted airstrip spawn slot orientation/offsets, fixed top-left airstrip blocked-rect geometry, added configurable debug hotkey to cycle unit/building image opacity (100%/50%/0%), and updated occupancy overlay to render build-only street tiles in yellow.
  - Spec: [Airstrip map rendering bugfix](../specs/045-airstrip-map-render-bugfix.md)

- [x] **F22 follow-up** — enforce street-only grounded taxi, fix save-load airstrip occupancy restoration, cap airstrip parking slots at 7, restore takeoff progression, disable ground engine loop behavior, and add orbit-until-RTB fuel return behavior.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Spec 003 Add recovery_tank to the game**
  - [x] ✅ It can be built in the vehicle factory if a workshop exists
  - [x] ✅ The image assets for sidebar build button and unit on the map already exist in the respective folders named "recovery_tank.webp" each.
  - [x] ✅ It moves like a tocket_tank but 50% faster when not loaded otherwise it moves as fast as a tank when loaded
  - [x] ✅ It can repair any friendly damaged unit (repair mode).
  - [x] ✅ repairing a unit to 100% takes as long as buildings that specific unit.
  - [x] ✅ repairing works gradually and costs apply gradually but 100% repair would only cost 25% of the original cost to build that unit.
  - [x] ✅ any unit within 1 tile distance will be repaired automatically one by one at a time. The repair starts when the recovery_tank turned towards the unit (like aiming towards works from a rocket tank)
  - [x] with the recovery tank when selected the user can click on a tank that is not moveable anymore (indicated by "moveInto" cursor) for towing it around. When the user click again on the unit that is being towed then it will release again. Grounded out-of-fuel F22/F35 jets are also mountable, and S releases any mounted unit.
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Spec 008 Add Ammunition Factory & Supply Truck System (see `specs/008-ammunition-system/spec.md`)**
  - [x] Ammunition Factory building: $2000 cost, 3x3 tiles, 250 health, 40MW power, resupplies units within 2 tiles in 7s
  - [x] Ammunition Supply Truck: $800 cost, 30 health, 2x tank speed, 500 rounds cargo, resupplies within 1 tile
  - [x] ✅ All combat units have limited ammunition (Tank V1/V2: 42 rounds, Tank V3: 50 rounds, Rocket Tank: 21 rockets, Howitzer: 30 rounds, Apache: 38 rounds)
  - [x] Orange ammunition bar on left side of HUD (health top, fuel right, ammo left)
  - [x] Ammunition Factory explosion: 2-tile initial blast + 30-50 scattering particles dealing 30-50 damage each for 5 seconds
  - [x] ✅ Helipad ammunition reserves: 250 rounds capacity (50% of truck cargo), resupplied by Ammunition Supply Truck, transfers to landed helicopters
  - [x] ✅ Units with 0 ammunition cannot fire, display "No Ammunition" notification when attack commanded
  - [x] ✅ Apache helicopter ammunition system implemented with `rocketAmmo` field (38 rounds capacity)
  - [x] ✅ Apache combat system checks `rocketAmmo` before firing, enforces 300ms volley delay
  - [x] ✅ Apache helicopter base speed increased by 50% (now 6.75)
  - [x] ✅ Helipad ammunition transfer to landed Apache helicopters implemented
  - [x] ✅ Cheat system supports ammunition manipulation for all unit types including Apache
  - [x] Image assets: `/public/images/map/buildings/ammunition_factory_map.webp`, `/public/images/sidebar/ammunition_factory_sidebar.webp`, `/public/images/map/units/ammunition_truck_map.webp`, `/public/images/sidebar/ammunition_truck_sidebar.webp`
  - Spec: [Ammunition Factory & Supply Truck System](../specs/008-ammunition-system/spec.md)

- [x] **Add F22 Raptor stealth fighter unit** — spawns from airstrip, requires airstrip building, isAirUnit with radarInvisible, rocket ammo (20), fuel tank (8000), cost $8000, speed 8.0; integrates with helipad refuel/rearm logic on airstrip, production queue, tech tree unlock, AI production, and rendering with sidebar/map images.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Six-ship naval fleet expansion (2026-07-19)** — generated map/sidebar assets and completed engine integration for a 4-vehicle fast/light Hovercraft, 10-vehicle slow/armored Vehicle Ferry, realistically scaled Aircraft Carrier with a 4×F22/2×F35 deck and ammo/fuel-only service, dual-role naval Mine Layer/Sweeper plus wider-trigger/wider-blast water mines, independently targetable fore/aft Battleship batteries, and a stealth Submarine with owner-only submerged rendering, proximity detection, animated surfacing, ship-only torpedoes, and Destroyer depth charges. Detailed implementation checklist: `specs/075-naval-fleet-expansion/plan.md`.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Render F22/F35 aircraft 25% smaller while parked or operating on a carrier** — deck or Airstrip, with altitude-driven gradual scaling during landing and takeoff.
  - Spec: [Airstrip map rendering bugfix](../specs/045-airstrip-map-render-bugfix.md)

- [x] **Move carrier jet parking positions to the opposite side of the flight deck.**
  - Spec: none

- [x] **Use 75% landed jet size on carriers and Airstrips, interpolating continuously to** — full size as altitude increases during takeoff and landing.
  - Spec: none

- [x] **Reserve the F35 carrier parking slot before descent and keep rendezvous, vertical** — landing, and parked coordinates continuous.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Gate F22 carrier final approach to a stationary carrier after reaching a** — fourteen-tile astern staging point; descend before the rear threshold, turn during deck taxi, and launch from the extreme rear runway point.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Keep carriers stationary on attack commands and run persistent multi-target aircraft strike** — cycles that return, rearm, and relaunch from the originating carrier.
  - Spec: none

- [x] **Increase F22 rocket damage by approximately 50%.**
  - Spec: [Rocket Turret vs Apache Damage Tuning](../specs/054-rocket-turret-apache-damage.md)

- [x] **Keep carrier-launched F22 move orders active after takeoff so the aircraft reaches** — and circles the ordered location until replaced by a new order.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [x] **Launch carrier-based F22s for carrier attack commands even when they have a** — usable partial load; return mission aircraft when the target is destroyed or ammunition is exhausted, then rearm before relaunch.
  - Spec: none

- [x] **Extend the F22 carrier landing setup substantially astern and descend during final** — approach so the jet is at deck-entry altitude before crossing the runway threshold.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

### Economy and Buildings

- [x] **Radial build menu on production buildings (2026-09-25)** — Long-press a construction yard or unit factory to open a circular menu of that building's current sidebar options. Release queues one unit at that factory. A building option enters planning mode: drag or tap the map to place a blueprint, or rest on the building button for 500ms and drag the ghost out before release.
  - Spec: [Radial build menu](../specs/093-radial-build-menu.md)

- [x] **Map Settings total ore value control (2026-04-19)** — added `Total Ore Value` number input (step 1000) and deterministic map-generation distribution that evenly allocates non-seed ore value across all seed crystals; `0` now generates seed crystals only (from ore-field count).
  - Spec: none

- [x] **Allow selected defense buildings to queue forced attack targets in FIFO order** — and show numbered red target indicators on queued enemies.
  - Spec: none

- [x] **Spec 003 Add a hospital to the game:**
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **2) Add the image asset of the building for the map**
  - Spec: none

- [x] **Spec 003 8) Ambulance** — When a hospital is build it unlocks the build button of an ambulance unit
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **8.4 when an ambulance is selected and the mouse hovers over a** — friendly unit with missing crew members than the cursor turns into a "moveInto" cursor and the user can left click to command the ambulance to go to the target unit to restore the missing crew members.
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **8.5 the ambulance has a loading bar (like the harvester) that correlates** — to the amount of loaded people (10 people equals 100%)
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Add a gas station to the game**
  - 1) add the image asset for the sidebar to the build button (images/sidebar/gas_station.webp)
  - 2) add the image asset for the building on the map (images/map/buildings/gas_station.webp)
  - 3) the building has 50hp and consumes 30MW and costs 2000
  - 4) when a units is at one of the 3 tiles below the building it can refill its gas.
  - 5) It takes 7 seconds for each unit to refill its gas.
  - 6) One refill costs 50.
  - 7) Ensure that now every unit has a gas indicator that lives in the center of the bottom of the hud and is about 50% the witdth of the HUD. It looks like the harvesters loading bar but in blue.
  - 8) When the gas loading bar is at 0% the unit cannot move anymore until it gets refilled by a mobile tanker truck.
  - 9) Gas tank sizes and consumption of units (assume 1 tile is about 1000m in width and height => put this tile length for gas consumption into a constant from config.js and reuse it for any further calculation )
  - 9.1 tank_v1 gas tank size is 1900l and consumes 450l/100km
  - 9.2 tank_v2 and tank_v3 same as tank_v1
  - 9.3 rocket_tank gas tank same as tank_v1
  - 9.4 harvester gas tank is 2.650l and consumes 30l/100km gas when moving AND 100l per harvested ore tile
  - 9.5 ambulance gas tank is 75l and consumes 25l/100km
  - Spec: [Gas Station Explosion Safety and Damage Rings](../specs/013-gas-station-explosion.md)

- [x] **Add a mobile tanker truck to the game**
  - 1) add the image asset for the sidebar to the unit build button (images/sidebar/tanker_truck.webp)
  - 2) add the image asset for the unit on the map (images/map/units/tanker_truck.webp)
  - 3) the tanker truck has 20hp and costs 300. It moves twice as fast as a tank_v1.
  - 4) when the tanker truck is within 1 tile range of another unit this the tanker refils all surrounding units automatically one by one. Each refill tankes 7 seconds.
  - 5) when the tanker truck is selected and the mouse hovers over another unit the cursor turns into the "moveInto" cursor and when then left clicked on it the tanker truck will move there to refill that unit.
  - 6) the tanker truck has an own gas tank that is required for it to drive that takes 700l. This gas tank is indicated by a blue bar at the bottom (same like with any other unit).
  - 7) the tanker truck has another gas tank to refill other units. This gas tank has 40000l of gasoline. It is indicated by a loading bar on the top (same like the one used for harvesters).
  - Spec: none

- [x] **Spec 005 Add the chain build mode (CBM) that works as follows** — When user drags a building build button in the sidebar while holding shift key then CBM is active as long as shift key is pressed. The process is like this: User presses shift key, drags a build button (like the concrete wall but works for all buildings) on the map, releases the left mouse button, then the first building in BPM is planned on the map (so far everything working as before in BPM) but now CBM kicks in and the user moves the cursor over the map and while doing that CBM will render the map build overlay on the map for a straingt chain of buildings that fit in between the first building (that is already planned on the map) and the position of the cursor. When user now clicks a 2nd time the line of buildings to be planned is locked in and BPM starts for that line of buildings. Now (as long as the shif key is still pressed) the endpoint of the line is the new startpoint for a new line of that kind of buildings and so on util the user releases the shift key which results in the termination of CBM and no further chain of buildings will be planned. Make sure that CMB does not interfere with normal BMP or the default build mode. Both should still work like before! Also make sure that When a chain is planned that the build button's stack counter bubble gets increased accordingly.
  - Spec: [Building System Enhancements](../specs/005-building-system-enhancements/spec.md)

- [x] **Spec 005 Introduce drag and drop build mode:**
  - [x] ✅ When user drags an image from the sidebar onto the map immediately when the cursor is above the map while dragging ensure the placement overlay for the specific building is shown. When the user releases the left mouse button to finish the dragging then the blueprint mode (aka BPM) gets active. That means that on the map there will be a blue overlay being shown with the name of the building inside as text.
  - [x] ✅ as soon as the construction of that building is finished the building will be automatically placed where the blueprint was set. No need for extra placement by clicking the build button again.
  - [x] ✅ Make shure this feature does NOT interfere with the normal build workflow that should still be possible like before.
  - [x] ✅ When construction gets aborted (normal workflow by rightclick on sidebar's build button) make sure to remove the blueprint from the map again.
  - [x] ✅ Make sure to only place the finished building on the map when the occupancy map allows it (the blueprint should not block the tiles itself!) especially when the construction is finished and the final building gets placed automatically. Besides that the blueprint cannot be set when any map tile is occupied (same logic as normal placement logic => reuse that logic!).
  - Spec: [Building System Enhancements](../specs/005-building-system-enhancements/spec.md)

- [x] **Make sure the money for the repair will not be removed on** — click when repair mode gets applied but gradually. Also make sure that the repairing of a building can be stopped again when clicked again while repair mode is active and unfinished on that building.
  - Spec: none

- [x] **Add supply-ship retreat/resupply behavior for damaged, ammo-empty, fuel-empty, or crew-depleted ships.**
  - Spec: none

### AI

- [x] **Integrate InceptionLabs Mercury M2 as an LLM provider, add multi-provider model pool** — with per-model tick interval overrides, and allow per-party Local/LLM model assignment from multiplayer sidebar.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [x] **Add the LLM Control API module with versioned protocol types/schema/validators, export/apply adapters,** — transition collection hooks, examples, and tests.
  - Spec: [LLM Control API Specification](../specs/031-llm-control-api.md)

- [x] **Add 3 star level system for any combat unit (all units but** — harvesters). Every unit starts at level 0. Whenever a unit (player or enemy ai) kills an opponent unit (not building) the unit gets in internal bounty counter increased by the cost of the killed unit. When that bounty counter is twice the value of the unit itself, the unit gets promoted to level 1. When the counter is at 4x the unit value it gets to level 2 and when the counter is at 6 times the unit value it gets to final level 3. To indicate the units level there are up to 3 yellow stars adding up from the center above the units health bar. Make sure this system works for all players (human and AI).
  - Spec: none

- [x] **Add an inspection-only Strategic LLM Preview tab and extend the future strategic-context specification.**
  - Spec: [Strategic LLM incremental context (future implementation)](../specs/079-strategic-llm-context.md)

- [x] **Strategic LLM incremental context (spec 079, 2026-08-30)** — send a fog-filtered schema-once relational bootstrap followed by revisioned/coalesced entity, resource, and event deltas; expose bounded entity/region lookup; and provide independent strategic and commentary polling interval settings in seconds. Spec 079 status is implemented on 2026-08-30. The open snapshot/change-feed line is the same work as the done spec 079 entry.
  - Spec: [Strategic LLM incremental context (future implementation)](../specs/079-strategic-llm-context.md)

### Multiplayer and Networking

- [x] **Show defeated players with a clear "Defeated" status in the multiplayer sidebar overview.**
  - Spec: [Multiplayer sidebar defeated status](../specs/051-multiplayer-sidebar-defeated-status.md)

- [x] **Extend unit coverage for multiplayer gameCommandSync (Task 5.7).**
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Add online multiplayer support where humans can join an existing game and take over an AI party.**
  - [x] The interface should be minimalistic
  - [x] in the sidebar below the "Players: " input there will be a label for each active party in the game like "Red: NameOfRedPlayer" and so on. Each row has another party listed.
  - [x] on the right of each row is a small invite button that generates an invite link to take over that party by a human player on the internet
  - [x] when a human opens the link in a browser the game is started and the browser connects to that game and the party is taken over by that player.
  - [x] Before connecting the new player has to enter his name/alias. After that he will join immediately to the running or paused game of the host.
  - [x] Use WebRTC to connect the browsers directs to one another so no gaming server is needed. The host browser will serve as the source of truth when more than 2 players are joined.
  - [x] the host will get a notification when a player joined successfully.
  - [x] when a party disconnects i.e. by closing the tab the party will immediately be taken over by an ai player again but the invite link will work again if opened again in a browser.
  - [x] the invite link is specific to a game instance and a party
  - [x] any party can save the game but when a non host will load the game this non host will be the new host and the game instance will be different and also the invite links will be different from the original.
  - [x] only the host can start/pause the game
  - [x] only the host can start/pause the game or use cheats, even after other players join
  - Spec: [Online Multiplayer Takeover](../specs/001-add-online-multiplayer/spec.md)

- [x] **Add deterministic mixed map biomes with organic transparent transitions, per-biome size weights,** — vertical/horizontal/corner/random layouts, configurable region count, ocean-only shoreline sand, optional plateau snow, immediate settings regeneration, and save/multiplayer parity (2026-09-15).
  - Spec: [Mixed map biomes](../specs/075-mixed-map-biomes.md)

### UI, Sidebar, and Settings

- [x] **Heavy-battle benchmark in settings (2026-09-24)** — The runtime settings button is a dropdown for the existing map-scroll benchmark and a heavy battle (seed 11, 4 players, 320 units, 3 s warmup, 8 s measure). The heavy battle uses the same results dialog plus a vertical phase breakdown. Labels follow the landing locale (`settings.benchmark.*` in EN and DE). The performance widget lists each phase on its own row and stays within the previous overlay width.
  - Spec: [Heavy-battle frame phases](../specs/072-heavy-battle-frame-phases.md)

- [x] **Ensure in mobile portrait that long-press production tooltips do not open when** — the user is dragging a build button (drag-to-build gesture).
  - Spec: [Mobile Portrait Sidebar Expand Button](../specs/022-mobile-portrait-sidebar-expand-button.md)

- [x] **SSE sheet metadata HUD follow-up (2026-04-15)** — when a sheet loads in Static or Animated mode, show inline resolution beneath the sheet selector and add an (i) info bubble with hover/click popover for full image metadata details.
  - Spec: none

- [x] **Tablet landscape sidebar parity (2026-04-14)** — touch landscape viewports with tablet-sized short edge now keep desktop sidebar behavior instead of forcing mobile-landscape UI.
  - Spec: [Tablet landscape desktop sidebar behavior](../specs/057-tablet-landscape-desktop-sidebar.md)

- [x] **Debug command overlay compact minimized mode (2026-03-28)** — when minimized, only a floating "Maximize logs" button remains visible at bottom-right above condensed sidebar space.
  - Spec: none

- [x] **Debug command overlay minimize/maximize control (2026-03-28)** — `?debug` command panel now has a header toggle button to collapse/expand while keeping selection-aware visibility behavior.
  - Spec: none

- [x] **Map-regeneration UX follow-up** — preserve and clamp camera scroll position when map settings changes trigger regeneration, instead of always re-centering on the base.
  - Spec: [Map Settings expand scroll alignment](../specs/062-map-settings-expand-scroll-alignment.md)

- [x] **Show the straight-line (air) distance in meters below the move cursor when** — units are selected and hovering valid move targets.
  - Spec: none

- [x] **Ensure the help modal applies the same style of the cheat modal including a cancel x button on the top right.**
  - Spec: none

- [x] **Add a button to the right of the cheat modal toggle button** — in the sidebar to toggle the help modal (currently only toggled by "i" key). Ensure the button gets a suited icon to indicate "help" (no text).
  - Spec: [Sidebar Performance Widget Toggle Button](../specs/037-sidebar-performance-toggle-button.md)

- [x] **Add a mobile control group panel with assign toggle and long-press assignment for groups 1-9.**
  - Spec: [Mobile Portrait Sidebar Toggle](../specs/010-mobile-portrait-sidebar-toggle/spec.md)

- [x] **Attack cursor and out-of-range cursor now switch correctly based on distance to** — target and unit firing range. Distance to target and max range are displayed in meters (10m per tile) with black text on white background. See `specs/000-global-specs.md` for measurement system.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **1) Add the build button to sidebar** — cost 4000, health 200, power -50MW
  - Spec: none

- [x] **3) All tanks now have 4 crew people on board (each person** — is indicated by a small colored mannequin in a corner of the HUD):
  - Spec: none

- [x] **Spec 005 Add Drag and Drop mode for units (aka DnDU)** — User can drag a build button of a unit on the map that means when the unit is ready it will automatically move that point on the map.
  - Spec: [Building System Enhancements](../specs/005-building-system-enhancements/spec.md)

- [x] **Spec 005 Make a little flag animation for buildings instead of the** — colored square in the HUD currently used to indicate the party a buildings belongs to. Replace it with a flag that has a pole and a rectangular flag in the color of the party. The flag is always on the ground in the top left corner. Make sure there is some flattering in the wind animation of the flag and that is has a black border and a dark silver pole. Ensure the wind direction is the same as for the smoke wind direction animation! The size of the flag should not be wider as the current HUD rectangle.
  - Spec: [Building System Enhancements](../specs/005-building-system-enhancements/spec.md)

- [x] **Add a unit under-attack notification for player-owned units that includes a clickable** — unit type link; clicking it smoothly focuses the camera on that unit and selects it.
  - Spec: [Unit Under-Attack Focus Notification](../specs/045-unit-under-attack-focus-notification.md)

- [x] **Shipyard/Destroyer follow-up** — enlarge the yard to 5x5 with an expanded three-tile edge service zone; use only the south-facing Destroyer map sprite with programmatic rotation; align stern/bow V-wakes to hull endpoints; enlarge the ship HUD; move only the Shipyard flag to top-left; fix water rally lifecycle and cheat spawning; add Apache → Destroyer → jet enemy-AI progression, naval base/ship attacks, and sub-20% Shipyard repair return; reduce armor to 1.5 and crew casualty chance to 5%; and replace the build image with a full-ship water-backed icon.
  - Spec: [Shipyard and Destroyer Naval Groundwork](../specs/073-shipyard-destroyer/spec.md)

- [x] **Add Supply Ship naval support unit** — Shipyard-produced, visible with at least one supply building, carries crew/fuel/ammo/repair tools, supports nearby ships within 2 tiles, refills cargo only in Shipyard service area, and reports all four cargo capacities in its HUD tooltip.
  - Spec: [Supply Ship](../specs/074-supply-ship/spec.md)

- [x] **Naval boarding/HUD/wake follow-up (2026-07-20)** — add bidirectional move-into cursors and shoreline rendezvous loading for ground vehicles and transports, carrier landing/service commands for F22/F35/Apache, transport cargo-manifest HUD tooltips, no wakes while submarines are submerged, and bow wakes positioned ahead of every ship hull.
  - Spec: [F35 VTOL Stealth Strike Fighter](../specs/052-f35-unit.md)

- [x] **Add consistent header, tabs, fields, metrics, protected-map notice, editor workspace, table, footer** — action, focus, backdrop, and responsive mobile treatments.
  - Spec: none

### Audio and Voice

- [x] **First-build milestone videos (2026-09-24)** — play 5:3 radar clips with narrator VO the first time the local player builds a Mine Layer, Mine Sweeper, Rocket Tank, or Howitzer. Preload each still-unachieved milestone mp4/mp3 when that production starts, and fade every milestone video in and out on the minimap. Replace the first-tank and airstrip clips with the 5:3 remasters and add their companion mp3 files. The first production-line narrator replaces the unit-ready sting; later units of that type still play the sting.
  - Spec: [First-build milestone videos, preload, and radar fade](../specs/090-first-build-milestone-videos.md)

- [x] **6) Make sure to play the respective sound file when a crew** — member got killed (loaderIsOut.mp3, driverIsOut.mp3, commanderIsOut.mp3, gunnerIsOut.mp3)
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **Use arial sound for moving tanks and combat sounds so that these** — get the loudest when they are in the center of the screen and get quieter when the screen center moves away from the location of the sound.
  - Spec: none

- [x] **Completely hide build options in the sidebar for units and buildings until** — they are unlocked. When they get unlocked play sound "new_building_types_available" or "new_units_types_available" and show a yellow "new" label in the top right corner of the production tile until the first production of that kind was triggered.
  - Spec: [Restart Resets Sidebar Build Options](../specs/043-restart-resets-sidebar-build-options.md)

- [x] **Make a dedicated sound for attacking confirmation**
  - Spec: none

### Missions and Campaign

- [x] **Demo battle save (2026-09-25)** — locked builtin save `demo` (`builtin:demo`) with EN/DE labels, generated from the live terrain so the map has mixed biomes, rocks, cliffs, and water, plus two armies with land, air, and naval units.
  - Spec: [Demo battle save](../specs/093-demo-battle-save.md)

- [x] **Mission 01 Fordline ground and camp (2026-09-24)** — the player yard sits on land, with only a narrow road north. The enemy camp is larger, ringed with concrete walls, and has a south gate plus a second gun turret. Id `Mission_01` and the intro hook stay.
  - Spec: [Mission 01 Fordline and intro video](../specs/091-mission-01-fordline.md)

- [x] **Mission 01 Fordline (2026-09-24)** — replace Midnight Siege with a first mission that keeps id `Mission_01`. The player starts with a yard, one tank, and credits for power, refinery, factory, and a harvester, then crosses a ford to destroy a walled outpost. EN/DE briefing text follows the landing locale. Loading the builtin mission plays `public/video/mission_01_intro.mp4` in a skippable 16:9 panel, or shows the briefing when that file is absent. Full Base Test and other modes do not play it.
  - Spec: [Mission 01 Fordline and intro video](../specs/091-mission-01-fordline.md)

- [x] **Make the tutorial window draggable on both mobile and desktop by clicking and dragging the card header.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Add a professional in-game User Documentation HTML page with quick guide, deep** — guide, and full unit/building compendium, accessible from both sidebar and tutorial window.
  - [x] Mobile-responsive design with single-column card layout on small screens
  - [x] Borderless professional tables with hover highlights and subtle separators
  - [x] Complete unit stats tables with all numerical values (cost, HP, speed, damage, fire rate, range, burst, ammo capacity, armor)
  - [x] Complete building stats tables split by category (economy, support, defensive) with full stats
  - [x] Tech tree visual dependency graph with sidebar asset images for all building→unit and building→building unlocks
  - [x] HUD explanation section covering HP bar, fuel bar, ammo bar, XP progress, crew indicators, and promotion stars
  - [x] Remote control section for desktop keyboard (arrow keys, shift+arrows, space) and mobile joystick profiles
  - [x] Multiplayer guide with party colors, map positions, host rules, invite flow, and cross-platform play
  - [x] Mine system UX guide covering mine layer deployment (ctrl+click, drag area), mine properties, and mine sweeper operation
  - [x] Crew system section with D/C/G/L indicators, crew assignments by unit type, and restoration methods
  - [x] XP & promotions with level thresholds, standard vs howitzer bonuses
  - [x] Fuel & ammo logistics chain guide with collapsible fuel tank sizes per unit
  - [x] Combat mechanics with hit zone multipliers (front/side/rear) and projectile details
  - [x] Full keyboard reference table with contexts
  - [x] Building placement rules and sidebar interaction tips (drag, hold, shift+scroll, chain build)
  - Spec: [In-Game User Documentation](../specs/032-user-documentation.md)

- [x] **Start every portrait session with the dense bottom build bar and add** — animated first-time mobile tutorial guidance for sidebar resize gestures and upper/lower Build-button stack controls.
  - Spec: [Mobile Portrait Sidebar Expand Button](../specs/022-mobile-portrait-sidebar-expand-button.md)

- [x] **Add a tutorial progress bar for the crew/ambulance step only (hospital built** — → ambulance built → any crew restored) and announce completion via tutorial voice.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Add a tutorial step explaining D/C/G/L crew indicators, focusing on an empty-crew** — tank, and requiring hospital/ambulance recovery before continuing.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

### Performance

- [x] **Sprite-sheet explosion retina + black-key fix (2026-04-14)** — sprite-sheet frame cropping now derives source tile size from actual texture dimensions (`naturalWidth/cols`, `naturalHeight/rows`) to avoid DPR mismatch artifacts, and explosion textures are preprocessed once to convert black background into transparent alpha for correct additive blending visuals.
  - Spec: none

- [x] **Implement lazy loading for production sidebar images to boost initial loading performance.** — Images only load when buildings/units are unlocked via tech tree progression, not upfront. Show placeholder images initially, replace with actual images only when unlocked. Works for fresh games (only Power Plant initially), saved games (only unlocked buildings load), and tech tree progression (images load on unlock events). Images load during syncTechTreeWithBuildings calls and for available types after setup.
  - Spec: [Sidebar Performance Widget Toggle Button](../specs/037-sidebar-performance-toggle-button.md)

- [x] **Add an fps overlay in the top right corner that can be toggled on/off with "f" key. Add info to help menu.**
  - Spec: none

### Landing Page and i18n

- [x] **Bilingual marketing landing page (2026-09-24)** — `/en/landing` and `/de/landing` on the game domain, `/landing` locale redirect, sidebar link after Privacy, `landing.*` copy in English and German, current features, generated asset kinds, and the live tech tree.
  - Spec: [Marketing landing page](../specs/090-marketing-landing-page.md)

- [x] **Add bilingual legal pages and routing (`/impressum`, `/imprint`, `/datenschutz`, `/privacy`) with a** — gitignored local legal identity config (`impressum.config.json`), example config fallback, in-game + shell legal links, and privacy text aligned to actually used storage/network/WebRTC behavior.
  - Spec: [Legal pages setup](../docs/legal-pages.md)

- [x] **Add `contactFormUrl` config field and render a contact form link in Impressum/Imprint** — contact section to satisfy § 5 DDG second-contact-method requirement (alternative to phone number).
  - Spec: none

### Saves and Replay

- [x] **First tank milestone video (2026-09-23)** — play `public/video/first_tank.mp4` once through the existing milestone overlay when the local player produces their first standard land tank (`tank` / `tank_v1`). Later tanks and other vehicles do not replay it. Progress is saved with other milestones and cleared on restart.
  - Spec: [First tank milestone video](../specs/089-first-tank-milestone.md)

- [x] **Loading screen (2026-09-21)** — show an on-brand boot overlay for storage, assets, map generation, and saved-battle restore, and reuse it for restart, map regeneration, save/mission load, and replay load. Determinate progress is used while asset load is knowable; reloads use an indeterminate standby state. The overlay tears down without blocking play.
  - Spec: [Loading Screen](../specs/080-loading-screen.md)

- [x] **Save/Load UX follow-up (2026-04-21)** — map canvas now accepts drag/drop of exported save/replay JSON files for import/load, save-list hover tooltips include save size + remaining local-storage MB, quota-exceeded local saves now disable the Save button with explanatory tooltip/notification, and a new Download Save button exports the current game directly without localStorage.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Multi-sheet tagged runtime composition (2026-04-17)** — integrated map rendering now composes all selected static sprite sheets that have tagged tiles, mixes same-tag candidates (e.g. rocks) across sheets, ignores untagged sheets for memory savings, applies localStorage tag overrides over sidecar JSON in singleplayer, and forces default sidecar metadata only while multiplayer sessions are active.
  - Spec: [Sprite Sheet Editor and Integrated Tile Rendering](../specs/047-sprite-sheet-editor-integrated-rendering.md)

- [x] **Add replay system with record-mode command capture (including LLM decisions), replay list** — tab beside save games, replay playback controlled by Start/Pause, and replay-mode input/build restrictions plus user-doc updates.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Add save game sharing via sidebar import/export** — export local saves as JSON from each save row, add an import button next to save, and make save labels clickable to load.
  - Spec: none

- [x] **Store the position of the tutorial modal in localStorage so it persists across sessions.**
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

- [x] **Keep legacy JSON import/export support and add a persistent Compact CFB versus** — Legacy JSON converter choice to Map Settings.
  - Spec: [Sidebar Save Game Import/Export](../specs/051-save-game-import-export.md)

- [x] **Accept compact `.cfb` files alongside legacy save and replay JSON files.**
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [x] **Replace the compact JSON envelope with whitespace-minimal CFB2 schema/row tables grouped by entity and unit type.**
  - Spec: none

- [x] **Add a Map Settings Save Game Editor modal with editable JSON/table views,** — read-only map data, metrics, save-as-new, and confirmed override.
  - Spec: none

- [x] **Restyle the Save Game Editor as a polished dark-mode modal that follows** — the Settings modal and the game's blue/steel visual language.
  - Spec: none

- [x] **Add a persistent "lastGame" autosave that runs every minute, saves immediately on** — pause, and automatically reloads after iOS/PWA resumes from a killed paused session.
  - Spec: none

### Tooling and CI

- [x] **Playwright E2E Testing** — Setup Playwright for end-to-end browser testing with real user interactions.
  - [x] ✅ Install and configure Playwright with Chromium
  - [x] ✅ Create basic game flow test (seed 11): build power plant, refinery, vehicle factory, harvester, tank, command tank to ore
  - [x] ✅ Add Apache helipad auto-return regression E2E (ammo empty → return → land/refill → resume attack target)
  - [x] ✅ Add F22 sequential airstrip cycle E2E (3 parked F22 queue takeoff one-by-one, clear enemy groups, auto-return, park on slots, and verify ammo refills only after parked state)
  - [x] ✅ Stabilize Apache auto-return E2E by removing transient grounded-state assertion and dismissing startup overlays.
  - [x] ✅ Verify console error capture and no-error assertions
  - [x] ✅ Add npm scripts: `test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `test:e2e:debug`
  - Spec: [Playwright E2E Testing Framework](../specs/027-playwright-e2e-testing.md)

- [x] **Vitest Integration Testing** — Integrate Vitest for headless unit and integration testing without video, audio, or rendering.
  - [x] ✅ Install and configure Vitest with jsdom environment for DOM manipulation
  - [x] ✅ Create test setup file with mocks for Audio, Canvas, WebGL, localStorage, and other browser APIs
  - [x] ✅ Create test utilities (TestGameContext class) for running game loop headlessly
  - [x] ✅ Add focused unit tests for the help system overlay toggling and pause state behavior.
  - [x] ✅ Integration tests for building placement near Construction Yard:
  - [x] ✅ Variation 1: Power plant with 1 tile free space around CY (all 4 directions + diagonal)
  - [x] ✅ Variation 2: Power plant with 2 tiles free space around CY (all 4 directions + diagonal)
  - [x] ✅ Variation 3: Power plant with 0 tiles free space (directly adjacent, all 4 directions + diagonal)
  - [x] ✅ Negative tests: Building placement too far from CY (beyond MAX_BUILDING_GAP_TILES=3)
  - [x] ✅ Edge case tests: Exactly at MAX_GAP distance and MAX_GAP+1 distance
  - [x] ✅ Game loop integration tests: Running 60-300 ticks with building placement
  - Spec: [Vitest Testing Framework Specification](../specs/023-vitest-testing-framework.md)

### Other

- [x] **Debug reroute diagnostics enrichment (2026-03-28)** — command history now records reroute entries with move target + path signature to expose same-target path churn reasons beyond generic "move" events.
  - Spec: none

- [x] **Debug selected-unit command history overlay (2026-03-28)** — with `?debug` enabled, selecting exactly one unit now shows a right-side center overlay listing that unit's last 10 high-level command signals (works for player and enemy units, closes on deselect).
  - Spec: [Debug Unit Command History Overlay](../specs/059-debug-unit-command-overlay.md)

- [x] **Guard follow responsiveness follow-up (2026-03-26)** — guard reroutes are throttled to max once every 2s and only triggered when guarded unit is farther than half fire range, while guarded-target intruders are immediately retaliated against in-range without leaving guard mode.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Follow-up** — InceptionLabs integration now uses fixed `Mercury 2` model selection (no `/models` fetch) and calls `v1/chat/completions` for requests.
  - Spec: none

- [x] **8.1 an ambulance unit costs 500 and has 25 health**
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **8.3 when freshly build the ambulance has 10 people on board**
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **8.6 the restore process starts when the ambulance is assigned to the** — unit and it is within 1 tile range. It takes 2 seconds for each person to go from the ambulance to the target unit. Make sure to update the loading bar of the ambulance during this process and add the mannequinns to the target unit.
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

- [x] **8.7 The mannequinns are added in this order** — driver, commander, loader, gunner
  - Spec: none

- [x] **Spec 004 Add a path planning feature (PPF)** — When user has selected some units then they can be commanded to do a list of actions in the order they were assigned. Those actions can be move to or attack or retreat. The PPF is used while holding shift key and then every normal action will be chained. Actions like move to or attack or AGF (attacking multiple targets) can be used with PPF. Make sure this feature does not interfere with the expand selection feature where move units can be added to current selection when shift is hold while clicking on friendly units to add them to the selection.
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **When units are below 25% health they start to move with 50% of the speed of normal units.**
  - Spec: none

- [x] **Rocks currently do not block the occupancy map.**
  - Spec: none

- [x] **Add meaning to the level system so:**
  - **Level 1:** means that units will get 20% range increase.
  - **Level 2:** means that units will get 50% armor increase.
  - **Level 3:** means that units will repair themselves when not moving by 1% every 3 seconds AND will get 33% increase in fire rate.
  - Spec: none

- [x] **When units are selected and the "s" key is pressed then they** — stop attacking. When no units are selected then the s key triggers the sell mode on/off.
  - Spec: none

- [x] **Spec 006 Add tank_v3 to the build menu. tank_v3 can all what** — tank_v2 can do but add the aim ahead feature so it takes the speed and direction of a moving target into account when fireing at it to increase the likelyhood of a direct hit. It costs 3000$ and has 30% more health than tank_v2.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [x] **Support cheat codes for better testing via browser console. Make sure there** — is a code for invincibility for all units (like "godmode on" or "godmode off") and a code to get x amount of money (like "give 10000$")
  - Spec: none

- [x] **Spec 004 Implement an attack group feature (aka AGF)** — All selected players units can attack a group of enemy units by left click and hold to drag a box (displayed in red) around the enemy units to be attacked. Then all those units will be attacked one after another. All units to be attacked will then have a small semi transparent slightly bouncing red triangle above the health bar to indicate that they are being attacked. Make any unit in ADF mode will leave that mode when commanded to do sth. else (including another AGF mode).
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [x] **When a unit on the map is double clicked then automatically all** — units of this type visible on the screen will be selected together. When player holds shift key while double clicking on a unit then all units of that type will be added to the existing selection. When player just holds shift key and just makes a normal click on a unit then only this unit will be added to current selection.
  - Spec: none

- [x] **Add start money as a configurable map setting and apply it to all parties.**
  - Spec: none

- [x] **Add ship inertia/ease-in/ease-out movement and rotation.**
  - Spec: none

- [x] **Split `enemyUnitBehavior.js` by AI domain so every resulting behavior module stays below** — 500 lines while retaining the existing public entry point.
  - Spec: none

- [x] **Store new saves in a versioned readable compact format using palette/run-length map** — encoding and removing reconstructable map duplication.
  - Spec: none

- [x] **Preserve map palette/RLE compression while converting the palette itself to a relational table.**
  - Spec: none

- [x] **Persist unit paths, current and queued commands, primary/attack targets, multi-target IDs, planning** — blueprints, and production stacks.
  - Spec: none
