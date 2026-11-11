# Bug fixes

- [x] **Hull-aware naval routing**
  Naval move orders, automatic route calculations and smoothing reserve half the ship's hull length plus a tile-sampling margin around coastlines and fixed obstacles. Clear-water orders take a direct route without A* expansion. Player orders to unsafe water destinations resolve to the nearest safe offshore point, which becomes the actual move target; strict AI candidate searches remain exact. Ships already near shore can escape with increasing clearance. Cached paths distinguish hull types and departure points.
  Spec: none
- [x] **Bounded recovery detours**
  A unit finishes or times out its current local detour before another is attempted; timeout removes only the remaining detour prefix, preserving the destination route. Naval detour deadlines account for the ship's rotation and travel speed. Repeated recovery can no longer accumulate old zigzags.
  Spec: none

# Improvements

- [x] **Water and unit occupancy colors**
  Water is yellow in the debug occupancy overlay; ground-unit and naval-unit center tiles are orange, including units sharing fixed occupancy. Ships remain excluded from the land collision grid. Naval overlay membership is refreshed from live unit centers using a reusable set.
  Spec: none

## Verification

New regressions fail in seven cases against unchanged `origin/dev` (3a01317e): unsafe coastal segments, unsafe offshore destination selection, cross-hull path-cache reuse, overlay colors, repeated detour stacking, and detour timeout cleanup. The baseline worktree includes the new clearance helper only to satisfy test imports; the original path planner does not call it.

Functional coverage includes all three major ship sizes, fractional self-occupancy centers, open-water direct orders, a two-segment headland route, shore-adjacent targets, departure from a shoreline pocket, path-cache separation, current overlay membership, and bounded recovery. Browser tests step the real command, pathfinding, rotation, collision, and movement systems at fixed simulation times while paused; they assert short routes, hull clearance, no collision/push/recovery, and permanent arrival. Existing ferry/hovercraft boarding is also checked.

The first full unit run also exposed an existing 98-sample alpha mismatch in `dtv7_nature_soil_large.webp`; unchanged `origin/dev` reproduces it. Regenerated that one existing WebP at quality 85 using `node scripts/build-map-sprite-sheets.mjs --name=dtv7_nature_soil_large`. Metadata remains byte-for-byte unchanged and its 21 source-sheet extraction checks now pass. No assertions were weakened.

Final validation:

- `npm run lint:fix:changed` and `npm run lint`: pass; all 5,764 test declarations have unique IDs.
- `npm run test:unit -- --maxWorkers=2`: executed during implementation; its final strict-cache regression exposed the reuse bug fixed in the final cache key. The subsequent complete `npm run test -- --maxWorkers=2` passes all **5,851 unit/integration cases in 372 files**, including all unit tests and that strict-cache regression.
- Focused final movement/pathfinding run: **218 cases pass** across five files.
- `npm run test:e2e -- tests/e2e/navalMovementRegression.test.js tests/e2e/navalTransportEmbarking.test.js tests/e2e/initialOrderOccupancy.test.js --config=/tmp/naval-playwright.config.mjs --project=chromium --reporter=line --workers=1`: **4 tests pass** (E00234, E00255, E00077, E00240). The temporary config uses installed `/usr/bin/chromium`; repository browser settings are unchanged. A prior run interrupted by Vite reloads during edits was discarded and repeated after edits stopped.
- Full Playwright suite was not run: it includes unrelated cases and opt-in GPU/performance tests. Browser verification is scoped to naval movement, transport boarding and command occupancy.
- `git diff --check`: pass.

## Manual checks on dev

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Open water | Order a carrier, battleship and destroyer to a distant clear-water point, starting with their bows facing away | Ships turn, take a straight route, and stop permanently without extra detours | 1: U07079 | 1: E00234 |
| T02 | Coastline | Order each ship around a headland, then click water immediately beside the coast | Short routes reserve turning room proportional to hull length; shore orders stop at a safe offshore point | 5: U07080, U07081, U07082, U07087, U07088 | 1: E00255 |
| T03 | Occupancy overlay | Enable the occupancy overlay and move a ground unit and ship | Empty water is yellow; occupied unit center tiles are orange and follow the units | 2: U05481, U07084 | 1: E00240 |
| T04 | Recovery | Block a ship so it attempts recovery and observe its route through a timeout | Only one local detour is active; old detours do not accumulate and the destination is preserved | 3: U05486, U07085, U07086 | 0 |
| T05 | Transport | Board ground units onto ferry and hovercraft | Existing coast approach and boarding continue to work | 0 | 1: E00077 |

- [ ] T01 Open-water route
- [ ] T02 Coastline and offshore arrival
- [ ] T03 Overlay colors
- [ ] T04 Recovery under real fleet congestion
- [ ] T05 Transport boarding


## Hot-loop review

Movement/avoidance state is checked once per simulation tick (60 Hz): at 200 units the new guard is 12,000 boolean checks/second; detour prefix removal occurs only on expiry, not every tick. Naval detour duration uses scalar distance/turn arithmetic only when creating a detour. Route clearance runs only when planning a path. Each queried tile's bounded obstacle distance is memoized for that request; hull offsets are sorted and cached by radius (bounded by ship types). Water orders with a clear line skip A* entirely. The path cache includes hull type and never reuses another departure point's shore-escape allowance.

The occupancy overlay runs only when enabled. At 200 units and 60 Hz it adds 12,000 center checks/second and reuses one set, with no per-tile entity searches. It changes the colors of existing tile fills and adds visible ship tiles without additional full-viewport layers. Device pixel ratio does not multiply simulation or membership work; existing overlay fill raster cost scales with backing pixels as before.

No verified hardware GPU is available. No GPU/performance benchmarks were run; the 75 FPS hardware acceptance remains pending for Patrick on dev.
