- [x] **Bug: Mine layers and mine sweepers trigger their own mines**
  Mine layers and mine sweepers now drive across armed mines placed by their own faction without detonating them, and their routes no longer walk around those fields. Tanks and every other unit still trigger friendly mines, and enemy or unowned mines still explode under layers and sweepers, including while a sweeper is clearing them.
  Spec: none

Validation: `npm run lint` passed (5500 test declarations). `npm run test` passed all 5,583 unit and integration tests across 334 files. Playwright E00236 and E00237 passed; the rest of the Playwright suite was not run. Hardware GPU acceptance remains pending; no performance benchmarks were run.

Performance: detonation still does one indexed mine lookup per ground unit per simulation tick, plus a unit-type and owner compare with no allocation. Path requests copy options only for mine layers and sweepers. Center-based occupancy is unchanged.

Manual checks on dev:

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Own mines | Drive a mine layer and a mine sweeper, including one that is sweeping, across mines their faction placed. | Those mines stay armed and the vehicles keep their health. | 1: U05504 | 0 |
| T02 | Other units | Drive a friendly tank across the same field, then an enemy mine layer, then sweep an unowned mine. | The tank and the enemy layer detonate the field. The sweeper still clears the unowned mine. | 2: U05493, U05505 | 0 |
| T03 | Routing | Order a mine layer or sweeper through their own mine wall, and rally a new layer across one. Order a tank through the same wall. | Layers and sweepers cross. The tank still goes around or stops. | 2: U05506, U05507 | 0 |

- [ ] T01 Own mines on dev
- [ ] T02 Other units on dev
- [ ] T03 Routing on dev
