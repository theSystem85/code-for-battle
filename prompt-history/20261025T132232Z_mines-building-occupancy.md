UTC: 2026-10-25T13:22:32Z
Harness: Codex desktop
Model: GPT-6 (exact model variant, reasoning level, token counts and task duration unavailable)

Bugfixes:

1) Ensure that when enemy unit drives over a mine that the mine actually explode. This should also happen when the mines belong to the same party as the unit which is driving over it BUT the pathfinding algorithm for each units will avoid own mine fields and treat them like an non movable occupied tile.

2) Ensure that all movable occupied tiles (like the ones below a wreck) block placement of new buildings.

commit directly to dev!
