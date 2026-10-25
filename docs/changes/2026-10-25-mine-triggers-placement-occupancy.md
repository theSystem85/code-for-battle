- [x] **Bug: Mines trigger during movement through a tile**
  Ground units now check armed mine contact throughout movement, so enemies and friendly units crossing between path waypoints both trigger explosions. Arming mines invalidates cached paths so friendly units plan around armed mine fields as fixed obstacles. Factory rally routes now preserve unit ownership for the same avoidance checks.
  Spec: none

- [x] **Bug: Movable occupancy blocks construction**
  Building placement and placement overlay validation now reject tiles with movable occupancy, including wrecks, and allow construction again after that occupancy clears.
  Spec: none

Validation: `npm run lint:fix:changed` and `npm run lint` passed. `npm run test -- --maxWorkers=2` passed all 5,573 unit/integration tests across 333 files. Both focused Playwright tests (E00236, E00237) passed using system Chromium with `/tmp/mine-playwright.config.mjs` because the Playwright download host was blocked. The full Playwright suite was not run; browser coverage was limited to these changed-area regressions, and GPU/performance tests remain pending hardware acceptance. The initial sandboxed `npm run test:unit` encountered Git subprocess restrictions; the successful complete suite rerun used supported subprocess permission.

Performance: one indexed mine lookup per ground unit per simulation tick (500 units at 60 ticks/s = 30,000 lookups/s), independent of DPR. Placement adds one constant-time occupancy lookup per footprint/overlay tile, with no entity scans or allocations. Center-based unit occupancy and existing self-occupancy exclusions are preserved. Hardware GPU acceptance remains pending for Patrick on dev; no GPU benchmarks were run here.

Manual checks on dev:

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Mine contact | Send an enemy vehicle across a mine between distant waypoints; force a friendly vehicle across one too. | Armed mines explode and damage either party. | 1: U05493 (both parties) | 1: E00236 |
| T02 | Friendly routing | Order vehicles across friendly mine fields, including a factory rally order with a gap in the field. | Friendly paths avoid mine tiles and use the gap; enemy paths may cross the field. | 2: U05494, U05497 | 1: E00236 |
| T03 | Wreck occupancy | Try to place a building on a wreck, remove the wreck, then try again. | Occupied tiles show invalid placement and reject construction; cleared tiles allow it. | 2: U05495, U05496 | 1: E00237 |

- [ ] T01 Mine contact on dev
- [ ] T02 Friendly routing on dev
- [ ] T03 Wreck occupancy on dev
