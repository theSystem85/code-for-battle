# 2026-03-24T17:18:00Z - codex

## Prompt
The units still do not move in replay but I can see in the exported replay file that the commands got recorded. Think harder and fix the issue and investigate the replay file json.

## Investigation
- Inspected the exported replay JSON and confirmed the replay contained valid `unit_command` entries for movement.
- Confirmed the replay baseline started with no live units and only an in-progress tank production state.
- Traced replay playback and found that post-baseline produced units were being recreated with fresh runtime ids, so replay command lookup by recorded `unitIds` failed even though the commands were present.

## Changes
- Added deterministic replay unit references to recorded unit commands and remote-control commands.
- Added replay-side unit id alias resolution so older exported replays that only contain raw `unitIds` can still bind a recorded id to the correct live unit after playback spawns it.
- Added deterministic `replaySpawnOrdinal` assignment to unit creation and preserved it across save/load hydration.
- Reset replay alias state when loading and finishing replays.
- Updated replay feature tracking docs.

## Validation
- Checked editor diagnostics for all changed replay/input/save files.
- Ran `npm run lint:fix:changed` successfully after the fix.
