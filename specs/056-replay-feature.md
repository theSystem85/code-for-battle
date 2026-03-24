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
- Speed slider now shrinks to keep the record button fully visible within the same sidebar row.
- Replay rows reuse the save-list visual treatment and expose export/delete actions like save-game rows.
- Player-triggered unit/building production pause-resume toggles are captured and replayed deterministically.
- Player-triggered unit/building production cancels are captured and replayed for both active and queued production entries.
- Replay mode preserves camera panning via right-click drag and mobile two-finger pan while leaving gameplay commands locked.
- Desktop and mobile drag-to-build interactions are blocked for the full replay-mode session.
- Replay playback may still execute recorded production/build commands internally even though user-initiated replay-mode build commands remain blocked.
- Replay row labels now render as `YYYY/MM/DD, hh:mm:ss, DURATION`.
- Player-issued unit commands now replay through the same runtime input handlers used during live play instead of the generic AI action applier, restoring movement pathing and support/service command fidelity.
- Replay-mode command locks now apply for the whole replay session, including the paused state after playback has finished.
- When playback reaches the final replay command, the game auto-pauses, shows a replay-finished pause message, and exits replay mode only after the user presses Start/Pause again to continue normal play.
- Recorded remote-control inputs now replay via the same source-aware remote-control state APIs used during live keyboard control, preserving direct-control key press and release behavior.
- Sidebar speed and volume sliders now show their current values inline inside the left label text, which frees more width for the slider rails and uses green slider knobs to match input labels.
- Replay list scrollbars use the same custom styling as the save-game list.
