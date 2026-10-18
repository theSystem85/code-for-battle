# 2026-10-18T05:28:00Z — Biome sheets round 5 (PR #688)

Processed by: Codex Cloud task task_e_6ad4586843b883289baf02001719d518 (model self-reported as GPT-5.6 Sol; reasoning level, token counts and exact model version not exposed by the Codex Cloud CLI), submitted, reviewed and finished by Grok Bot. Task runtime in Codex Cloud was roughly 30 minutes.

## Prompt

1) Remove the sprite sheets seasons_1024_q90_2.webp, seasons_1024_q90_3.webp and crystals_q90_1024x1024.webp from the custom sprite sheet list as well.
2) Replace the current ground detail sheet with one that uses real alpha channel transparency.
3) Also remove the rocks custom sprite sheet.
4) Use all the new sprite sheets as the default: when custom sprite sheets is enabled they show as already checked and can be unchecked there, but by default they render.
5) Check the tags on all new sprite sheets again to ensure ALL of their sprites are used when a map is generated. Make all required adjustments to the map generator and the game to do so.
6) Use Codex for these changes.

## Follow-up by Grok Bot after review

- crystals_q90_1024x1024 is the only ore and seed crystal art, so it is hidden from the sheet pickers but kept as built-in resource art.
- Regenerated dtv3_ground_detail.webp losslessly from the original black-matte art (border-connected matte, un-premultiplied edges, colour bleed into transparent pixels) because the lossy conversion left a dark blocky halo.
- Custom sprite sheet mode now starts enabled when no choice is stored, so the bundled sheets render by default.
- dtv2_soil soil_collapsed_shed carried both ruins and farm and could never be placed; farm was removed.
- Added a placement coverage test that generates real maps with every default dtv sheet and fails on any sprite that is never placed.
