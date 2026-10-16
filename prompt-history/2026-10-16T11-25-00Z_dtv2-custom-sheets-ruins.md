# 2026-10-16T11:25:00Z

Processed by: Codex harness. Exact model version, reasoning level, token counts and total task duration are unavailable and are omitted.

## Prompt

Work in the current git repository on branch codex/pr-688-biome-decorative-tiles-fo-20261016-132425-e66d94, based on cursor/biome-decorative-tiles-745b. Follow AGENTS.md. Do not commit, push, change remotes, leave the directory, use network access, or add credentials.

PR #688 (biome decorative tiles) follow-up for code-for-battle. Relevant files: spriteSheetRegistry.js, mapEditorControls.js, spriteSheetEditor.js, textureManager.js, decorationLayout.js, saveGame.js, sprite-sheet index and dtv2 sidecars. Seasons 2/3, rocks and rockCliffsMountains assets were restored.

1. Restore DEFAULT_SSE_SHEETS and index.json to main's exact order: streets24_q90_1024x1024.webp, seasons_1024_q90_2.webp, seasons_1024_q90_3.webp, crystals_q90_1024x1024.webp, rocks_64x64_1024x1024_q85.webp, rockCliffsMountains_64x64_1024x1024.webp, debris_craters_tracks.webp, all under images/map/sprite_sheets/. Remove restored paths from retirement; keep dt_*_1024_q85 retired. Default rendering must match main.
2. Export the five dtv2 sheets as optional custom sheets, available in Map Settings and SSE, unselected by default. Update registry tests.
3. Add `ruins` to default and preferred editor tags. Use propLayout ids and full col,row,w,h footprints to append `ruins` to tiles and propLayout tags, keeping existing tags including impassable. Include names containing `ruin`, soil_ruined_farmstead, soil_collapsed_shed, universal_rubble_pile, universal_concrete_wall_ruin, universal_ruined_village_block and universal_ruined_house; exclude adobe_hut.
4. Place ruins in a few seeded biome-matching land clusters (2–4 centers scaled by area, radius about 6–10), using deterministic minimum-distance sampling. No ruins outside clusters; other decorations unchanged. Add pure-helper tests for clustering, determinism and spacing.
5. Guarantee integrated/custom mode with an explicit empty custom selection renders identically to disabled custom mode: same tile choices, decorations and procedural ground. Add unit comparison coverage and an E2E comparison if feasible.

Create docs/changes/2026-10-16-dtv2-custom-sheets-ruins.md and this prompt-history entry; update skills/map-assets/SKILL.md and features/0.56.0.json. Keep version 0.56.0. English only, no HTML title attributes, no top-level await. Run lint and all unit tests.

## Validation

Lint and changed-file lint autofix passed. All 5,035 unit tests passed across 279 files using `npm run test:unit -- --maxWorkers=2`. Browser testing was attempted but the sandbox rejected the development server's listening socket with EPERM; live performance acceptance remains outstanding. No commit or push was performed.
