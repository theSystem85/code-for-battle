# Ground unit radial commands and nested gestures

All locally commandable ground units, including logistics vehicles and harvesters, expose Retreat to, Retreat to base, Plan path and Call supply. Aircraft, naval units, transported units and foreign units are excluded from these orders. Existing unit-target interactions remain available.

- Retreat to orders a reverse retreat to the circle menu's opening tile. Shift-click orders the same retreat directly. Keep the current live target, fire within that unit's effective range, and follow the calculated movement path around obstacles without chasing. A new direct order cancels retreat. Destination retreats continue after their target dies and are not cut short by the legacy 30-second tactical-retreat limit. Retreat state, path and reverse steering survive save/replay through existing entity serialization and recorded retreat commands.
- Retreat to base prefers a friendly operational Vehicle Workshop's free service perimeter. Without a workshop, choose a passable point on the rear of a friendly base, opposite the nearest enemy structure. An unavailable base or unreachable destination produces feedback instead of an order.
- Plan path captures the ordered selection and displays numbered blue circles connected by lines. Tap valid ground to append up to 256 points. Do not move units until committing. Right-click or a stationary two-finger tap commits the route to the same move-command queue as Option-click. A two-finger drag pans without committing. Enter also commits; Escape, pointer cancellation, blur, an interaction lock or leaving the map cancels the draft. Normal multitouch cancellation remains in force outside planning.
- Call supply has Ammo, Repair, Gas and Crew children. Hold over the parent for 300 ms to fan children in the pointer's approach direction. Continue the same drag and release over a child to activate. Rotate/narrow the fan near viewport edges, keeping hit areas separated. Disabled choices cannot execute; capability and ownership are revalidated when dispatching. Call the closest eligible owned provider for each selected recipient, batching shared providers through the existing priority utility queue. Do not spawn providers or order the recipients to move.
- The shared radial menu accepts `children` on any item and supports nested hover fans, cancellation, disabled states, activation on release and action callbacks opening a subsequent menu. It remains reusable by production, policies and other context menus.
- On a friendly operational building with ground units selected, expose Defend building plus applicable services: workshop repair, gas station fuel, hospital crew, ammunition factory ammo, refinery unloading for harvesters. Existing service systems perform transfers after arrival. Guard orders retain the building reference, go to a free perimeter point, and respond to the building's attackers.
- Default map hold is 250 ms (formerly 500); default fly-out is 110 ms and stagger 20 ms (formerly 220/40). Preserve explicit user hold preferences, accepting 150–5000 ms. Use a metallic blue/teal style, bright active outlines, submenu indicators and reduced-motion support.

## Performance gate

Menus, fan layout, service/provider searches, base searches and draft edits run on input events or command submission. Fan layout evaluates at most 48 orientations for four supply choices; work is independent of entity count and DPR. The renderer draws at most 256 points for the active draft, with one small marker and one thin segment per point. The world-space route stays in sync with camera movement between input events.

Reverse steering and building guard handling run once per affected entity per simulation tick. At 100 active retreating ground units and 60 ticks/s, the extra constant-time steering checks run at most 6,000 times/s; they perform scalar math, preserve path/state identity, and introduce no entity scans, Sets, Maps or per-tick objects. The new path-based retreats skip the legacy full-line obstacle/unit scan and rely on the calculated path and existing collision handling. Building guards retain their issued perimeter path and skip repeated guard pathfinding. Guard overlay changes add only coordinate arithmetic to existing boundary strokes: at 100 selected guards, at most 100 line/icon paths/frame; DPR 3 changes existing raster area but adds no range-sized fill or image resizing.

Qualifying hardware acceptance remains pending. No hardware GPU has been verified in this environment; functional browser tests must not be used as FPS evidence. Patrick should verify the repository's 75 FPS gate on dev using fast full-map scrolling, realistic unit counts, active reverse paths, selected building guards, firing effects and procedural water at unchanged settings and actual DPR. Record frame-time p95/p99/max, missed deadlines, CPU update/render time, GPU timing where available, and memory/GC.

## Functional verification

- `npm run lint:fix:changed` and `npm run lint`
- `npm run test:unit` and `npm run test`
- `npm run test:e2e -- tests/e2e/groundContextActions.test.js tests/e2e/unitContextActions.test.js tests/e2e/longPressMapActionMenu.test.js --project=chromium`

The managed environment uses system Chromium through a temporary Playwright config because the downloaded Playwright browser is unavailable. A local server requires the supported sandbox permission mechanism. Final results and any environment limitations are recorded in the change note.

Supply requests remain available for selected recipients missing a commander: the provider receives the order. Movement orders still require a living commander.

## Manual acceptance on dev

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Retreat destination | Select ground vehicles, hold on valid ground and release over Retreat to, or Shift-click valid ground | Vehicles reverse along their route and keep firing at the current in-range target | 2: U07362, U07377 | 1: E00283 |
| T02 | Base retreat | Try Retreat to base with and without a workshop | Destination is near the workshop or behind the base | 1: U07363 | 0 |
| T03 | Planned route | Choose Plan path, tap several points, pan with two fingers, then two-finger tap | Draft points stay visible during pan; units start only after finalizing | 3: U07364, U07372, U07373 | 1: E00285 |
| T04 | Supply gesture | Hold, drag over Call supply for 300 ms, continue to Gas and release | One continuous gesture dispatches the closest eligible friendly tanker | 3: U07365, U07367, U07368 | 1: E00284 |
| T05 | Building actions | Hold over each service building with ground units selected; choose a service or Defend | Appropriate building interaction appears; defenders stay near the building | 1: U07366 (4 cases) | 1: E00283 |
| T06 | Menu polish | Open menus near each screen edge and try short holds | Default hold is 250 ms; child fans remain on screen with distinct hit areas | 2: U07370 (4 cases), U07371 | 1: E00063 |

- [ ] T01 Retreat destination
- [ ] T02 Base retreat
- [ ] T03 Planned route and pan
- [ ] T04 Supply gesture
- [ ] T05 Building interactions
- [ ] T06 Menu speed, labels and screen edges
- [ ] Qualifying hardware FPS acceptance

New replay route orders use the same queue as live moves. Replays with an explicit planned-route start still retain their first move before later legs are queued.
