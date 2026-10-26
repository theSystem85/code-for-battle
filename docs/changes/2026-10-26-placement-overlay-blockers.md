- [x] **Improvement: Build placement colors show range**
  Open footprint tiles are green when any tile of the footprint is inside that building's base range, orange when the whole footprint is outside it, and blocked tiles stay red. Shipyards use the same orange out-of-range preview and still need all-water plus a coast.
  Spec: [Shipyard Coastal Placement](../../specs/101-shipyard-coastal-placement.md)

- [x] **Bug: Buildings could be placed on cities and stones**
  Player placement and enemy placement search now treat living city buildings and stone decorations as blocked tiles, including every tile of a multi-tile footprint. A destroyed city can be built on again. Trees and other decorations stay buildable.
  Spec: none

Validation: `npm run lint:fix:changed` and `npm run lint` passed. `npm run test` passed 5687 tests. Three tutorial narration checks (U04500, U05490, U04501) failed on the existing welcome-step text, which does not match its recorded clip; those files were not part of this change. Playwright Chromium ran E00021, E00236, E00237 and E00078, all passed. E00079 failed in unchanged `productionQueue.js` because the fixture's build button is null. The rest of the Playwright suite was not run; it includes hardware-GPU benchmarks. Hardware GPU acceptance for the 75 FPS gate remains pending for Patrick on dev.

Performance: the placement overlay runs once per frame only while build placement mode is active, and only for that footprint (at most a 5×5 shipyard). Each tile does one layout-cell read. A stone's footprint is validated only when that cell is a stone. Enemy search uses the same check when it evaluates a candidate, not on the simulation tick. No per-frame object is rebuilt for ordinary land, and center-based unit occupancy is unchanged.
