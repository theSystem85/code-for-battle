2026-03-23T15:51:46Z
Model: GPT-5.2-Codex

User prompt:

The user was unsatisfied with the code that the agent previously produced, which can be found as the latest commit in the git history.

<PREVIOUS_PR_TITLE>
Fix game speed: decouple render FPS and drive simulation by fixed-step clock
</PREVIOUS_PR_TITLE>

<PREVIOUS_PR_DESCRIPTION>
### Motivation
- The sidebar game-speed control regressed: simulation advanced per-render delta so higher FPS sped up gameplay and various systems double-applied the speed modifier.  The change centralizes time scaling so game speed controls the simulation without changing render FPS. 
- Goal: ensure unit movement, production, harvest/unload, service actions, projectiles, airborne transitions, AI ticks, and rotations follow the sidebar speed while frame rendering remains unchanged.

### Description
- Added a small simulation time helper `src/game/time.js` and tracking fields on `gameState` (`simulationTime`, `simulationAccumulator`, `simulationStepMs`) to hold a canonical simulation clock. 
- Reworked the main loop (`src/game/gameLoop.js`) to use a fixed-step accumulator; the accumulator is scaled by `gameState.speedMultiplier` and the simulation advances in fixed steps while rendering stays tied to `requestAnimationFrame` (or frame limiter). 
- Switched core systems to read simulation time or fixed-step deltas: `updateGame` uses `getSimulationTime()`, production (`src/productionQueue.js`), bullets (`src/game/bulletSystem.js`), buildings (`src/game/buildingSystem.js`), and AI orchestrator (`src/enemy.js`, `src/ai/enemyAIPlayer.js`, `src/ai-api/applier.js`) now rely on simulation time rather than raw wall-clock or per-system speed division; removed duplicated speed scaling where applicable. 
- Production timers, pause/resume, serialization/restore logic are updated to use simulation time so build progress follows the simulation clock consistently. 
- Sidebar speed input now also listens to `input` events for immediate feedback while dragging (`src/game/gameOrchestrator.js`). 
- Added regression artifacts: `specs/055-game-speed-fixed-timestep.md`, `prompt-history/20260323T000000Z_game-speed-fix.md`, and a Playwright E2E `tests/e2e/gameSpeedControl.test.js` to validate game-time vs render-frame behavior. 

### Testing
- Ran linter autofix: `npm run lint:fix:changed` (completed). 
- Unit tests executed: `npm test -- tests/unit/gameLoop.test.js tests/unit/productionQueue.test.js`; both test files passed (all unit assertions green). 
- Added an E2E Playwright test `tests/e2e/gameSpeedControl.test.js` that verifies the sidebar speed input increases simulation progression while frame counts remain comparable; E2E run in this environment failed to start because Playwright browser binaries are not installed (`npx playwright install` is required), so the test was added but not executed here. 
- Notes: most gameplay-critical systems moved to the simulation clock and were covered by updated unit tests; a follow-up pass could convert remaining presentation/audio timers to simulation time if desired.
</PREVIOUS_PR_DESCRIPTION>

Please address any inline comments on the diff, as well as any additional instructions below.

You have not done anything please continue
