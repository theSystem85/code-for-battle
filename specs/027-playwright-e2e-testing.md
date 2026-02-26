# Spec 027: Playwright E2E Testing Framework

## Overview
Setup and integration of Playwright for end-to-end (E2E) testing of the RTS game. This enables testing the game flow from a real user perspective, including UI interactions, building construction, unit production, and game mechanics.

## Goals
1. Enable E2E testing with Playwright
2. Create reproducible tests using fixed map seeds
3. Test complete game flows (building, production, unit commands)
4. Catch console errors and regressions automatically
5. Integrate with CI pipeline

## Policy Update (2026-02-26)
- For every implemented bugfix or feature, add a meaningful E2E regression/validation test in the same task.
- Required workflow: implement code change first, then implement E2E test, run it, and continue improving code/test until it passes.
- E2E tests must remain behavior-driven and meaningful; do not weaken assertions to force a pass.

## Implementation Details

### Dependencies
- `@playwright/test` - Playwright test runner
- Chromium browser (installed via Playwright)

### Configuration
- Located in `playwright.config.js`
- Uses Vite dev server on port 5173
- Default browser: Chromium
- Captures screenshots and video on failure
- Trace enabled on retry for debugging

### NPM Scripts
```json
"test:e2e": "playwright test"
"test:e2e:ui": "playwright test --ui"
"test:e2e:headed": "playwright test --headed"
"test:e2e:debug": "playwright test --debug"
"test:e2e:file": "playwright test --project=chromium"
```

### Test Location
- Tests stored in `tests/e2e/`
- Naming convention: `*.test.js`

## Test: basicGameFlow.test.js

### Scenario
Simulates a human player building a base and producing units:

1. **Start Game** - Load game with seed 11 for reproducibility
2. **Build Power Plant** - Click button, wait for production, place on map
3. **Build Refinery** - Same flow as power plant
4. **Build Vehicle Factory** - Required for unit production
5. **Produce Harvester** - Switch to units tab, build harvester
6. **Produce Tank** - Build a tank unit
7. **Command Tank** - Select and move to ore field

### Assertions
- No console errors during gameplay
- Money correctly deducted after each build
- Buildings created and counted in game state
- Units spawned and counted in game state
- Game continues running without crashes

### Technical Details
- Uses `data-building-type` and `data-unit-type` attributes for button selection
- Waits for `ready-for-placement` class on building buttons
- Accesses `window.gameState` for verification
- Filters out non-critical console errors (favicon, network issues)
- Close tutorial/benchmark overlays if present and read money from `#moneyText` (desktop) or `#mobileMoneyValue` (mobile)

## Map Seed
- Fixed seed: 11
- Ensures consistent map generation for reproducible tests
- Player base and ore field locations are predictable

## Future Enhancements
1. Add more test scenarios (combat, multiplayer, save/load)
2. Add visual regression tests
3. Integrate with GitHub Actions CI
4. Add performance benchmarking tests
5. Add mobile viewport tests

## Test: apacheAutoReturnHelipad.test.js

### Scenario
Validates Apache auto-return with a cheat-accelerated setup to keep runtime minimal:

1. Spawn a helipad via cheat near cursor.
2. Spawn one Apache and command landing on that pad.
3. Force takeoff and move Apache slightly away from the pad.
4. Set Apache ammo to 1 via cheat.
5. Spawn one enemy tank via cheat near Apache.
6. Command Apache to attack that tank.
7. Verify Apache lands back on helipad when ammo is depleted.
8. Verify Apache refills on pad and auto-resumes attack against same target.

### Assertions
- Apache successfully lands on commanded helipad.
- Apache damages target before returning to pad.
- Auto-return state captures helipad + attack target.
- Apache takes off automatically after reload and resumes attacking same target.
- No critical console/page errors.

## Test: f22SequentialAirstripCycle.test.js

### Scenario
Validates multi-F22 airstrip sequencing and full attack-return lifecycle:

1. Spawn one player-owned airstrip via cheat and initialize 3 F22 on parking slots.
2. Spawn 3 enemy target groups (2 units each) near the airstrip runway exit area.
3. Run sorties sequentially: each F22 takes off, attacks its assigned group, returns, lands/parks, and refills before the next F22 launches.
4. Verify takeoff starts are serialized and ordered one-by-one.
5. Verify automatic RTB flow after assigned-group combat completion.
6. Verify all 3 F22 settle into valid airstrip parking slots.
7. Verify ammo refill is observed only after each unit is fully parked (never during taxi/landing movement states).

### Assertions
- Takeoff order matches the queued order of the 3 parked F22.
- Takeoff timestamps are strictly increasing to prove serialized starts.
- All assigned enemy groups are destroyed.
- All F22 end in `flightState=grounded`, `f22State=parked`, with occupied-slot mapping consistency.
- No ammo increase occurs while any F22 is in non-parked states.
- Ammo refill increase is observed after parked settle for each F22.
- No critical console/page errors.

## Files Modified
- `package.json` - Added E2E test scripts
- `playwright.config.js` - New Playwright configuration

## Files Created
- `tests/e2e/basicGameFlow.test.js` - First E2E test
- `tests/e2e/f22SequentialAirstripCycle.test.js` - F22 sequential takeoff/attack/return/parking/refill regression test

## Related Specs
- 023-vitest-testing-framework.md - Unit testing framework
- 024-ci-pr-checks.md - CI integration
