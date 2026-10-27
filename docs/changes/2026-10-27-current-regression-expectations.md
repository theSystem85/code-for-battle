- [x] **Bugfix: stale aircraft and tutorial regression expectations**
  Exercise the current landing-spot command, verify TTS for changed tutorial scripts while retaining exact-recording checks for other steps, and stabilize the aircraft browser fixture with explicit land, camera, pause and selection state.
  Spec: none

Validation: `npm run test -- --maxWorkers=4` passed all 5,748 unit/integration tests. The initial full unit run encountered one UI timeout under concurrent browser load; its isolated rerun and the subsequent full run passed. Targeted browser coverage passed for the aircraft command guard and tutorial input selection on desktop and phone (three tests). `npm run lint:fix:changed` and `npm run lint` passed. Full Playwright coverage was not run.

This follow-up resolves the four pre-existing unit failures recorded in the background-update handoff spec. It changes test coverage and fixtures only; runtime gameplay and the recorded audio metadata are unchanged.
