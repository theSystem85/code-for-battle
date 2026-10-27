# Aircraft landing spot controls

## Goal

Selected aircraft show the free landing positions that their aircraft class can use. A player can choose a specific position instead of relying on automatic parking assignment.

## Behaviour

- Airstrips expose each unoccupied and unreserved parking position to F22 Raptors, F35s, and Apache helicopters.
- Helipads expose their landing position only to compatible rotary-wing or VTOL aircraft and only while the pad is free.
- Aircraft carriers expose only deck positions with enough contiguous capacity for at least one selected aircraft.
- A green circle marks each available position. The overlay is removed immediately when the selection no longer contains aircraft and is periodically refreshed as occupancy changes.
- Clicking or tapping a marker (or its landing cell) assigns the clicked position first. Further selected aircraft use later compatible free positions when possible.
- F22 Raptors retain their runway approach and landing roll before taxiing to the selected airstrip position. F35s and helicopters descend directly at their selected position.
- Landing orders are recorded with the structure reference and position index so replay execution can reconstruct the command.

## Performance

The overlay is rendered every frame, but landing-position discovery is throttled to four refreshes per second and refreshed immediately on a selection identity change. Per-frame work is limited to identity comparison and drawing the small, bounded set of cached markers. Hardware-GPU 75 FPS acceptance remains pending on the `dev` deployment as required by the repository performance policy.

## Test plan

- Verify that an Apache reaches a reserved airstrip position, reaches zero altitude, and claims it.
- Verify occupied and reserved airstrip positions are omitted.
- Verify an F22 cannot use a helipad.
- Verify carrier markers account for the two-position capacity required by Apache and F35 aircraft.
