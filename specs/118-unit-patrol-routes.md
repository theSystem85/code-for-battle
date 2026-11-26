# Looping unit patrol routes

Patrol is offered in the circle menu for all commandable land, naval and air units.
It uses the existing route draft: map taps add points, and right-click, a two-finger tap or Enter
commits, two-finger dragging pans, and Escape/cancel/blur discard the draft.
Movement-domain validation is authoritative: land vehicles require passable land,
ships water, and aircraft may fly over any in-bounds tile. Blue numbered circles
mark waypoints, with arrows indicating direction on the draft and selected patrols.

- **Unlock:** Patrol Routes is a 2-star perk in the unit automation DO lane,
  requiring Unit Command Link. Its existing movement badge is reused. The menu
  action remains visible but disabled until owned. Activating that locked action
  never issues a patrol; with an operational Command Center it opens the command
  perk tree and centers, focuses and explains Patrol Routes. Without a center it
  explains what must be built. Existing all-unlocked mode bypasses the gate.
- **Loop:** two or more points repeat in the same order forever. Points are snapped
  to the movement tile centers. A single point adds the unit's current position;
  shared selections use their current center, falling back to a compatible member
  position if that center is impassable. Near-zero routes are rejected atomically.
- **Shared routes:** independent selected units depart at equally spaced fractions
  of the closed route's nominal travel time. Units with formation mode and the
  same group number form one cohort, retain their existing offsets, leave together
  and wait for all surviving cohort members at each waypoint. Other cohorts are
  staggered. Combat, fuel, terrain and collisions can affect actual travel times.
- **Combat:** acquire visible, targetable hostile units within effective weapon
  range automatically. Preserve the patrol destination while firing; combat must
  not replace the route with a chase path. Unarmed vehicles still patrol. Harvesters
  suspend ore automation during patrol, and C5 transports fly successive legs
  without returning to base between them.
- **Orders:** normal direct orders cancel patrol; internal next-leg orders do not
  count as new player orders or duplicate network broadcasts. Other movement,
  attack, service and stop automation orders can replace a patrol. Perks are checked
  again when accepting player/CFBL patrol commands, not only when opening the menu.
- **CFBL:** `patrol(route="10,10;20,10;20,20")` is a unit movement effect. The quoted
  semicolon-separated tile route is validated, printed, completed and editable in
  the graphical parameter UI. It supports one to 256 points. An ongoing loop has
  no finite completion-wait objective. All unit types can receive unit automations.
- **Persistence:** schema 12 adds optional patrol state and formation data. A pure
  migration marks old units as not patrolling without changing old orders. Saves,
  authoritative snapshots, player replay commands and automation replay retain the
  route, current leg, cohort and departure time.

## Performance ownership

The update runs once per simulation tick: at 100 active units and 60 ticks/s,
6,000 small state checks/s plus at most 400 enemy-acquisition passes/s (at most
800 bounded queries using reusable ground/air arrays). Quadtree queries avoid per-unit whole-army
scans. Cohort records and member arrays are reused after the first update and
expired cohorts are removed. Carrier wing lookups are indexed once per acquisition pass, with no per-carrier army scan; artillery ignores targets inside its minimum firing distance. Route normalization, nominal loop-length calculation
and validation occur only on orders. Pathfinding only runs on new legs or bounded
one-second retries, and arrival immediately releases the next leg. The route overlay draws one
numbered circle and short arrow per waypoint in the existing renderer. Units with a
shared route array draw once per frame. At DPR 3, the marker and line strokes cover
more pixels while simulation work stays the same. Unit snapshots add optional route fields to the
existing serialization cadence, with no new per-frame deep clone.

Hardware acceptance remains pending: no hardware GPU is verified here. Patrick
should exercise 100 patrolling units, mixed aircraft/naval groups, formations,
firing and fast full-map scrolling at unchanged visual settings/DPR on dev, and
record the 75 FPS gate, frame-time p95/p99/max, missed deadlines, CPU update/render
time, GPU timing where available and memory/GC. Functional tests are not GPU/FPS
certification.

## Verification

Run lint/fix, all unit and integration tests, and the patrol browser scenarios.
The managed environment uses the installed Chromium and a fresh temporary Vite
configuration with HMR disabled, preventing duplicate module instances in fixtures.
Record final commands/results and environment limits in the change note.

## Manual acceptance on dev

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Perk and locked menu | With a Command Center, select a unit and activate locked Patrol, then purchase Patrol Routes | The tree centers/focuses that perk; purchase costs two additional stars and enables Patrol | 3: U07386, U07389, U07390 | 1: E00286 |
| T02 | Single-point loop | Plan one patrol point and finish with a two-finger tap | Current position becomes the return point; the unit repeatedly travels both legs | 2: U07380, U07381 | 1: E00286 |
| T03 | Shared route | Select independent units, plan the same loop and commit | Departure times are evenly spaced by nominal closed-route travel time | 1: U07382 | 1: E00287 |
| T04 | Formation | Include two members of one active formation plus independent units | Formation members depart together, preserve offsets and wait at waypoints | 1: U07383 | 1: E00287 |
| T05 | Combat | Put visible hostiles near the route, including artillery min-range and carrier cases | Targetable enemies are engaged automatically while the route continues | 2: U07384, U07394 | 1: E00286 |
| T06 | CFBL | Use the documented two-state example after unlocking; try an invalid route | Valid patrol executes through the API; malformed and domain-blocked routes are rejected | 2: U07385, U07387 | 1: E00288 |
| T07 | Save/replay | Save a delayed formation patrol, load it, and replay a patrol command | Route, leg, offsets and departure timing survive; legacy saves remain idle | 3: U07388, U07392, U07393 | 0 |
| T08 | C5 | Patrol a transport through several points, then replace the order | It stays airborne between legs; cancelling a holding patrol permits a return/next order | 1: U07391 | 0 |

- [ ] T01 Perk unlock and focus
- [ ] T02 Single-point route
- [ ] T03 Shared departures
- [ ] T04 Formation route
- [ ] T05 Automatic combat
- [ ] T06 CFBL patrol
- [ ] T07 Persistence and replay
- [ ] T08 C5 routing
- [ ] Qualifying hardware FPS acceptance
