# Vitest Testing Framework Specification

## Overview
Vitest is integrated for headless unit and integration testing without video, audio, or rendering.

## Configuration

### Vitest Config (`vitest.config.js`)
- **Environment**: jsdom (DOM simulation for browser APIs)
- **Globals**: true (describe, it, expect available without imports)
- **Setup Files**: `tests/setup.js`
- **Coverage**: v8 provider with HTML/text/JSON reporters

### Test Setup (`tests/setup.js`)
Mocks the following browser APIs:
- `window.Audio` - No-op audio
- `window.HTMLMediaElement` - No-op video/audio elements
- `document.createElement('canvas')` - 2D context with mock drawing methods
- `HTMLCanvasElement.prototype.getContext('webgl')` - Mock WebGL context
- `window.localStorage` - In-memory key-value store
- `window.matchMedia` - Mock media query responses
- `window.logger` - Console proxy for game logging

## Test Utilities (`tests/testUtils.js`)

### Exports
- `createTestMapGrid(width, height)` - Create clean 2D tile grid
- `resetGameState()` - Reset gameState to initial values
- `createTestFactory(x, y, owner, mapGrid)` - Create construction yard
- `createTestBuilding(type, x, y, owner, mapGrid)` - Create any building
- `TestGameContext` class - Full test context with game loop simulation
- `chebyshevDistance(x1, y1, x2, y2)` - Distance helper
- `getMaxBuildingGap()` - Returns MAX_BUILDING_GAP_TILES
- `getBuildingData(type)` - Access building definitions

### TestGameContext Methods
- `addFactory(x, y, owner)` - Add construction yard to context
- `addBuilding(type, x, y, owner)` - Add building to context
- `canPlaceBuilding(type, x, y, owner)` - Check placement validity
- `isNearBuilding(x, y, owner)` - Check proximity to buildings
- `runTicks(ticks, deltaMs, onTick)` - Simulate game loop ticks
- `cleanup()` - Reset test state

## Module Architecture (Circular Import Fix)

### Problem
Importing from `buildings.js` triggers full module chain including `main.js` and the benchmark runner, which requires DOM and rendering context.

### Solution
Extract pure data and validation functions into separate modules:

1. **`src/data/buildingData.js`**
   - Contains building definitions (type, dimensions, health, power, etc.)
   - Minimal dependencies: only config constants
   - Used by: buildingPlacement.js, buildings.js, testUtils.js

2. **`src/validation/buildingPlacement.js`**
   - Contains: `canPlaceBuilding()`, `isNearExistingBuilding()`, `isTileValid()`
   - Depends on: config.js, data/buildingData.js
   - Used by: buildings.js, testUtils.js

3. **`src/buildings.js`**
   - Re-exports from data and validation modules
   - Provides wrapper for canPlaceBuilding that injects gameState.mapEditMode
   - Backwards compatible - existing imports continue to work

