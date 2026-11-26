# Features and improvements

- [x] **Ground unit tactical commands**
  Add reverse retreat destinations, workshop/base retreat, mobile route planning, nearby supply requests and building service/defend actions through the authoritative command path.
  Spec: [Ground unit radial commands and nested gestures](../../specs/117-ground-context-commands.md)
- [x] **Reusable gesture submenus and faster radial visuals**
  Add a 300 ms directional child fan, release activation and edge fitting to the shared radial menu; halve the default context hold and fly-out timing and refresh its visual style.
  Spec: [Ground unit radial commands and nested gestures](../../specs/117-ground-context-commands.md)

Verification:

- `npm run lint:fix:changed` and `npm run lint` passed; all 6,078 test declarations have unique IDs.
- `npm run test:unit -- --maxWorkers=2` executed all 410 unit files: 6,075 tests passed and the newly added long-route retreat test observed a cached pre-fix module. Fresh runs of all affected retreat/ground/replay files passed: 49 tests, including that regression and first-leg replay sequencing. The earlier combined `npm run test` attempt was superseded by complete separate unit and integration coverage after edits settled.
- `npm run test:integration` passed all 86 tests, including browser startup without console errors.
- The three affected Playwright files passed all 10 scenarios using system Chromium and a fresh Vite server with HMR/watch disabled. Earlier runs reused HMR-versioned modules and were discarded. The unrelated full E2E suite was not run.
- `npm run build` passed, including prepared sprite checks and PWA generation. No generated version file is included in the change.

The enemy AI test fixture now includes the controller state present in the real game. The original fixture's two unhandled joystick errors were reproduced on the unchanged baseline; the corrected fixture passes all 36 tests without those errors. The automation E2E fixture explicitly unlocks the prerequisites and checks policy creation.

Hardware performance acceptance remains pending on Patrick's GPU; this environment has no verified hardware GPU.
