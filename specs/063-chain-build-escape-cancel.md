# Chain build escape cancellation reliability

## Summary
Escape must always cancel chain build mode so the player is never forced to reload the game to exit planning/placement.

## Requirements
1. Pressing `Escape` must clear chain build state (`chainBuildMode`, `chainBuildPrimed`, `chainBuildingType`, `chainBuildingButton`) whenever any of those flags are active.
2. The escape cancellation path must run even when `gameState.paused` is true.
3. Existing escape behavior for attack-group cancel, placement exit, repair/sell mode exit, and selection clear must remain intact.
4. If no cancellable gameplay state is active, escape should continue to be available for other UI/dialog handlers.

## Acceptance criteria
- Given chain build mode is active, when the player presses Escape, then chain build stops immediately and build overlay no longer continues.
- Given chain build is active while paused, when the player presses Escape, then chain build state is still fully cleared.
- Given no active gameplay cancel state, when Escape is pressed, then keyboard handler does not consume the event solely for gameplay cancel.
