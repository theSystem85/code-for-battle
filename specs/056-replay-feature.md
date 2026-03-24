# 056 - Replay Feature

## Scope
Implement deterministic replay capture/playback for player sessions.

## Requirements
1. Record mode captures commands after the record button is enabled.
2. Replay baseline stores the full game state at recording start (same save format as normal saves).
3. Replay browser appears in Save/Load as tabs: **Save Games** and **Replays**.
4. Loading a replay prepares playback and uses Start/Pause controls for run/pause.
5. In replay mode, build and command actions are disabled (map pan + selection remain available).
6. Replay recording captures accepted LLM strategic actions so AI decisions can be reconstructed.

## Implementation notes
- Replay payload persisted in localStorage (`rts_replay_*`).
- Each entry contains `baselineState`, timestamped `commands`, and metadata.
- Playback rehydrates baseline state, then executes commands against simulation time.

## Follow-up refinements (2026-03-24)
- Replay list rows display the replay start date/time and total replay duration on the subtitle line.
- Loading a replay auto-starts playback and synchronizes the action-bar play/pause icon state.
- Drag-to-build replay restores blueprint placement data (not just button presses) so map construction reproduces correctly.
- Remote-control inputs and cheat console commands are captured into replay command logs and reapplied during playback.
- Record button moved to the speed-control row.
