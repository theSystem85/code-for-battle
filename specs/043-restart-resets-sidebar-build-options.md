# Spec 043: Restart Resets Sidebar Build Options

## Prompt Source
- Bugfix: Ensure game restart button also resets the build options in the sidebar.

## Requirements
1. Restarting the game must restore sidebar tech/build options to their default initial state.
2. Restarting the game must clear all "new" unlock indicators for units and buildings.
3. Sidebar tab availability must refresh immediately after restart so the UI reflects reset options.

## Implementation Notes
- Reset these game-state collections during `resetGame()`:
  - `availableUnitTypes`
  - `availableBuildingTypes`
  - `newUnitTypes`
  - `newBuildingTypes`
- After production button state updates, force tab state refresh.

## Acceptance Criteria
- After unlocking additional units/buildings, pressing restart removes those unlocked options.
- Unit/building "new" badges do not persist after restart.
- Sidebar tabs reflect only currently available categories immediately after restart.

## Follow-up hardening (2026-02-22)
4. Restarting/shuffling map must clear all build-planning overlays and drag state (`blueprints`, chain-build state, mobile paint state, mine/sweep previews).
5. Restarting/shuffling map must clear stale selection and input carryover (`selectedUnits`, `selectedWreckId`, remote-control key/source state).
6. Restarting/shuffling map must clear both production queues to avoid carry-over work from previous matches.
