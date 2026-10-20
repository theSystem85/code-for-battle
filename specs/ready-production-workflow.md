# Ready production workflow

- Settings contains two independent device preferences, both enabled by default: automatically enter placement when construction finishes; automatically continue with the next ready building after a valid placement. Choices persist across reloads.
- Auto entry does not replace an existing placement, drag, repair, or sell action. Readiness follows completion order. A successful map click consumes exactly one ready building; invalid clicks preserve the current item. Both canvas placement entry points advance consistently. Other unlocked buildings can still be queued while a ready building waits at the cursor.
- Clicking an already-active Buildings tab starts explicit stacked placement, overriding the auto-continuation preference for that session. Escape exits placement and leaves all unplaced buildings ready.
- The Buildings tab glows when any buildings are ready. Ready card glows extend 20px inward on every edge; tab glows extend 10px inward. Both share an opacity pulse, and no ready-state border or external glow is added.
- Clicking an already-active Units tab selects and smoothly focuses produced surviving player units, newest first, cycling at the end and restarting when a newer unit arrives. Starting, dead, and foreign units are excluded. Use the attacked-unit notification focus helper.
- Production timestamps survive saved games and multiplayer snapshots. Explicit stacked placement survives save/load. Schema version 3 migrates older saves without mutating them.
- The manual and tutorial explain automatic placement preferences and both active-tab shortcuts.

## Validation and performance

Focused unit and Chromium coverage checks independent preferences, completion/advance, explicit stacked placement with preferences off, Escape, one building per click, ready glows, unit focus order, persistence, and migration purity. Full unit/integration runs and lint are required before the dev push; unrelated browser suites and hardware performance acceptance are not part of the headless check.

Production bookkeeping runs only on completions or input. Unit history sorting runs only on tab clicks, not simulation ticks or renders. The existing network snapshot serializer runs every 100ms: one extra scalar per unit costs 10,000 scalar reads/writes per second at 1,000 units, independent of canvas DPR; it creates no extra lookup or per-entity container. CSS adds one bounded gradient layer per production card, animating only opacity. At 20 visible 112x112 cards and DPR 3 the maximum layer area is 2,257,920 pixels; the glow's painted gradient is limited to the edges. No map-sized canvas fill, image resizing, or sprite preparation is introduced.

Hardware 75 FPS acceptance remains pending for Patrick on dev because no qualifying hardware GPU is verified in the cloud environment. Do not interpret browser interaction tests as performance certification.
