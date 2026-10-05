# Bugs

A bug is something that is broken or that behaves contrary to intended or specified behavior. Polish, performance, UX, refactors, and balance of working features belong in [Improvements.md](Improvements.md). New capabilities belong in [Features.md](Features.md).

Open work is grouped by game area. Finished work is under [Done](#done) in the same area order. Add a new item under the matching open heading, not at the end of the file:

    - [ ] **Short title** — One-line description.
      - Spec: none

When a spec exists, replace `Spec: none` with a relative link such as `[Title](../specs/021-f22-raptor-unit.md)`. Do not invent a spec file. When the work is finished, mark the checkbox `[x]` and move the entry under Done for that area.

## Contents

- [Rendering and WebGPU](#rendering-and-webgpu)
- [Units and Combat](#units-and-combat)
- [Air and Jets](#air-and-jets)
- [Economy and Buildings](#economy-and-buildings)
- [AI](#ai)
- [UI, Sidebar, and Settings](#ui-sidebar-and-settings)
- [Missions and Campaign](#missions-and-campaign)
- [Saves and Replay](#saves-and-replay)
- [Done](#done)

## Rendering and WebGPU

- [ ] **When the game is paused, rotating the screen should trigger a fresh** — map render so the canvas is drawn in the new orientation.
  - Spec: [Paused Rotation Render Refresh](../specs/024-paused-rotation-render/spec.md)

## Units and Combat

- [ ] **Defense turrets should not fire through buildings; block shots when line of** — sight is obstructed for player and AI turrets.
  - Spec: none

- [ ] **Rocket tanks should advance into range and fire through obstacles; attack cursor** — should show out-of-range targets for all units.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [ ] **Tanks must respect building line-of-sight** — blocked shots should prevent firing for both player and AI and trigger repositioning until clear.
  - Spec: none

## Air and Jets

- [ ] **F22 follow-up (2026-02-25)** — enforce grounded taxi pathfinding strictly to street/airstrip tiles with robust parking fallback routing; fix F22 to perform repeated stand-off attack bursts until rocket ammo is empty; ensure airborne F22 never imparts push/separation forces to ground units; ensure F22 attack movement circles target at distance between bursts instead of flying directly over target.
  - Spec: [F22 Raptor Consolidated Requirements (Non-Street)](../specs/021-f22-raptor-unit.md)

- [ ] **F22 validation follow-up** — user-confirmed regressions remain on runway sequencing (`A4`), takeoff/landing motion profile (`A7`/`A8`/`A9`/`A10`), post-takeoff approach continuity (`A11`), ground push behavior (`B3`), and combat wave orbit behavior (`B4`); additionally unclear pending checks for `A5`/`A6`/`B1`/`B2`/`C2`/`C3`/`C4`.
  - Spec: [F22 runway robustness and combat command reliability](../specs/048-f22-runway-robustness-and-combat-command.md)

- [ ] **Prevent multiple Apaches from landing on the same helipad; show blocked cursor when hovering over occupied helipads.**
  - Spec: [Advanced Unit Control](../specs/004-advanced-unit-control/spec.md)

- [ ] **Rocket tank rockets should detonate on airborne targets and stop firing at** — move destinations (range and impact behavior regression).
  - Spec: none

- [ ] **Airborne units must never collide with each other or take impact damage;** — they should only use predictive, position-based avoidance.
  - Spec: none

## Economy and Buildings

- [ ] **Enemy base power display shows NaN when selecting an enemy construction yard; ensure it shows the correct power value.**
  - Spec: none

- [ ] **ensure when using drag and drop on the mobile build buttons that** — the unit or building info tooltip does not pop up. Only show it when the user hold the button but not when is pressed and then the finger is moved. It can pop up when the button is hold but as soon as the finger is moved by about half the size of the button the tooltip should go away again.
  - Spec: [Mobile Portrait Sidebar Expand Button](../specs/022-mobile-portrait-sidebar-expand-button.md)

- [ ] **Scripted base building leaves chimney smoke on sold buildings (2026-10-05)** — buildings placed through the automated base-build path (LLM build queue / `build_place` via `src/ai-api/applier.js`) keep emitting chimney smoke after being sold, while manually built buildings stop. The smoke lifecycle must be identical to the player build path: smoke emission must stop when the building is sold or destroyed, and leftover particles must clear.
  - Spec: none

- [ ] **Scripted power plant does not change power supply (2026-10-05)** — a power plant built through the automated base-build path does not increase the owner's power supply, and selling it does not decrease it either. Power supply/demand is effectively decoupled from scripted buildings, which likely has further side effects (power-gated production, power tooltips, AI power decisions). The building must go through the same placement and lifecycle hooks as a manual build so power, money, smoke, and any other building effects stay in sync.
  - Spec: none

- [ ] **Scripted building construction does not deduct money (2026-10-05)** — buildings placed through the automated base-build path are not charged to the owner's budget, unlike manual builds. Cost deduction must happen on the same path as the player build flow (at queue time or construction start, consistently).
  - Spec: none

## AI

- [ ] **Local AI host-party enemy ownership (2026-03-25)** — when the host opts to let its own party run under local AI or LLM control, all AI subsystems must treat that party as friendly, treat every other party as hostile, and avoid legacy two-side assumptions that make the host AI attack its own units/buildings or skip support logic.
  - Spec: [LLM Strategic AI & Commentary Integration](../specs/032-llm-strategic-ai.md)

- [ ] **7) Ensure that the enemy AI will move the tanks with missing crew members back to hospital before continuing the battle.**
  - Spec: [Hospital & Crew System](../specs/003-hospital-crew-system/spec.md)

## UI, Sidebar, and Settings

- [ ] **Prevent iOS long-press text selection from appearing on production build buttons so tooltips stay visible.**
  - Spec: none

- [ ] **Fix attack cursor to toggle between in-range and out-of-range states on hover** — based on distance, and ensure range labels render in red.
  - Spec: [Combat System Enhancements](../specs/006-combat-system-enhancements/spec.md)

- [ ] **On mobile PWA portrait mode, stretch the sidebar to the very bottom so no unused black bar remains.**
  - Spec: none

- [ ] **Remove the blue progress bar from sidebar build buttons once a unit finishes production.**
  - Spec: none

## Missions and Campaign

- [ ] **Tutorial window should be allowed to overlap the sidebar; on portrait mode** — it should mount at the top-left corner over the sidebar and span the full width when expanded.
  - Spec: [Tutorial System](../specs/021-tutorial-system.md)

## Saves and Replay

- [ ] **Replay determinism save timing lock (2026-03-25)** — the observer-style replay determinism E2E must pause the live match before the first save and before stopping recording, and must pause again before the replay-end save, so both saved states are captured at a frozen identical `gameTime` instead of drifting on `frameCount`/time during save/stop sequencing.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism overlap metric + economy harness (2026-03-25)** — the four-player replay determinism E2E should compare the paused live/replay saves by a 2-decimal state-overlap percentage instead of exact serialized equality, and the fast-forward harness must not inject artificial building budgets because that hides real money spend behavior.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism mismatch-only diffing (2026-03-25)** — the replay determinism E2E should canonicalize compared save payloads by stripping UI/analytics-only branches, sorting comparable collections, and reporting only grouped mismatch branches so remaining overlap failures point at real simulation drift instead of save noise.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism wall-clock timestamp drift (2026-03-25)** — saved mine arming/deploy timers and wreck creation/recycling timestamps must use simulation time, not `performance.now()`, otherwise live-match and replay saves drift even when the underlying gameplay sequence is deterministic.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism stop-marker boundary (2026-03-25)** — replay playback must include an explicit terminal marker at the paused stop-recording timestamp, otherwise playback can end at the last gameplay command one fixed step early and miss the final ore spread/economy changes present in the live-match save.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism full pause freeze (2026-03-25)** — the E2E save-point freeze check must verify `frameCount`, `simulationTime`, `simulationAccumulator`, and `lastOreUpdate` stay fixed in addition to `gameTime`, so the compared save states are captured from a truly frozen simulation step.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism E2E map preset (2026-03-25)** — keep the four-player replay determinism test pinned to a `60x60` map with seed `5` and exactly `1` ore field so manual reruns stay on the intended deterministic scenario.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

- [ ] **Replay determinism four-player E2E harness follow-up (2026-03-25)** — keep the replay determinism test tutorial-free across startup and first paint, and avoid forcing `humanPlayer` to a non-owning spectator id because that triggers the normal defeat screen immediately before recording starts.
  - Spec: [Replay Feature](../specs/056-replay-feature.md)

## Done

Completed entries stay here so the detail is not dropped. Do not add new work in this section.

### Rendering and WebGPU

- [x] **Settings and FPS widget disagreed about WebGPU (2026-09-25)** — After a successful probe, settings said "Using WebGPU." whenever the sticky active flag was not WebGL, including while every terrain frame still drew with WebGL. The default water-only path has no sprite-sheet image, so texture sync returned false after a validation scope was already open and WebGPU never retried. Both read the latest drawn frame now. A handoff records not ready, validation pending, texture sync failed, no instances, restore, or the init failure, shows that reason on the widget's renderer row, and logs it once per change with a `[WebGPU]` prefix. Water-only frames bind a 1×1 placeholder atlas until a real sprite sheet exists.
  - Spec: [GPU Terrain and Sprite Rendering](../specs/014-webgl-rendering-upgrade/spec.md)
