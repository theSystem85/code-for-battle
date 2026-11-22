# C-5 Galaxy airlift: handoff notes for Codex

Branch: `feat/c5-galaxy-airlift` (based on `dev` 2b112b61). Spec: `specs/140-c5-galaxy-airlift/spec.md`.
Codex runs so far: E `task_e_6b01b6f76d888328a8d43cdc6791a5f9`, F `task_e_6b0216d22de08328bc7a6f2948b5f6fe`,
G `task_e_6b021b50863c8328b962bdfc37bdc66f`, H `task_e_6b0222dab62c8328bd0c1b17e9d28c0e`.

This branch is **not playable yet**. Don't merge it into `dev` until every item below is done.
Use the approved aircraft art in `public/images/map/units/c5_galaxy_map.webp` and
`public/images/sidebar/c5_galaxy_sidebar.webp`. The [spec](../specs/140-c5-galaxy-airlift/spec.md)
records Patrick’s decisions from 2026-11-22 and governs follow-up work. The parachute canopy
requires a dedicated Grok Imagine asset. Render the suspension lines dynamically.

## Current prototype (covered by unit tests)
- Every unit has `weight` (in tons) and an `airliftable` flag (`docs/vehicle-weights.md`). The prototype still costs 6,000. The approved cost is 4,000.
- Weight-based cargo up to 122 t, with the "Too heavy: needs X t, Y t free (Z/122 t)" message (`src/game/c5Cargo.js`).
- Airdrop queue: 30-tick interval, 90-tick descent, invulnerable while falling, deterministic nearest-free-tile scan. Cargo still aboard dies with the aircraft. The spec also requires wrecks on the ground.
- Full mission state machine in `src/game/c5GalaxySystem.js`: taxiOut → takeoffRoll → climb → airborne outbound → drop → return → approach → touchdown → taxiIn → grounded, parked in airstrip slots 0–2. `tests/unit/c5GalaxyIntegration.test.js` runs this end to end.
- Network commands `C5_LOAD`, `C5_UNLOAD` (with a deterministic ring-scan exit tile), and `C5_AIRDROP` (calls `startC5Mission`).
- The simulation tick now uses `gameState.frameCount`, not wall-clock time.

## Remaining work
1. **Visible and moves:** verify in the browser that a produced C-5 appears at the airstrip, renders with the prepared sprites (`aircraft:c5Galaxy:flight` and `:ground`), and responds to normal selection and move orders.
2. **Controls and cargo display.** Match the hovercraft’s reciprocal left-click boarding and move-into cursor. Animate boarding. Support cancelling boarding and grounded unloading from the context menu on a free gathering tile. Show cargo in the hovercraft-style display, with weight in tonnes. Wire exact-tile airdrop targeting through `gameCommandSync`.
3. **Flight to target:** the logic is done, but it's only reachable through the command. It becomes playable once item 2 is wired.
4. **Parachute rendering.** Wire the drop renderer into the unit render pass. Draw four canopies per vehicle with dynamic suspension lines, wind, and slow rotation around the cargo as specified in FR-012.
5. **F-22 slot exclusion:** F-22 slot assignment in `src/utils/airstripUtils.js` / `src/game/movementF22.js` must skip `C5_LOWER_SLOT_INDICES` [0,1,2] whenever a C-5 belongs to that airstrip (or always). Add a test for this.
6. **Animations:** the phases exist in the logic. Make sure the renderer uses `altitude` and `shadow` (scale and offset) and the heading during taxi, roll, climb, approach, and touchdown.
7. **Deterministic tick:** done (`gameState.frameCount`). Also include `c5Mission`, `dropQueueState`, cargo ids, and slot reservations in saveGame, stateSync, and stateHash (check that they survive save/load and host→client sync).
8. **Integration test.** Extend it to go through `updateGame`/the game loop and the command path (`C5_AIRDROP` → landed cargo), plus a save/load round-trip in the middle of a mission.
9. **Manual.** Expand the C-5 entry in `public/docs/user-documentation.html` to cover production, cargo rules, controls, airdrops, parking, and cargo damage.
10. **Approved gameplay settings.** Apply the production stats and range, cargo eligibility, three-tile drop spread, water restriction, anti-air damage during descent, and ground wrecks for destroyed onboard cargo.
11. **Other v1 requirements.** Add late-join descent state, the `c5` cheat-spawn name, and dedicated sounds.

Validate with `npm run test:ids:assign && npm run lint && npm run test:unit && npm run build && npm run test:smoke`.
