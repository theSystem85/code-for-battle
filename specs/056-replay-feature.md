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
- Replay/save baselines now persist full map settings and static tile resource state, and replay loading restores that canonical map snapshot before rebuilding structures so imported or reloaded replays do not inherit seed/dimension/ore-layout drift from the current map settings.
- Save/Load sidebar import now accepts exported replay JSON through the shared import button, refreshes the replay browser, and auto-loads a single imported replay.
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
- Recorded remote-control inputs also store the currently controlled unit ids so replay can restore the same selected unit context before reapplying direct control.
- All replayed unit commands now restore the referenced unit selection before execution, and replay uses its own UnitCommandsHandler fallback instead of depending solely on the live UI handler instance.
- Recorded unit and remote-control commands now also store deterministic replay unit references, and replay resolves post-baseline spawned units through those references plus a compatibility alias fallback so playback still works when runtime-generated unit ids differ from the recording.
- User-set rally points on the construction yard, vehicle factory, and vehicle workshop are recorded as replay commands and restored during playback.
- Replay capture now records classic AI building completions, unit spawns, and unit-command transitions with owner-specific command data, and host-applied remote-party building/unit commands are also recorded so replay can reproduce full multi-party matches without relying on live AI reruns.
- Replay loading now rehydrates the embedded baseline state directly in memory instead of creating a temporary localStorage save first, avoiding quota failures when larger multi-player replay baselines are loaded.
- Sidebar speed and volume sliders now show their current values inline inside the left label text, which frees more width for the slider rails and uses green slider knobs to match input labels.
- Replay list scrollbars use the same custom styling as the save-game list.
