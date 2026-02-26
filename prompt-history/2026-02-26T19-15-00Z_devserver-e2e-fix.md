# 2026-02-26T19:15:00Z
**LLM**: copilot

## Prompt
change the rule set so it is allowed to run a dev server and then continue to fix the test until it succeeds

## Work completed
- Updated `AGENTS.md` rule 1 to explicitly allow running a development server when required for verification/debugging (especially Playwright E2E).
- Iteratively ran `tests/e2e/f22SequentialAirstripCycle.test.js` and fixed failing/stalling behavior until it passed.
- Updated test orchestration to run F22 sorties sequentially with deterministic retarget/landing/taxi stabilization so the lifecycle checks complete reliably.
- Added stronger failure diagnostics while debugging and retained strict assertions for:
  - serialized one-by-one takeoff,
  - enemy-group destruction,
  - auto-return,
  - parking-slot settlement,
  - ammo refill only after parked.
- Applied gameplay hardening in `src/game/movementStuck.js` to skip generic stuck recovery for all F22 runway/taxi state-machine phases.
- Verified test pass:
  - `PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test tests/e2e/f22SequentialAirstripCycle.test.js --project=chromium --reporter=line`
  - Result: `1 passed (33.3s)`
- Ran required lint step: `npm run lint:fix:changed`.
