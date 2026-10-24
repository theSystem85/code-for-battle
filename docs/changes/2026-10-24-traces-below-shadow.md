- [x] **Bug: traces below shadow of war**
  Render ground track marks after terrain and before the visibility overlay so fog obscures traces on both CPU and GPU terrain paths; preserve entity opacity settings.
  Spec: none

Validation: regression coverage checks terrain → traces → fog ordering and all three opacity levels. Hardware 75 FPS acceptance remains pending for Patrick on dev; this environment has no verified hardware GPU.

Manual verification: enable shadow of war, drive a tank across visible terrain, then move vision away. Tracks should dim with explored terrain and be covered in undiscovered terrain. Cycle entity opacity levels and confirm the existing trace opacity behavior.

E2E scope: ran `tests/e2e/airborneRenderLayering.test.js` with system Chromium. Both live rendering-order assertions passed; the final console-error assertion failed on a resource request reporting `net::ERR_TUNNEL_CONNECTION_FAILED`. The rest of the E2E suite and GPU benchmarks were not run.

Validation results: `npm run lint:fix:changed` and `npm run lint` passed. `npm run test:unit` was run; after correcting canvas fixtures, `npm run test -- --maxWorkers=2` verified the complete unit/integration suite: 5,525 passed, with four release-script tests blocked by sandbox Git subprocess permissions. Rerunning `tests/unit/releaseScript.test.js` with the required permissions passed all five tests, verifying all 5,529 cases across the full run and focused rerun. The 60 focused rendering tests passed. The Chromium E2E rendering assertions passed, but its console check failed on a resource request (`net::ERR_TUNNEL_CONNECTION_FAILED`); other E2E tests were skipped. No GPU benchmarks were run; hardware acceptance remains pending.
