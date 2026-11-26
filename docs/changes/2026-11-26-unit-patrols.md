# Features

- [x] **Looping unit patrols**
  Add patrol planning for all unit types, automatic enemy engagement, staggered shared routes, synchronized formations and persistent save/replay/network state.
  Spec: [Looping unit patrol routes](../../specs/118-unit-patrol-routes.md)
- [x] **Patrol automation unlock**
  Add the 2-star unit-control perk, a locked-menu shortcut focused on that perk, and typed CFBL patrol routes in text and graphical editors.
  Spec: [Looping unit patrol routes](../../specs/118-unit-patrol-routes.md)

Verification:

- `npm run lint:fix:changed` and `npm run lint` passed, including 6,096 unique test declaration IDs.
- `npm run test:unit -- --maxWorkers=2` passed all 411 files / 6,091 tests. Final focused patrol, command, combat, policy and C5 checks passed 116 tests; the final route, formation command, CFBL and command API rerun passed 152 tests.
- `npm run test -- --exclude 'tests/unit/**'` passed all 86 integration tests; unit coverage was run separately above to avoid a duplicate full run.
- The patrol, ground context and long-press Playwright files passed all 11 scenarios using installed Chromium and a fresh Vite server without HMR. A subsequent fresh run of the three patrol scenarios passed after the final naval targeting, transport and formation batching refinements. The unrelated full E2E suite was not run.
- `npm run build` passed, including prepared sprite verification and PWA generation. The generated `src/version.json` is restored rather than committed.
- Save/load, migration to schema 12, route replay, CFBL parsing/printing/execution, perk cost/focus, formation synchronization, naval/air validation and C5 flight retargeting have focused coverage.

No verified hardware GPU is available here. Hardware FPS acceptance remains pending on Patrick's GPU; see the spec's manual acceptance and performance protocol.
