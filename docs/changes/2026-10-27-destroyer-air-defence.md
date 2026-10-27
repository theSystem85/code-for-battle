- [x] **Feature: Destroyer air defence**
  Destroyers automatically fire heavy homing rockets at nearby airborne enemies alongside their cannon, with half the rocket turret sustained damage.
  Spec: [Destroyer air defence](../../specs/055-destroyer-air-defence.md)

Hardware 75 FPS acceptance pending on Patrick's GPU.

Browser check attempted: `npx playwright test tests/e2e/rocketTurretApacheBurst.test.js --project=chromium --reporter=line`; blocked by missing Chromium. Browser installation was denied by network policy (`cdn.playwright.dev`, HTTP 403 Domain forbidden). Full browser suite not run; no GPU/performance benchmarks run.

Validation: full `npm run test:unit` yielded 5662 passes and four sandbox Git subprocess denials; all five release-script tests passed on a targeted rerun with executor network permission. All 5666 unit cases are therefore covered. Four new destroyer tests pass. `npm run test -- --exclude 'tests/unit/**'` passed all 86 integration tests on rerun (initial run had a transient terrainStaging budget exception; standalone smoke also passed on untouched dev). The redundant combined unit/integration run was stopped after the unit suite had already completed. `npm run lint:fix:changed`, `npm run lint`, and `npm run build` passed.

Updated to dev's concurrent terrain-scroll recovery fix before delivery. Rechecked destroyer air defence, terrain cache unit tests and the complete integration directory together; all passed. Lint and stable test IDs were rechecked after updating.