## NPM Scripts
- `npm test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run with coverage report
- `npm run test:smoke` - Load the game in a headless jsdom browser and fail on console errors

## Test Structure

### Integration Tests
Located in `tests/integration/`

Example: `buildingPlacement.test.js`
- Tests building placement near construction yards
- Covers 0, 1, 2, 3 tile gaps (MAX_BUILDING_GAP_TILES = 3)
- Includes negative tests for invalid placements
- Simulates game loop ticks without rendering

Example: `browserConsoleSmoke.test.js`
- Loads `index.html` into a jsdom document
- Imports `src/main.js` to boot the game entrypoint
- Stubs `fetch` to avoid asset download errors during smoke runs
- Fails the test if any `console.error` output occurs during startup

### Unit Tests
Located in `tests/unit/`
- Test individual functions in isolation
- No game state required
- Helipad logic unit tests validate fuel/ammo replenishment and landing/refuel flows without rendering dependencies.
- Enemy AI building placement tests validate defensive placement direction, spacing rules, and input guardrails with mocked dependencies.
- Enemy AI coverage includes `enemySpawner.test.js` verifying spawn placement, harvester ore targeting, crew/gas initialization, and cheat-system integration.
- Added enemyUnitBehavior AI tests covering crew recovery, ambulance routing, harvester hunter reactions, base defense, and apache retreat logic.
- Enemy AI strategy tests cover repair prioritization, retreat decisions, group attack coordination, crew recovery, and logistics resupply workflows.
- Added AI unit coverage in `tests/unit/enemyAIPlayer.test.js` for economy recovery, building completion, and production spawn selection.
- Added `tests/unit/commandSync.test.js` coverage for game command sync behaviors including host/client routing, lockstep initialization, and broadcast validation.
- Added `tests/unit/mouseHandler.test.js` covering input selection flows, force/guard commands, hover range calculations, and context menu cancellations with mocked dependencies.
- Cheat system tests cover input parsing, spawn placement, minefield deployment, and selection-based state updates in `tests/unit/cheatSystem.test.js`.

### Game System Tests
- `tests/unit/buildingSystem.test.js` now includes coverage for `src/game/buildingSystem.js`, focusing on sell/destruction flows, defensive turret firing, and Tesla coil timing effects.
- These tests mock audio, timing, and rendering dependencies to keep unit tests deterministic while asserting meaningful gameplay state changes.
- Building system unit tests should mock `hasLineOfSightToTarget` from `src/logic.js` to keep turret line-of-sight behavior deterministic.

#### Game State Manager Coverage
- Added `tests/unit/gameStateManager.test.js` with focused scenarios for scrolling inertia, ore spread rules, particle cleanup, destruction cleanup, and win/loss conditions.

## Best Practices

1. **Use TestGameContext for integration tests**
   - Provides isolated game state per test
   - Handles cleanup automatically

2. **Import from validation module for pure function tests**
   - Avoids triggering game initialization
   - Faster test startup

3. **Mock external dependencies in setup.js**
   - Audio, Canvas, localStorage already mocked
   - Add new mocks as needed

4. **Use realistic test data**
   - Match actual building dimensions
   - Use valid map coordinates

5. **Mock render/audio dependencies in loop tests**
   - Unit tests for `GameLoop` should mock rendering, audio, and lockstep helpers.
   - Assert behavior through game state changes and scheduled frame calls rather than DOM rendering.


## Recent Coverage Additions
- Added unit tests targeting low-coverage core modules (main.js, inputHandler.js, updateGame.js, saveGame.js) with meaningful command handling, input guardrails, and autosave flows.
- Expanded `tests/unit/bulletSystem.test.js` to exercise `updateBullets()` and `fireBullet()` with mocked side effects and real collision geometry inputs.
- Added bullet system coverage for apache rocket proximity damage, dodge maneuvers, critical damage sounds, and rocket tank homing fallbacks.
- Added `tests/unit/multiplayerStore.test.js` covering invite token lifecycle, host regeneration, and party ownership events in multiplayer sessions.
- Added `tests/unit/webrtcSession.test.js` coverage for ICE handling edge cases, data channel state updates, and lockstep initialization guardrails.
- Added `tests/unit/peerConnection.test.js` to validate remote connection offer publishing, ICE handling, data channel messaging, and polling failure behavior with mocked WebRTC primitives.
- Added `tests/unit/multiUnitInputHandler.test.js` to validate multi-unit command distribution, queue behavior, and eligibility filtering helpers.
- Added `tests/unit/controlGroupHandler.test.js` to validate control group assignment, selection filtering, and camera centering behavior on double-press.
- Added `tests/unit/helpSystem.test.js` to validate help overlay creation, DOM toggling, and pause-state interaction in jsdom.
- Added `tests/unit/selectionManager.test.js` to cover selection toggles, double-click behavior, drag selection, and cleanup of destroyed units.
- Added `tests/unit/keyboardHandler.test.js` to cover escape handling, alert/sell/repair mode toggles, dodge pathing, control groups, and stop-attacking behavior.
- Added `tests/unit/cursorManager.test.js` covering cursor class selection, range display UI, and blocked-terrain handling for input feedback.
- Expanded high-coverage suites (Task 16.1-16.10) to cover config override helpers, asset preload gating, map editor render scheduling, retreat stuck/target range handling, benchmark error paths, ambulance command delegation, artillery turret firing, map scroll guardrails, hospital AI healing progression, and mine damage broadcasts.
- Expanded unit tests for recovery tank towing/recycling, remote control aiming/firing, unit movement pathing, selection manager edge cases, lockstep peer handling, multiplayer store state helpers, remote connection candidate validation, deterministic state hashing, enemy AI building fallback placement, and logger downloads.
- Added `tests/unit/enemyStrategies.test.js` cases for AI attack path recalculation, ambulance queueing, tanker emergencies, and ammo recovery state resets.
- Expanded `tests/unit/workshopLogic.test.js` to validate repair funding sources, restoration rally selection, and spawn fallback handling.
- Extended `tests/unit/keyboardHandler.test.js` with occupancy map toggles, control group rebuilds, and building stop-attack flows.
- Extended `tests/unit/cheatSystem.test.js` with god mode, ammo/helipad load, AI budget, and damage prevention scenarios.
- Extended `tests/unit/cursorManager.test.js` to cover guard mode, move-into targets, and cursor refresh behaviors.
- Added `tests/unit/commandQueue.test.js` coverage for mine deployment commands and sweeper detonation flows.
- Added `tests/unit/gameLoop.test.js` coverage for pause/resume audio handling, lockstep accumulator caps, and scheduling guardrails.
- Added `tests/unit/harvesterLogic.test.js` coverage for manual target cleanup, stuck recovery, stale reservations, and enemy repair routing.
- Added `tests/unit/gameFolderUnitCombat.test.js` coverage for ammo warnings and rocket burst firing.

## Example Test

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TestGameContext, getMaxBuildingGap, getBuildingData } from '../testUtils.js'

describe('Building Placement', () => {
  let ctx

  beforeEach(() => {
    ctx = new TestGameContext({ mapWidth: 50, mapHeight: 50 })
    ctx.addFactory(25, 25, 'player')
  })

  afterEach(() => {
    ctx.cleanup()
  })

  it('should allow building adjacent to construction yard', () => {
    const cyWidth = getBuildingData('constructionYard').width
    const result = ctx.canPlaceBuilding('powerPlant', 25 + cyWidth, 25)
    expect(result).toBe(true)
  })

  it('should reject building too far from construction yard', () => {
    const maxGap = getMaxBuildingGap()
    const cyWidth = getBuildingData('constructionYard').width
    const result = ctx.canPlaceBuilding('powerPlant', 25 + cyWidth + maxGap + 1, 25)
    expect(result).toBe(false)
  })
})
```

## 2026-02 Smoke Test Stability Update
- Updated `tests/setup.js` to patch `HTMLCanvasElement.prototype.getContext` in addition to `document.createElement('canvas')` so pre-existing canvases from static HTML are mocked consistently in jsdom.
- This prevents jsdom "Not implemented: HTMLCanvasElement's getContext()" noise during `npm run test:smoke` while keeping rendering behavior deterministic.

## Maintenance Note (2026-03-25)
- Smoke startup tests depend on conflict-free source parsing. A single unresolved git merge marker in startup imports (e.g. `src/game/gameOrchestrator.js`) causes Rollup parse failure before runtime assertions execute.
