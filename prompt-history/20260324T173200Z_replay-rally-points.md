# 2026-03-24T17:32:00Z - codex

## Prompt
Replay works now for unit commands but ensure that the rally points of buildings are taken into account when they are set by the user to make sure they also get recorded and replayed correctly. Currently there is a rally point for vehicle factory and for vehicle workshop.

## Changes
- Added replay recording for user-set building rally points from the mouse selection flow.
- Recorded rally-point updates for the construction yard, vehicle factory, and vehicle workshop.
- Added replay playback support for `set_rally` commands so playback restores the same building rally tile before later unit spawns or workshop outputs use it.
- Updated replay feature tracking docs.

## Validation
- Checked editor diagnostics for the changed replay/input files.
- Ran `npm run lint:fix:changed` successfully after the rally-point replay fix.
