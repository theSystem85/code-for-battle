# 2026-09-27 — Multiplayer stats and quick match

Notes for this change live here so they are not appended to `TODO/Bugs.md`, `TODO/Features.md`, or `TODO/Improvements.md`. Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md).

## Feature

- [x] **Presence counts** — anonymous heartbeats report how many people are playing and how many are in online multiplayer. The line is localized in English and German, pauses while the tab is hidden, and stays hidden offline or when the endpoint is unavailable.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)

- [x] **Quick match** — a host can list one free invite slot, and Quick match claims that slot then joins with the normal invite link. Cross-network play still needs the existing TURN variables.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
