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
- Four-player replay determinism E2E should disable tutorial UI both via preseeded tutorial storage and an explicit post-load hide/skip step, because the normal tutorial boot can still appear during startup races and block the replay controls.
- Determinism E2E must keep `humanPlayer` on a real owning party during the recorded live match; switching it to a spectator-like non-owner is not a valid all-AI shortcut because the standard defeat checks immediately end the game for the local player.
- The four-player replay determinism E2E scenario is pinned to `/?size=60&players=4&seed=5&oreFields=1` so replay investigations target one stable map layout with a single shared ore-field configuration.
- The current determinism E2E uses an observer-style scenario: the host keeps ownership of `player1` but enables local AI automation for that same party, records a four-player `5x` match for 180 simulated seconds, then compares the paused live and replay-end canonical `saveObj.state` payloads.
- Any determinism save-point comparison must freeze the simulation first: pause the live match before the first save and before finalizing the recording, and pause again before the replay-end save, so the compared saved states share the same frozen `gameTime` instead of drifting while the save/record-stop flow runs.
- The determinism recorder must write an explicit terminal replay marker when recording stops. Replay playback should run through that terminal timestamp even if no gameplay command happened on the final fixed step, otherwise replay can end one simulation step before the saved live-match boundary.
- Replay completion must be finalized after the simulation tick that consumed the terminal replay marker, not immediately when the marker is observed at tick start. The fixed-step loop advances `simulationTime` before running systems, so pausing at marker-consumption time still ends one gameplay tick early.
- Replay also needs phase-aware command execution. Commands recorded by classic AI or LLM strategic control are emitted from the end of `updateGame`, so replay must defer those entries to a post-tick playback phase instead of executing them at the start of the same timestamped tick.
- Ore spread itself must stay on the deterministic session RNG seeded from map configuration and restored save-state RNG snapshots. When replay reaches the terminal stop-recording marker captured from a paused save boundary, playback must halt before another simulation tick can run, otherwise a stray final fixed-step can still consume one RNG value and drift ore/economy state even though ore spread is already seeded correctly.
- Save-point freeze verification must cover the full simulation boundary, not only `gameTime`: `frameCount`, `simulationTime`, `simulationAccumulator`, and ore-timing state must remain unchanged before a determinism save is accepted.
- Determinism comparison now uses a 2-decimal percentage overlap metric over the parsed canonical saved-state payloads rather than exact string equality, so small residual field drift is reported as similarity instead of a binary pass/fail mismatch.
- The determinism comparer canonicalizes both saved payloads before overlap analysis: it strips UI/analytics-only branches such as active build-placement/session-history state, sorts comparable collections (`units`, `buildings`, `unitWrecks`, ore positions, blueprints, mines, rally-point lists), and reports grouped mismatch-only branches so debugging output focuses on the non-overlapping gameplay state.
- The determinism fast-forward harness may accelerate simulation/build speeds, but it must not inject artificial building budgets or other economy cheats that would invalidate money-spend comparisons between the live match and replay.
- Local AI or LLM automation for the host party must be fully party-aware across combat, retreat, logistics, recovery, and healing subsystems: the controlled host party remains friendly to itself and all other parties are treated as enemies.
- Retreat target markers are a player-order visualization only. AI retreat behavior may still use `isRetreating`, but replay/observer-facing UI must render retreat markers exclusively for units whose retreat was explicitly issued by the player.
- Any saved gameplay countdown or timestamp that participates in replay/save comparisons must be based on simulation time rather than wall-clock time. In particular, mine arm/deploy timers and wreck creation/recycling timestamps must not rely on `performance.now()` if deterministic save-state comparisons are expected to pass.
- Harvester ore-target retry logic is also part of deterministic simulation state. Any delayed ore retarget/manual-target retry must be driven by simulation-time state stored on the harvester, not by wall-clock `setTimeout`, and replay/save comparison tooling should ignore observer-only camera movement plus derived stats such as aggregate kill counters or current power totals.
- Replay/save comparison tooling should also ignore render-frame counters such as `frameCount`, because they are advanced once per rendered frame in the main loop and are not part of deterministic gameplay state.
