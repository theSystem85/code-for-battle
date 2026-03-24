# 2026-03-24T13:13:00Z - codex

## Prompt
The replay of unit commands does not work anymore. Find the issue and fix it.

## Changes
- Identified that replayed keyboard remote-control inputs lacked the selected-unit context needed by the live remote-control system.
- Recorded selected unit ids together with remote-control action and absolute-state replay commands.
- Restored that unit selection context during replay before applying direct-control input.
- Removed replay playback's direct import dependency on the remote-control state module by switching replay to a window-exposed remote-control API.
- Updated TODO and replay spec tracking for the regression fix.

## Validation
- Checked editor diagnostics for replay and remote-control files.
- Ran npm run lint:fix:changed after the fix.
