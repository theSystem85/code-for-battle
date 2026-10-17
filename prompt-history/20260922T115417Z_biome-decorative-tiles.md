# Prompt: Biome-aware decorative map tiles

UTC: 2026-09-22T11:54:17Z

LLM: Cursor Cloud Agent using Grok-4.7 (harness: Cursor Cloud / sand). Token counts unavailable for this run.

## Prompt summary
Implement biome-aware decorative map tiles (hybrid with existing organic DT), per-biome + universal SSE sheets (WebP 85%), season/group tags, placement by `tile.biome` + `universal`, winter lakes impassable, keep cliffs/boulders, write `skills/map-assets/SKILL.md`, open PR from new branch off main.

## Locked decisions (do not reopen)
- Hybrid: new DT sheets alongside organic DT
- WebP quality 85%
- Load all new decorative sheets up front
- Camera for new DT art: ~65° top-down, ~300 m altitude, photorealistic
- Biome-independent SSE tag: `universal`
- Seasons as SSE tags (spring/summer/autumn/winter)
- Multi-tile DT footprints stay inside one biome
- Winter/frozen lakes impassable
- Biome-tagged rock/stone groups in new DT sheets
- Keep existing cliffs/boulders on neutral system
- Skill doc at `skills/map-assets/SKILL.md`

## Completion
UTC finished: 2026-09-22T12:10:23Z
Cursor Cloud Agent using Grok-4.7 (harness: Cursor Cloud / sand). Token counts unavailable for this run.
PR: https://github.com/theSystem85/code-for-battle/pull/688
Unit tests: 4086 passed.
