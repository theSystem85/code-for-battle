# Naval movement fix

UTC timestamp: 2026-10-24T23:02:05Z
Model: GPT-6, using the Codex desktop harness. Exact model build, reasoning level and token usage are not exposed by this session.

## User request

make a PR against dev where you fix the movement of the naval units especially the larger ones like the carrier by making sure the units do not block their own pathfinding algorithm with their own occupied tiles (old often reoccurring bug that was fixed multiple times for ground units already). Let me know if that was the issue why larger naval units were showing dodging behaviour when actually there were no obstacles on the pathway. If that is not the case look for other reasons why naval units do not move straight to their target location and often change directions for no obvious reason!

## Findings and implementation

Naval A* and collision avoidance already bypass the shared land occupancy layer. Reproduced false stuck recovery during slow hull alignment, carrier arrival failure when a close target lies between the center and bow, and unnecessary diagonal waypoints caused by floating-point cost comparisons. Suppress the low-speed blockage inference during intentional naval alignment while retaining actual terrain/collision and aligned-stall recovery, accept the forward centerline for final carrier arrival, tolerate negligible path-cost rounding, and prevent naval movement/removal from corrupting land occupancy counts. Add regression coverage and prepare a PR into dev.

Final validation: all 5,545 unit/integration tests in 330 files pass with required Git subprocess access; both naval browser tests pass using the installed system Chromium; lint and stable test IDs pass. Hardware GPU performance acceptance remains pending.
