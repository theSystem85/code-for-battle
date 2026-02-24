## Features
- [ ] Add `skills.md` OpenAI image generator setup for Codex workflows, including 4 prompt templates (unit sidebar/map + building sidebar/map).
- [x] Add cheat code `xp [amount]`, `xp +[amount]`, and `xp -[amount]` to set or adjust experience for all selected combat units.
- [x] Ensure the help modal applies the same style of the cheat modal including a cancel x button on the top right.
- [x] Add a button to the right of the cheat modal toggle button in the sidebar to toggle the help modal (currently only toggled by "i" key). Ensure the button gets a suited icon to indicate "help" (no text).
- [x] Add the LLM Control API module with versioned protocol types/schema/validators, export/apply adapters, transition collection hooks, examples, and tests.
- [ ] Add LLM strategic AI settings + provider model pickers, commentary toggle/TTS, cost tracking, and in-game usage overlays.
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
- [x] Add a mobile control group panel with assign toggle and long-press assignment for groups 1-9.
- [ ] Add long-press production tooltips that show unit/building stats, damage totals, and clickable focus rows aligned to the money bar tooltip style.
- [x] Ensure CI runs lint, unit tests, and integration tests on pull requests.
- [x] ✅ **Playwright E2E Testing**: Setup Playwright for end-to-end browser testing with real user interactions.
  - [x] ✅ Install and configure Playwright with Chromium
  - [x] ✅ Create basic game flow test (seed 11): build power plant, refinery, vehicle factory, harvester, tank, command tank to ore
  - [x] ✅ Add Apache helipad auto-return regression E2E (ammo empty → return → land/refill → resume attack target)
  - [x] ✅ Stabilize Apache auto-return E2E by removing transient grounded-state assertion and dismissing startup overlays.
  - [x] ✅ Verify console error capture and no-error assertions
  - [x] ✅ Add npm scripts: `test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `test:e2e:debug`
  - [ ] Integrate E2E tests into CI/Netlify pipelines for merge gating
  - [ ] Add more E2E scenarios (combat, multiplayer, save/load)
- [ ] Add a headless browser smoke test that fails on console errors and wire it into CI/Netlify pipelines for merge gating.
- [ ] Add unit tests for the multi-unit input handler utilities (task 4.9 coverage work).
- [ ] Add unit tests for `src/input/unitCommands.js` (utility queues, resupply assignments, recovery tank handling) to improve input-system coverage.
- [x] ✅ Make the tutorial window draggable on both mobile and desktop by clicking and dragging the card header.
- [x] ✅ Store the position of the tutorial modal in localStorage so it persists across sessions.
- [x] ✅ Extend unit coverage for multiplayer gameCommandSync (Task 5.7).
- [ ] Add unit tests covering AI party synchronization during multiplayer disconnects (aiPartySync).
- [x] ✅ Add unit tests for the remote WebRTC peer connection workflow (remoteConnection module).
- [x] ✅ Add lockstep manager unit tests to validate deterministic lockstep synchronization behavior.
- [x] ✅ Add unit coverage for control group handling (KeyboardHandler control group assignment/selection/rebuild tests).
- [x] ✅ Add keyboard handler unit tests (Task 4.3) to cover hotkey modes, dodge logic, control groups, and stop-attacking flows.
- [x] ✅ Add unit tests for the cheat system input flows (Task 4.1) to cover parsing, spawning, and state updates.
- [ ] Add a cheat code `recover [party]` to instantly restore the selected wreck and assign it to the specified party (defaults to the player).
- [ ] Add unit tests for remote control state handling (Task 4.10 coverage for `src/input/remoteControlState.js`).
- [x] ✅ Attack cursor and out-of-range cursor now switch correctly based on distance to target and unit firing range. Distance to target and max range are displayed in meters (10m per tile) with black text on white background. See `specs/000-global-specs.md` for measurement system.
- [x] ✅ **Vitest Integration Testing**: Integrate Vitest for headless unit and integration testing without video, audio, or rendering.
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
- [x] ✅ Add unit test coverage for WebRTC session monitoring, AI fallback, and kick flow (Task 5.5).
  - [x] ✅ Unit tests for multiplayer invite lifecycle, host regeneration, and party ownership changes (Task 5.3).
- [x] ✅ Add unit tests for selection manager input flows (Task 4.6).
- [ ] Add cursorManager input system unit tests (Task 4.2) to cover cursor state transitions and range UI behavior.
- [ ] Add an interactive tutorial system that demonstrates UI/UX actions with a tutorial cursor, speech narration, skip controls, restart control, and persistent settings (show tutorial + voice). Include steps for building the starter economy, unit selection/movement, tank production/rally points, remote control, combat goals, and tech tree explanations for tanker/gas station, ambulance/hospital/crew, ammo factory/ammo truck, and workshop/recovery tank.
- [ ] **Spec 011** Land mine system planning:
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
- [x] ✅ Implement articulated howitzer gun using the tankV1 barrel asset with ballistic elevation, directional muzzle flash, stronger recoil, and movement/firing lockouts while the barrel adjusts.
- [x] ✅ Rotate the shared howitzer barrel sprite by 180° and realign recoil/muzzle effects so the muzzle matches the wagon's facing.
- [x] ✅ Ensure ammunition trucks leave no wrecks on destruction and detonate with scattered munitions that threaten all nearby units and buildings.
- [ ] Danger Zone Map Feature (aka DZM): Let each enemy AI create a DZM where for each tile the damage per second is calculated based on the defence buildings of all non friendly other players on the map (including human and ai players). For each tile the damage per second will be calculated by checking which non allied defence buildings are in range and how much damage they could make based on their firing rate and damage per shot (also take burst shots into account). Whenever a new defence building is added to the map update that DZM. Ensure not to make this updates on a frame base in the game loop. Only do updates event based when new defence buildings get added or destroyed/sold. Also ensure this map is generated whenever a game is loaded (do not persist the DZM itself in save games). the DZM for each player can be show as an overlay on the map when pressing the z key. first time z key is pressed the DZM for the user player is shown. 2nd time the z key is pressed the DZM for the next player is shown and so on until all players were looped. Then it will hide the DZM overlay. Next time it will again start from user player DZM and so on.

The DZM overlay will look like a height map overlay with red 1px width lines that have 50% opacity. The closer the lines are together the higher the gradient is at this tile. Ensure to put the DZM overlay renderer into a separate new file. the DZM will be rendered on the map tiles but below buildings, units and HUD. When DZM overlay is active show in top right corner which player's (player red, yellow, green, blue) DZM is visible.

- [x] ✅ **Spec 004** Add remote control feature (aka RCF) for tanks
  - [x] ✅ when one or multiple tank(s) are selected the user can
    - [x] ✅ move it forwards by holding the arrow up key
    - [x] ✅ move it backwards by holding the arrow down key
    - [x] ✅ turn the wagon left by holding the left key
    - [x] ✅ turn the wagon right by holding the right key
    - [x] ✅ fire forwards by pressing the space key. Then the tank aims at the farthest point within range.
- [x] ✅ **Spec 003** Add recovery_tank to the game
  - [x] ✅ It can be built in the vehicle factory if a workshop exists
  - [x] ✅ The image assets for sidebar build button and unit on the map already exist in the respective folders named "recovery_tank.webp" each.
  - [x] ✅ It moves like a tocket_tank but 50% faster when not loaded otherwise it moves as fast as a tank when loaded
  - [x] ✅ It can repair any friendly damaged unit (repair mode).
  - [x] ✅ repairing a unit to 100% takes as long as buildings that specific unit.
  - [x] ✅ repairing works gradually and costs apply gradually but 100% repair would only cost 25% of the original cost to build that unit.
  - [x] ✅ any unit within 1 tile distance will be repaired automatically one by one at a time. The repair starts when the recovery_tank turned towards the unit (like aiming towards works from a rocket tank)
  - [ ] with the recovery tank when selected the user can click on a tank that is not moveable anymore (indicated by "moveInto" cursor) for towing it around. When the user click again on the unit that is being towed then it will release again.
  - [x] ✅ the recovery tank costs 3000 and has the same armor as the tank_v3.
  - [x] ✅ ensure to play the existing repair sound like (repairing.mp3, repairFinished.mp3)
- [x] ✅ **Spec 003** Add a hospital to the game:
- [x] ✅ 1) Add the build button to sidebar: cost 4000, health 200, power -50MW
- [x] ✅ 2) Add the image asset of the building for the map
- [x] ✅ 3) All tanks now have 4 crew people on board (each person is indicated by a small colored mannequin in a corner of the HUD):
- [x] ✅ 3.1 driver (top left blue) if dead tank cannot move wagon anymore but can still rotate the turret and fire at targets within range
- [x] ✅ 3.2 gunner (top right red) if dead tank cannot rotate the turret anymore but the tank can still fire at a target by rotating the entire wagon until gun points at target (might look funny)
- [x] ✅ 3.3 loader (bottom left yellow) if dead tank cannot fire anymore at all
- [x] ✅ 3.4 commander (bottom right green) if dead tank cannot be moved anymore by the user => it will only operate own and only defend itself or move back to base or complete it path when it was added before the commander died. Prio is as follows then: first defend yourself then continue path/waypoints if there is one then go back to base ideally directly to repair if there is a workshop.
- [x] ✅ 4) when the tank goes to the 3 tiles in below the hospital dead people will fill up again. One person will take 10s to be restored and costs 100.
- [x] ✅ 5) when a tank gets hit the likelyhood for each individual crew member to be killed is 15%.
- [x] ✅ 6) Make sure to play the respective sound file when a crew member got killed (loaderIsOut.mp3, driverIsOut.mp3, commanderIsOut.mp3, gunnerIsOut.mp3)
- [ ] 7) Ensure that the enemy AI will move the tanks with missing crew members back to hospital before continuing the battle.
- [x] ✅ **Spec 003** 8) Ambulance: When a hospital is build it unlocks the build button of an ambulance unit
- [x] ✅ 8.1 an ambulance unit costs 500 and has 25 health
- [x] ✅ 8.2 it now runs at reduced mobility: base speed 0.175 (65% slower) with a 4.0x street multiplier
- [x] ✅ 8.3 when freshly build the ambulance has 10 people on board
- [x] ✅ 8.4 when an ambulance is selected and the mouse hovers over a friendly unit with missing crew members than the cursor turns into a "moveInto" cursor and the user can left click to command the ambulance to go to the target unit to restore the missing crew members.
- [x] ✅ 8.5 the ambulance has a loading bar (like the harvester) that correlates to the amount of loaded people (10 people equals 100%)
- [x] ✅ 8.6 the restore process starts when the ambulance is assigned to the unit and it is within 1 tile range. It takes 2 seconds for each person to go from the ambulance to the target unit. Make sure to update the loading bar of the ambulance during this process and add the mannequinns to the target unit.
- [x] 8.7 The mannequinns are added in this order: driver, commander, loader, gunner

- [x] Add a gas station to the game
  1) add the image asset for the sidebar to the build button (images/sidebar/gas_station.webp)
  2) add the image asset for the building on the map (images/map/buildings/gas_station.webp)
  3) the building has 50hp and consumes 30MW and costs 2000
  4) when a units is at one of the 3 tiles below the building it can refill its gas.
  5) It takes 7 seconds for each unit to refill its gas.
  6) One refill costs 50.
  7) Ensure that now every unit has a gas indicator that lives in the center of the bottom of the hud and is about 50% the witdth of the HUD. It looks like the harvesters loading bar but in blue.
  8) When the gas loading bar is at 0% the unit cannot move anymore until it gets refilled by a mobile tanker truck.
  9) Gas tank sizes and consumption of units (assume 1 tile is about 1000m in width and height => put this tile length for gas consumption into a constant from config.js and reuse it for any further calculation )
     9.1 tank_v1 gas tank size is 1900l and consumes 450l/100km
     9.2 tank_v2 and tank_v3 same as tank_v1
     9.3 rocket_tank gas tank same as tank_v1
     9.4 harvester gas tank is 2.650l and consumes 30l/100km gas when moving AND 100l per harvested ore tile
     9.5 ambulance gas tank is 75l and consumes 25l/100km
- [x] Add a mobile tanker truck to the game
  1) add the image asset for the sidebar to the unit build button (images/sidebar/tanker_truck.webp)
  2) add the image asset for the unit on the map (images/map/units/tanker_truck.webp)
  3) the tanker truck has 20hp and costs 300. It moves twice as fast as a tank_v1.
  4) when the tanker truck is within 1 tile range of another unit this the tanker refils all surrounding units automatically one by one. Each refill tankes 7 seconds.
  5) when the tanker truck is selected and the mouse hovers over another unit the cursor turns into the "moveInto" cursor and when then left clicked on it the tanker truck will move there to refill that unit.
  6) the tanker truck has an own gas tank that is required for it to drive that takes 700l. This gas tank is indicated by a blue bar at the bottom (same like with any other unit).
  7) the tanker truck has another gas tank to refill other units. This gas tank has 40000l of gasoline. It is indicated by a loading bar on the top (same like the one used for harvesters).
- [ ] Add a sound for when party A attacks party B for the first time.
- [ ] Implement an allies system so that the player can ask an enemy to become an allie by clicking at thier base building and click the "unite" button that will appear when the diplomacy level between both parties reached 100%. The diplomacy level "DL" will level is a value that is hold for each party to each party. So party A can have another DL to B than B to A. When A attacks the enemy of B then DL for A raises on B. If A attacks B or an allie of B then the B's DL of A falls. When player clicks a base building then the DL of the party will be shown for each other party on the map with another "loading" bar below the health bar with the title "Diplomacy". The color of each bar indicates to which party it relaes to (each parties color).
- [ ] Ensure for each party P there is an internal statistic that tracks for each other party how much economical damage was made by adding the cost of the units and buildings destroyed by that specific party. Make sure there is a shortkey that toggles the display of that statistics during gameplay. Each enemy AI focusses on attacking the party that caused the most amount of economical harm to them so far.
- [ ] Add AI policy scripts: Make sure to come up with a sophisticated modular extensible unit AI policy architecture that can be used for humand and AI players' units. Create and integreate some JSON policy script to manage the AI's combat behaviour including priorities and another one to manage the AI's base build und unit production behaviour. Add the following initial scripts for this behaviour:
  - [ ] when player attacks -> defend or retreat into base if the unit under attack is too weak (havesters or combat units that are outnumbered) to regroup in the protection of the base defence. When attack was defended strike back.
- [ ] Expand the sell buildings function so that also unit can be sold when they are in the repair workshop and fully repaired and the player clicks on them while in repair mode. When in repair mode and the user hovers over a unit that does not fulfill these conditions show the selling_blocked cursor instead of the sell cursor.
- [x] Add a unit repair building to the buildings menu. It costs 3000$ and has 3 times the armor of a tank. Any unit can be directed to move there when selected and player clicks on the building. Then the unit will move to any surrounding tile and stays there. As long as the unit is close to the repair building it will get repaired (restore healthbar) gradually 2% every second.
- [x] Add artillery unit with 100% more range than tank and a radius of 3 tiles damage area around the impact. The accuracy is only 25% of hitting the target tile directly but 100% of hitting any tile in the radius of 3 tiles around the targetted tile.
- [x] **Spec 008** Add Ammunition Factory & Supply Truck System (see `specs/008-ammunition-system/spec.md`)
  - [x] Ammunition Factory building: $2000 cost, 3x3 tiles, 250 health, 40MW power, resupplies units within 2 tiles in 7s
  - [x] Ammunition Supply Truck: $800 cost, 30 health, 2x tank speed, 500 rounds cargo, resupplies within 1 tile
  - [x] ✅ All combat units have limited ammunition (Tank V1/V2: 42 rounds, Tank V3: 50 rounds, Rocket Tank: 21 rockets, Howitzer: 30 rounds, Apache: 38 rounds)
  - [x] Orange ammunition bar on left side of HUD (health top, fuel right, ammo left)
  - [x] Ammunition Factory explosion: 2-tile initial blast + 30-50 scattering particles dealing 30-50 damage each for 5 seconds
  - [x] ✅ Helipad ammunition reserves: 250 rounds capacity (50% of truck cargo), resupplied by Ammunition Supply Truck, transfers to landed helicopters
  - [ ] Enemy AI builds
    - [x] ammunition factories
    - [x] produces supply trucks
    - [?] and manages unit resupply automatically
  - [x] ✅ Units with 0 ammunition cannot fire, display "No Ammunition" notification when attack commanded
  - [x] ✅ Apache helicopter ammunition system implemented with `rocketAmmo` field (38 rounds capacity)
  - [x] ✅ Apache combat system checks `rocketAmmo` before firing, enforces 300ms volley delay
  - [x] ✅ Apache helicopter base speed increased by 50% (now 6.75)
  - [x] ✅ Helipad ammunition transfer to landed Apache helicopters implemented
  - [x] ✅ Cheat system supports ammunition manipulation for all unit types including Apache
  - [x] Image assets: `/public/images/map/buildings/ammunition_factory_map.webp`, `/public/images/sidebar/ammunition_factory_sidebar.webp`, `/public/images/map/units/ammunition_truck_map.webp`, `/public/images/sidebar/ammunition_truck_sidebar.webp`
- [x] Add online multiplayer support where humans can join an existing game and take over an AI party.
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
  - [ ] For the initial webRTC connection setup use a small express server that provides STUN services to connect peers
  - [x] only the host can start/pause the game or use cheats, even after other players join

## Features
- [ ] Wrecks and recovery/recycling: Ensure the units when destroyed do not just vanish from the map but their left overs keep lying on the map. The left overs should look totally color desaturated and slightly noisy to indicated dirt and damage (cache those desaturated images and reuse them). Any (also the ones from the enemy) left over unit can be pulled by a recovery tank to the base when player has the recovery tank selected and clicks on the tank. The the recovery tank will drive to the target then mount (indicated by a 2px black string that connects both units) and then automatically drive to the workshop where it unmounts and the unit gets fully restored but without crew. 

2nd option is that the user has the recovery tank selected and clicks on the left over unit while holding shift key. Then the leftover unit get recycled completely (vanishes from the map) but the owner of the recovery tank gets 33% of the value of the unit added to his budget (like a harvesting of resources). This process takes about as long as it took the unit to build. Show blue progress bar on the recovery tank while this mode is active.
- [x] ✅ **Spec 005** Add Drag and Drop mode for units (aka DnDU): User can drag a build button of a unit on the map that means when the unit is ready it will automatically move that point on the map.
- [x] Use arial sound for moving tanks and combat sounds so that these get the loudest when they are in the center of the screen and get quieter when the screen center moves away from the location of the sound.
- [x] ✅ **Spec 004** Add guard mode feature (GMF) for combat units. When guard mode is active and the unit is selected and the player clicks on a friendly unit the guarding unit will follow that unit and attack any incoming enemy in range without following the enemy but only following the unit to guard. Guard mode can be activated when a unit is selected and the cmd key is hold and then the unit to be guarded it selected by left click. As soon as the cmd key is pressed while a unit is selected the cursor turns into the "gurad.svg" cursor.
- [x] ✅ **Spec 004** Add a path planning feature (PPF): When user has selected some units then they can be commanded to do a list of actions in the order they were assigned. Those actions can be move to or attack or retreat. The PPF is used while holding shift key and then every normal action will be chained. Actions like move to or attack or AGF (attacking multiple targets) can be used with PPF. Make sure this feature does not interfere with the expand selection feature where move units can be added to current selection when shift is hold while clicking on friendly units to add them to the selection.
- [x] ✅ **Spec 005** Add the chain build mode (CBM) that works as follows: When user drags a building build button in the sidebar while holding shift key then CBM is active as long as shift key is pressed. The process is like this: User presses shift key, drags a build button (like the concrete wall but works for all buildings) on the map, releases the left mouse button, then the first building in BPM is planned on the map (so far everything working as before in BPM) but now CBM kicks in and the user moves the cursor over the map and while doing that CBM will render the map build overlay on the map for a straingt chain of buildings that fit in between the first building (that is already planned on the map) and the position of the cursor. When user now clicks a 2nd time the line of buildings to be planned is locked in and BPM starts for that line of buildings. Now (as long as the shif key is still pressed) the endpoint of the line is the new startpoint for a new line of that kind of buildings and so on util the user releases the shift key which results in the termination of CBM and no further chain of buildings will be planned. Make sure that CMB does not interfere with normal BMP or the default build mode. Both should still work like before! Also make sure that When a chain is planned that the build button's stack counter bubble gets increased accordingly.
- [x] ✅ **Spec 005** Make a little flag animation for buildings instead of the colored square in the HUD currently used to indicate the party a buildings belongs to. Replace it with a flag that has a pole and a rectangular flag in the color of the party. The flag is always on the ground in the top left corner. Make sure there is some flattering in the wind animation of the flag and that is has a black border and a dark silver pole. Ensure the wind direction is the same as for the smoke wind direction animation! The size of the flag should not be wider as the current HUD rectangle.
- [x] Add some some animations for the cooling towers of the refinery and the power plant. Make sure to analyse the map image assets to determine the center fore the each somke animation. Make sure to add some wind effect for the direction of the smoke animation. Reuse when possible the somke animations from the tank when it is damaged or use utility functions for both.
- [x] ✅ **Spec 005** Introduce drag and drop build mode:
  - [x] ✅ When user drags an image from the sidebar onto the map immediately when the cursor is above the map while dragging ensure the placement overlay for the specific building is shown. When the user releases the left mouse button to finish the dragging then the blueprint mode (aka BPM) gets active. That means that on the map there will be a blue overlay being shown with the name of the building inside as text.
  - [x] ✅ as soon as the construction of that building is finished the building will be automatically placed where the blueprint was set. No need for extra placement by clicking the build button again.
  - [x] ✅ Make shure this feature does NOT interfere with the normal build workflow that should still be possible like before.
  - [x] ✅ When construction gets aborted (normal workflow by rightclick on sidebar's build button) make sure to remove the blueprint from the map again.
  - [x] ✅ Make sure to only place the finished building on the map when the occupancy map allows it (the blueprint should not block the tiles itself!) especially when the construction is finished and the final building gets placed automatically. Besides that the blueprint cannot be set when any map tile is occupied (same logic as normal placement logic => reuse that logic!).
- [x] ✅ Implement lazy loading for production sidebar images to boost initial loading performance. Images only load when buildings/units are unlocked via tech tree progression, not upfront. Show placeholder images initially, replace with actual images only when unlocked. Works for fresh games (only Power Plant initially), saved games (only unlocked buildings load), and tech tree progression (images load on unlock events). Images load during syncTechTreeWithBuildings calls and for available types after setup.
- [x] Completely hide build options in the sidebar for units and buildings until they are unlocked. When they get unlocked play sound "new_building_types_available" or "new_units_types_available" and show a yellow "new" label in the top right corner of the production tile until the first production of that kind was triggered.
- [x] Add some smoke animation on the back of tanks when they are below 25% health.
- [x] Introduce a new seed crystal that cannot be harvested and has 2x the spreading rate but only spreads normal blue crystals. Use the ore1_red.webp image asset for it. Make sure during map generation those seed crysals (1-3 of them) are always in the center of an ore filed.
- [x] Add corner smoothening rendering algorithm to the map renderer where the corners of streets get cut smoothly to form straight diagonal lines. Smoothening Overlay Textures (SOT) use the street texture, work in all diagonal orientations, apply only on land tiles, render above streets but below rocks, ore and buildings, and expand slightly to hide single-pixel gaps.
- [x] Make sure the money for the repair will not be removed on click when repair mode gets applied but gradually. Also make sure that the repairing of a building can be stopped again when clicked again while repair mode is active and unfinished on that building.
- [x] Add an fps overlay in the top right corner that can be toggled on/off with "f" key. Add info to help menu.
- [x] Add corner smoothening rendering algorithm to the map renderer where the corners of streets get cut smoothly to form straight diagonal lines. Smoothening Overlay Textures (SOT) use the street texture, work in all diagonal orientations, apply only on grass tiles, render above streets but below rocks, ore and buildings, and expand slightly to hide single-pixel gaps.
- [x] When units are below 25% health they start to move with 50% of the speed of normal units.
- [x] Rocks currently do not block the occupancy map.
- [x] Add 3 star level system for any combat unit (all units but harvesters). Every unit starts at level 0. Whenever a unit (player or enemy ai) kills an opponent unit (not building) the unit gets in internal bounty counter increased by the cost of the killed unit. When that bounty counter is twice the value of the unit itself, the unit gets promoted to level 1. When the counter is at 4x the unit value it gets to level 2 and when the counter is at 6 times the unit value it gets to final level 3. To indicate the units level there are up to 3 yellow stars adding up from the center above the units health bar. Make sure this system works for all players (human and AI).
- [x] Make sure there is some 2px yellow levelup progress indicator inside the health bar on top of it in the same box overlaying it so I can see the progress up to the next level when unit is in combat. When next level is reached it starts again from 0.
- [x] Add meaning to the level system so:
  - **Level 1:** means that units will get 20% range increase.
  - **Level 2:** means that units will get 50% armor increase.
  - **Level 3:** means that units will repair themselves when not moving by 1% every 3 seconds AND will get 33% increase in fire rate.
- [x] When units are selected and the "s" key is pressed then they stop attacking. When no units are selected then the s key triggers the sell mode on/off.
- [x] ✅ **Spec 006** Change tank rendering to support tank image assets consisting of 3 images with transparency to render one tank dynamically. (1) the tank wagon (tank_wagon.png) with the mounting point 32x60y in pixels from top left to mount the turret's center. The image asset for turret is named "turret_no_barrel.png". It has a mounting point for the gun barrel at 32x,68y pixels from top left. The gun barrel rotates with the turret in sync. The turret can rotate on the wagon. When the tank fires the gun barrel moves (dampened movement) up to 5 pixels to the top (reduces y coord) to indicate a recoil. Basically use the same mechanism like before but with image assets instead. Make sure to cache the images to make the rendering of hundreds of tank performant. Also shift the muzzle flash to coords 2x, 64y based on the gun barrel image. The rotation of all 3 image assets is aligned by default within the assets (they all point south).
  - [x] ✅ Make sure to implement this as an alternative rendering method to the existing non image based tank rendering so it can be toggled on and off during combat by the user (use some keyboard shortcut). Make sure to put the image based rendering in at least one separate file to have the code separated from the previous tank rendering. If possible use code fragments from the previous rendering technique or at least make sure there is not too much code redundancy.
  - [x] ✅ (1) Make the mounting points I described configurable by some json file so I can tweek them if needed.
  - [x] ✅ (2) Do not change the aspect ratio of the 3 images!
  - [x] ✅ (3) when the wagon rotates the turret should also rotate in the same way BUT only if the turret is aiming at some thing then it will rotate independently from the wagon to keep aiming at the target.
  - [x] ✅ (4) The orientation of the wagon is by default in the image asset facing down (to bottom). Same for the gun barrel and the turret. Make sure that the driving direction in the game is aligned with the facing of the wagon. If tank drives from top to bottom then the wagon should face also to the bottom.
- [x] ✅ **Spec 007** Support up to 4 parties in a game. Each player starts in one corner. One party can be played by human player. The others by AI (or later via network by ohter humans -> keep the interface abstract to upport AI and other humans). Define a set of 4 Colors that can identify each party. Add a number input to the end of the sidebar to define the number of players (label: "Players") on the map. Whenever the map is newly generated it will affect the map creation but not instantly. Make sure each AI player is attacking any player on the map (there is no teams feature yet, will come later). Make sure the map creation process is influenced by the number of players (regarding the direction of streets and ore spots)
- [x] Make a dedicated sound for attacking confirmation
- [x] ✅ **Spec 006** Add tank_v3 to the build menu. tank_v3 can all what tank_v2 can do but add the aim ahead feature so it takes the speed and direction of a moving target into account when fireing at it to increase the likelyhood of a direct hit. It costs 3000$ and has 30% more health than tank_v2.
- [x] Support cheat codes for better testing via browser console. Make sure there is a code for invincibility for all units (like "godmode on" or "godmode off") and a code to get x amount of money (like "give 10000$")
- [x] ✅ **Spec 004** Implement an attack group feature (aka AGF): All selected players units can attack a group of enemy units by left click and hold to drag a box (displayed in red) around the enemy units to be attacked. Then all those units will be attacked one after another. All units to be attacked will then have a small semi transparent slightly bouncing red triangle above the health bar to indicate that they are being attacked. Make any unit in ADF mode will leave that mode when commanded to do sth. else (including another AGF mode).
- [x] When a unit on the map is double clicked then automatically all units of this type visible on the screen will be selected together. When player holds shift key while double clicking on a unit then all units of that type will be added to the existing selection. When player just holds shift key and just makes a normal click on a unit then only this unit will be added to current selection.
- [x] Add a professional in-game User Documentation HTML page with quick guide, deep guide, and full unit/building compendium, accessible from both sidebar and tutorial window.
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
- [x] Add a unit under-attack notification for player-owned units that includes a clickable unit type link; clicking it smoothly focuses the camera on that unit and selects it.

- [x] Add F22 Raptor stealth fighter unit: spawns from airstrip, requires airstrip building, isAirUnit with radarInvisible, rocket ammo (20), fuel tank (8000), cost $8000, speed 8.0; integrates with helipad refuel/rearm logic on airstrip, production queue, tech tree unlock, AI production, and rendering with sidebar/map images.
- [x] Follow-up fix for F22 + Airstrip: corrected F22 airstrip spawn points, made F22 air movement/attack commands work (lift-off + flight plan handling), added build-only occupancy tiles with new buildable Street ($10), made airstrip tiles passable except blocked lower-left sub-rectangle (source rect below y=200 within x=0..480), and included F22 in Vehicle Factory speed scaling.
