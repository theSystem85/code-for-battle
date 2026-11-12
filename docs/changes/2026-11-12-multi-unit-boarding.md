- [x] **Bug: Reliable ferry and hovercraft boarding queues**
  Keep the transport aligned and stationary at the coast for the whole reserved queue, advance vehicles through one loading point, and leave selections beyond capacity idle. Cover natural approach, sequential transfers, late arrivals, and overflow with browser and unit regressions.
  Spec: none

Simulation cost: the transport controller runs once per simulation tick (normally 60 Hz). A reusable ID index adds at most 60 × N unit visits per second (60,000 visits/s at 1,000 units), independent of device pixel ratio; queue routes are rebuilt only on commands, completed transfers, or removed cargo. Collision checks add constant-time boarding/idle checks per nearby pair; ship avoidance skips its own queued cargo. No drawing changes. Hardware GPU acceptance (75 FPS) remains pending; this environment uses software rendering, so no GPU/performance benchmarks are run.

Manual verification:

| Scenario | Steps | Expected result |
|---|---|---|
| Ferry at coast | Select 12 tanks and click an empty ferry | Ten tanks approach in a queue and board individually; two stay idle. The ferry holds its aligned coastal position through the final transfer. |
| Hovercraft at coast | Select six tanks and click a hovercraft offshore | Four board in order; two stay at their starting positions. |
| Hovercraft on land | Repeat with the hovercraft on land | Four board through the front ramp while the hovercraft holds still. |
| Cancellation and retry | Stop an active cargo vehicle, then issue the boarding command again | All pending links clear on stop and the next command completes the queue. |
| Partial capacity | Repeat with cargo already aboard | Only the remaining number of vehicles receive boarding orders. |

The browser coverage uses normal movement for the full approach/queue/transfer and samples every animation frame for transfer overlap, ship drift and overflow movement. The existing prepared cancellation/unload coverage remains alongside it. Fixtures use movable occupancy tags and wait for the loading overlay to close before issuing input. The four focused transport cases pass; the unrelated full browser suite and GPU/performance cases are not run on this software-rendered host.

Validation: `npm run test:unit -- --maxWorkers=2` passed all 5,806 unit tests before the latest upstream mine-layer update. The final `npm run test -- --maxWorkers=2` then passed all 5,902 unit/integration tests across 374 files on the combined code. All four transport E2E cases pass with both inland and near-coast overflow vehicles; both broader naval movement regressions also passed (the short movement case passed on rerun after a startup timeout during local build metadata refresh). Full lint/test-ID checks and the production build pass.
