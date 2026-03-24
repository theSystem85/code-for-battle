# 2026-03-24T13:21:00Z - codex

## Prompt
Unit is still not moving in the replay. Think harder to fix the issue.

## Changes
- Identified that replay playback was still relying on a window-owned live UnitCommandsHandler reference that could be stale or unavailable during replay.
- Updated replay playback to restore the referenced unit selection before every replayed unit command.
- Added a dedicated replay-side UnitCommandsHandler fallback so move, attack, and support commands can still execute even if the live UI handler reference is missing.
- Updated replay feature tracking to document the stronger playback executor behavior.

## Validation
- Checked editor diagnostics for replay files.
- Ran npm run lint:fix:changed after the replay executor fix.
