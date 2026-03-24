# Replay command fidelity fixes

## Prompt
1. Ensure that recording and replaying pause and cancel builds is correctly performed.
2. Ensure unit commands are recorded and replayed correctly, including all possible commands for each unit.

## Changes
- Added replay command capture for active and queued production cancels so paused-then-aborted production chains replay without stalling the queue.
- Replaced replay-time player unit command execution with the real input command handlers instead of the generic AI applier fallback.
- Recorded direct mouse and keyboard issued unit commands covering move, attack, force-attack, guard, retreat, workshop hotkey, dodge, stop attack, and service/support commands for refinery, workshop, hospital, gas station, ammo, tanker, ambulance, recovery, and helipad workflows.
- Exposed the live unit and keyboard handlers to replay playback and updated replay docs/todo tracking.

## Validation
- Checked changed files for editor diagnostics.
- Ran changed-file lint after the replay command capture and playback updates.
