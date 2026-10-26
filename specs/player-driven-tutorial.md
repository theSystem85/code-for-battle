# Player-driven tutorial

The tutorial demonstrates through a green cursor, tooltips and the same inward
production-ready glow, recolored green. Guidance never dispatches input, queues
production, completes construction, selects units or issues orders. Only the
explicit Skip step path may perform those gameplay actions. Crew lesson setup is
the requested exception: a targeted, silent crew cheat empties one player-built
tank without changing the player's selection.

Steps advance after their fulfillment conditions and narration both finish.
Fulfilled actions are retained while narration plays, so short movement orders
remain complete after a unit stops. Continue uses the same fulfilled state.
Manual Skip interrupts narration and fulfills the current step. All asynchronous
guidance is invalidated when the step changes, stops, or a task link replays it.

The first building lesson waits for the player's button click, then points to a
valid map placement. The refinery illustrates drag and drop without dispatching
input. Production lessons wait for actual buildings/units, and tank/rally and
manual driving lessons require both tasks. Cursor transitions use 0.5 seconds
(previously 0.15), and 350ms guidance pauses use 1167ms: 30% of the prior speed.
The advanced Tech Tree lesson explains that the Shipyard's entire footprint must
be water, touch coastal land, and remain within its special four-tile build range.

The crew lesson includes linked hospital, ambulance and full-crew tasks above
its progress bar. The target tank has a visible marker. Restoring a different
tank or only one role cannot complete the lesson. A destroyed lesson target is
replaced with another player-built tank. The lesson never spawns a tank itself.

When funds are insufficient, guidance explains harvester refinery deliveries
and offers an explicit $20,000 tutorial grant. The manual opens at the Tech Tree
anchor, with all eight naval units and the Shipyard's prerequisites documented.
A final step guides Settings, Keybindings and the User Manual.

Shift-drag adds selectable units without duplicates and retains units outside
the rectangle; it does not enter combat attack grouping or utility queues.

## Verification and rendering budget

Tutorial completion polling is limited to 10Hz for one active step. It performs
at most a handful of entity scans, about 5,000 entity visits per scan per second
at 500 entities. No scan runs inside entity rendering. Marker updates affect one
small DOM element at 10Hz, independent of DPR. At DPR 2 the marker's approximate
140 by 30 CSS-pixel area is 16,800 backing pixels. Production gradients reuse the
existing bounded button overlay and do not add map-scale canvas blending.

Functional unit and browser coverage includes narration/task ordering, Continue,
player-only construction, full crew restoration, money grants, native drag
previews, and manual deep links. Hardware acceptance of the 75 FPS gate remains
pending on Patrick's GPU; no software GPU performance benchmark was run.
