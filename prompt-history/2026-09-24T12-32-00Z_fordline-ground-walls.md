2026-09-24T12:32:00Z

Grok 4.7 in Cursor Cloud Agent. Token counts were not available for this run.

## Prompt

Fix Mission 01 (Fordline) on PR https://github.com/theSystem85/code-for-battle/pull/699 (branch cursor/mission-01-fordline-ac21).

User feedback after playtesting:

1. Black / missing ground around the player base. Near the player's starting construction yard the map shows black instead of visible terrain/ground tiles. Investigate how the mission map is authored (terrain layers, biome, decorative tiles, cliff/water masks, camera start, fog, chunk streaming, or incomplete tile paint) and fix so the area around the player base has proper visible ground matching the rest of the map. Do not paper over with a camera hack if the underlying terrain is wrong.
2. Enemy base: make the enemy outpost a bit bigger and give it a wall around the base (using the game's existing wall/perimeter building pattern if there is one). Keep it still suitable as a first mission — tougher than now, not a fortress that blocks learning the economy/build loop.

Constraints:

- Keep mission id `Mission_01` / `builtin:Mission_01`.
- Keep EN/DE briefing i18n coherent if the layout story changes slightly.
- Preserve intro-video hook behavior.
- Run `npm run lint:fix:changed` and `npm run test:unit`; fix what you break.
- Push to the same PR branch; do not merge.

Report: root cause of the black ground, what you changed for the enemy base (wall + size), and how to re-test.
