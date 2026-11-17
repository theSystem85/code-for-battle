# Adaptive AI base defence

Classic AI construction decisions plan a perimeter around living land infrastructure, excluding walls, weapons and offshore shipyards from expansion bounds. Road crossings leave three-tile entrances. Road entrances nearest opponents receive clusters first: rocket turret, Tesla coil and artillery inside the concrete walls, gun turret outside. Clusters avoid roads and economic footprints. Maps without streets retain an opponent-facing exit.

Use normal budgets, power, radar requirements, build range, occupancy validation and construction/sale timers. Sell obsolete walls and progressively relocate obsolete weapons when infrastructure expands; never repeatedly refund selling buildings. Destroyed defences are eligible for replacement. Economic recovery and essential support construction retain priority. LLM strategic queues retain control of their own construction.

Planning runs at most once per six-second construction decision per AI, plus placement completion validation; it never runs per unit or render frame. Complexity scales with infrastructure, perimeter length and road crossings, not map area. No rendering changes. Hardware 75 FPS acceptance remains pending on qualifying hardware; no software GPU benchmarks run.

Validation: `npm run test:unit`, `npm run lint:fix:changed`, `npm run lint`; focused layout/construction tests in `tests/unit/baseDefence.test.js`.

Manual acceptance:

1. Give a classic AI an established economy (four harvesters and its first tank), radar and sufficient power/funds. Follow its road entrances: each cluster has a gun outside and rocket/Tesla/artillery behind the wall. Let construction finish and verify every buildable perimeter tile is walled except three-tile entrances.
2. Let production/support infrastructure expand past the old boundary. Old interior walls sell, obsolete weapons sell progressively, and construction follows the new perimeter. Roads remain clear.
3. Destroy perimeter walls and weapons. With sufficient funds and surviving prerequisites, the AI replaces them in their planned locations. Repeat with horizontal and vertical roads and multiple opponents.

Planning uses no render work and has no DPR multiplier. For a representative four AIs, 200 structures each and a 400-tile perimeter, slot matching is bounded to roughly 4 × 200 × 400 comparisons per decision cycle (plus shared placement validation); this is construction-cycle work rather than per-frame work. Hardware performance acceptance is still pending.

Verified: all 381 unit-test files / 5,884 tests pass. The production build, changed-file lint fix and full lint/test-ID checks pass. The full unit suite required subprocess permissions because sandboxed release-script tests could not spawn git. The build-through test covers both horizontal and vertical layouts with the real placement validator.
