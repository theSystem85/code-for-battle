# 2026-03-24T12:48:00Z - codex

## Prompt
1. The unit commands are still not replayed correctly.
2. Ensure the user cannot move or command units during replay, but the replay engine still can.
3. Pause the game when replay reaches the end, show a replay-finished pause message, and let the user resume into normal play.

## Changes
- Fixed replay unit-command execution so commands only report success when the live replay handler actually runs, with compatibility fallback for older attack recordings that only stored target ids.
- Extended replay interaction locking to the full replay mode rather than only active playback ticks, keeping user commands blocked through the finished replay pause state.
- Added replay-finished state handling that auto-pauses the game, updates the play/pause icon, shows an on-screen message, and exits replay mode only when the player presses Start/Pause again.
- Updated replay feature tracking in TODO and spec documentation.

## Validation
- Checked editor diagnostics for replay and pause-handler files.
- Ran npm run lint:fix:changed after the replay fixes.
