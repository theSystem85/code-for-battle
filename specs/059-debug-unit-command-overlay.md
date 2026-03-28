# Debug Unit Command History Overlay

## Summary
When the game is loaded with the `debug` query parameter, selecting one unit should display a command history panel showing the latest high-level commands received by that unit.

## Requirements
- Debug mode activation remains URL-query based (`?debug`).
- Overlay visibility:
  - show only when exactly one unit is selected,
  - hide when selection is empty or includes multiple units,
  - works for player and enemy units.
- Overlay placement:
  - fixed-position panel around middle-right area of the screen.
  - supports minimize/maximize toggle in the panel header.
- Content:
  - show the last 10 command entries for the selected unit,
  - include command type, source (`player`/`ai`), command detail payload, and relative timestamp.
- Command collection:
  - track high-level command signals from both AI and player-controlled units.
  - ignore sub-path/intermediate movement tweaks so logs reflect high-level order changes, not every path step.
  - cap in-memory history to 10 entries per unit.

## Implementation
- Add `src/game/unitCommandHistory.js` to collect and expose per-unit command history.
- Hook signal observation into movement update so AI and player command intents are captured from shared unit state transitions.
- Add `src/ui/debugUnitCommandOverlay.js` and initialize it from `main.js` during startup idle tasks.

## Acceptance Criteria
- Launching game with `?debug` enables the overlay system.
- Selecting a unit shows its latest commands; deselecting hides the overlay.
- Enemy unit selections also show command history.
