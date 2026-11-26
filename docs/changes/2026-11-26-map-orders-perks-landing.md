# Bug fixes

- [x] **Retreat orders follow a navigable reverse path**
  Shift-click and the circle menu use the same retreat order. The circle menu uses its opening tile as the destination.
  Spec: [Ground Context Commands](../../specs/117-ground-context-commands.md)
- [x] **Finish desktop route drafts with right-click**
  Planned paths feed the Option-click command queue. Path and patrol waypoints share numbered blue markers and lines, with direction arrows for patrols.
  Spec: [Unit Patrol Routes](../../specs/118-unit-patrol-routes.md)
- [x] **Centre perk trees and connect prerequisites**
  Both perk trees open horizontally centred and draw dependency lines from the catalog, including the separate Patrol Routes branch.
  Spec: [Command Center Perks](../../specs/command-center-perks.md)
- [x] **Restore available aircraft landing markers after departure**
  Expired airstrip claims are released, and carrier markers track live deck positions and usable slots.
  Spec: none

## Verification

- Lint and test ID validation passed.
- The full unit run covered 411 files. All initial failures passed in focused reruns after the final changes and with isolated execution for the timing-sensitive sprite-placement test.
- All 86 integration tests passed.
- The full F-22 sequential-cycle browser scenario stalled in both the working tree and the unchanged dev baseline.

Hardware verification of the 75 FPS requirement is pending.
