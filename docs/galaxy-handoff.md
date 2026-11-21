# C-5 Galaxy airlift: handoff notes for Codex

Branch: `feat/c5-galaxy-airlift` (based on `dev` 2b112b61). Spec: `specs/140-c5-galaxy-airlift/spec.md`.
Codex runs so far: E `task_e_6b01b6f76d888328a8d43cdc6791a5f9`, F `task_e_6b0216d22de08328bc7a6f2948b5f6fe`,
G `task_e_6b021b50863c8328b962bdfc37bdc66f`, H `task_e_6b0222dab62c8328bd0c1b17e9d28c0e`.

This branch is **not playable yet**. Don't merge it into `dev` until every item below is done.
Never create image assets in code or with an image model: the approved art is in
`public/images/map/units/c5_galaxy_map.webp` and `public/images/sidebar/c5_galaxy_sidebar.webp`.
Draw the parachute procedurally on the canvas.

## What already works (covered by unit tests)
- Every unit has `weight` (in tons) and an `airliftable` flag (`docs/vehicle-weights.md`). C-5: $6000, about 300 HP, footprintTiles 3, renderScale 3.5.
- Weight-based cargo up to 122 t, with the "Too heavy: needs X t, Y t free (Z/122 t)" message (`src/game/c5Cargo.js`).
- Airdrop queue: 30-tick interval, 90-tick descent, invulnerable while falling, deterministic nearest-free-tile scan. Cargo dies with the aircraft.
- Full mission state machine in `src/game/c5GalaxySystem.js`: taxiOut → takeoffRoll → climb → airborne outbound → drop → return → approach → touchdown → taxiIn → grounded, parked in airstrip slots 0–2. `tests/unit/c5GalaxyIntegration.test.js` runs this end to end.
- Network commands `C5_LOAD`, `C5_UNLOAD` (with a deterministic ring-scan exit tile), and `C5_AIRDROP` (calls `startC5Mission`).
- The simulation tick now uses `gameState.frameCount`, not wall-clock time.

## Remaining must-fix items (from the 9-item list)
1. **Visible and moves:** verify in the browser that a produced C-5 appears at the airstrip, renders with the prepared sprites (`aircraft:c5Galaxy:flight` and `:ground`), and responds to normal selection and move orders.
2. **Buttons:** `#c5UnloadBtn` and `#c5AirdropBtn` in `index.html` exist but have no click handlers. Wire them to dispatch `C5_UNLOAD` and `C5_AIRDROP` through `gameCommandSync`. Airdrop needs a target-pick mode (the next map click sets the target). Show or hide the buttons when a C-5 is selected, and wire right-click boarding of ground units onto a grounded C-5.
3. **Flight to target:** the logic is done, but it's only reachable through the command. It becomes playable once item 2 is wired.
4. **Parachute rendering:** `renderC5Airdrop` (`src/rendering/c5AirdropRenderer.js`) is never called. Call it from the unit render pass for units with an active drop state.
5. **F-22 slot exclusion:** F-22 slot assignment in `src/utils/airstripUtils.js` / `src/game/movementF22.js` must skip `C5_LOWER_SLOT_INDICES` [0,1,2] whenever a C-5 belongs to that airstrip (or always). Add a test for this.
6. **Animations:** the phases exist in the logic. Make sure the renderer uses `altitude` and `shadow` (scale and offset) and the heading during taxi, roll, climb, approach, and touchdown.
7. **Deterministic tick:** done (`gameState.frameCount`). Also include `c5Mission`, `dropQueueState`, cargo ids, and slot reservations in saveGame, stateSync, and stateHash (check that they survive save/load and host→client sync).
8. **Integration test:** extend it to go through `updateGame`/the game loop and the command path (`C5_AIRDROP` → landed cargo), plus a save/load round-trip in the middle of a mission.
9. **Manual:** expand the C-5 entry in `public/docs/user-documentation.html` (production, weights and capacity, loading, unloading, airdrop, landing slots, cargo lost on destruction).

Validate with `npm run test:ids:assign && npm run lint && npm run test:unit && npm run build && npm run test:smoke`.
