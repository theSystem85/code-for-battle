# 2026-03-24T13:02:00Z - codex

## Prompt
1. Ensure the remote control feature is recorded and replayed correctly when the player uses the keyboard to directly control units.
2. Move the volume and speed slider values into the left-side labels and make the sliders a bit wider, with green knobs matching input labels.
3. Ensure the replay list scrollbar looks the same as the save games list scrollbar.

## Changes
- Updated replay playback to route recorded remote-control action and absolute commands through the real remote-control state helpers instead of mutating raw game state fields.
- Reworked the sidebar volume and speed controls so their current values render inline inside the left labels, freeing more width for the slider rails.
- Changed slider thumbs to green and aligned replay-list scrollbar styling with the save-game list.
- Updated TODO and replay spec tracking for the new replay/UI polish.

## Validation
- Checked editor diagnostics for the replay and sidebar files.
- Ran npm run lint:fix:changed after the implementation.
