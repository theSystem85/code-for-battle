UTC: 2026-10-26T22:13:00Z
Model: Grok 4.7 (Cursor Cloud Agent harness). Took about 22m. Token counts unavailable.

User request:

Improvement for Patrick Beyer on code-for-battle, branched from current `dev`.

Units cluster and overlap when many try to move toward the same area (construction vehicles piled on a road behind a tank). Pathfinding already ignores dynamically moving obstacles and units push via physics, but long stuck clusters still form.

Implement this approach:

1. Each unit with a target destination has an internal patience value starting at 10 seconds when a move order is given or a target is set, and after each dodge reset.
2. Every second, if the unit has a target location, check whether it moved at least about 1 meter in any direction since the last check. Minimal jitter does not count as moving. Use the project's meter scale (`TILE_SIZE` and existing distance helpers).
3. If it is not significantly moving, decrement patience by 1 per non-moving second.
4. When patience hits 0, enter dodge mode using the existing intermediate-tile / dodge / local-reroute mechanism. Then reset patience to 10.
5. Apply this to player and enemy AI units alike, on the same movement pipeline.
6. If more than 5 units get stuck in a circle of 5 tiles radius, show an in-game notification with a goto link that selects and centers the affected units so the player can resolve their own units manually. Do not spam for enemy-only clusters unless that matches existing notification patterns. Prefer player-owned stuck clusters.

Investigate existing dodge/reroute, movement stuck detection, and notification/goto patterns. Keep hot-loop costs bounded. Preserve the 75 FPS gate conceptually, but do not run GPU benchmarks without a hardware GPU.

Deliver on a feature branch from `dev`, with lint, unit tests, `docs/changes`, `features/unreleased`, and an English prompt-history entry. Open a PR against `dev` for the agent workflow. Grok Bot will rebase-merge onto `dev`. Report the root files, how patience integrates with the existing dodge, and how the stuck notification works.
