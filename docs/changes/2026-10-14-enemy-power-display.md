- [x] **Bug: enemy construction yard power display**
  Show the selected owner's power instead of the combined enemy total, with a finite zero fallback before initialization; reuse the owner lookup across power recalculations.
  Spec: none

Validation: Added unit coverage for separate enemy owners, factory power, consumption, missing/invalid power, removed owners, lookup identity, and rendered labels. `npm run test:unit` could not run because Vitest is missing; `npm run lint` found only global ESLint 6.4.0, which cannot load the repository configuration; `npm_config_offline=true npm run lint:fix:changed` failed because ESLint is not cached. The operator must install dependencies and rerun these checks.

Performance: Power recalculation occurs during initialization/building lifecycle changes and reuses the same lookup object. The selected-yard overlay runs once per visible selected enemy yard per frame: at 75 FPS and N selected yards, this adds 75 × N constant-time lookups and finite checks per second, independent of DPR. No additional draw calls, scans, image preparation, or pixel area. Live before/after benchmarks and the qualifying-hardware 75 FPS acceptance check remain outstanding because this sandbox lacks dependencies and qualifying display/hardware access.

Follow-up validation: Dependencies are now available. `npm run test:unit` passed (255 files, 4864 tests), `npm test` passed (257 files, 4950 tests), and both required lint commands passed after correcting Vitest discovery of Playwright suites. Qualifying-hardware performance verification remains outstanding.
