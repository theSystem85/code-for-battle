UTC timestamp: 2026-10-16T13:05:00Z (requested filename timestamp)
Model: GPT-6; exact deployment version and reasoning level are not exposed by this harness.
Harness: Codex. Token counts are unavailable and omitted.

## Request (English)

You are working in a git repository checked out at the current directory (branch codex/pr-688-map-decoration-generator-20261016-150231-5c4e8f, based on cursor/biome-decorative-tiles-745b).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
TASK:
PR #688 map decoration generator upgrade (code-for-battle). Key files: src/rendering/decorationLayout.js (placement, ruins clusters already exist: buildRuinClusters), src/rendering/textureManager.js (integrated sheets, tag buckets, grouped catalog), src/rendering/renderer.js, src/ui/spriteSheetEditor.js (DEFAULT_SSE_TAGS), src/ui/spriteSheetRegistry.js (DEFAULT_SSE_SHEETS = main defaults, OPTIONAL_SSE_SHEETS = dtv2), public/images/map/sprite_sheets/dtv2_{grass,soil,sand,snow,universal}.json (tiles "c,r":{tags,rect,col,row}, propLayout[] with id/col/row/w/h/tags), map generation code (find with rg "street|road|river|oreField|startPosition|choke").
All placement must stay deterministic per map seed, use pure helpers with unit tests, and keep the guarantee that custom mode with no custom sheets selected renders exactly like default mode (tests/e2e/emptyCustomSheets.test.js must still pass). Do not change default-mode rendering. All impassable tags stay.

Implement:
A) New tags added to DEFAULT_SSE_TAGS (and preferredTags): trees, rocks, farm, landmark, roadside, shore, ground_detail, city. Tag dtv2 JSON tiles + propLayout tags by sprite id (propLayout[].id): trees = trees/groves/tree rows/palms/pines/spruce/birch/oak/poplar/orchard/young_trees/bushes/shrubs/thornbushes/hedgerow/saguaro/cacti; rocks = stones/boulders/outcrop/rock_ridge/capped_*/mossy_boulders/ice_chunks; farm = farmhouse_barn/hay_*/haystack/beehives/fence_plough/scarecrow/wheelbarrow/rusty_tractor/well/stone_well/shed/orchard_row; landmark = the 3x3 sprites (pond_reeds, ruined_farmstead, oasis, frozen_lake, ruined_village_block); roadside = car_wreck/buried_truck/wrecked_convoy/tank_hulk/sandbag_ring/hedgehog_*/tire_pile/barrel_cluster/dusty_barrels/crate*/cable_drums_pole/generator_jerrycans/scrap_girders; shore = pond/lake/stream/reeds-related sprites none needed beyond existing water ones (leave). A sprite may have several.
B) Proposal 1 noise density mask: seeded low-frequency value/simplex noise multiplies decoration probability (dense patches + clearings).
C) Proposal 2 category clusters: trees, rocks, farm placed via seeded cluster centers (like ruins): trees as forest patches grown around seeds, rocks as rock fields, farm sprites grouped into farmsteads. Uncategorised decorations keep current behaviour.
D) Proposal 4 road/river aware: 'roadside' sprites prefer land tiles 1-2 tiles from street/road tiles (never on them; keep a 1-tile clear buffer on roads); 'shore' sprites prefer land tiles adjacent (<=1) to water; no decorations on road tiles.
E) Proposal 5 spacing + keep-clear: per-size minimum spacing (large >= 4 tiles apart, medium >= 2, small >= 1 by group span) and keep-clear radius with no decorations: player start/base positions (radius ~8), ore fields (radius ~2 around ore tiles), choke points (narrow land passages between water/impassable, detect cheaply e.g. land tiles with water/impassable on both opposite sides within 2 tiles).
F) Proposal 6 landmark rarity: 'landmark' sprites at most 1 per ~64x64 region (and max 3 per map), rejection sampling.
G) Proposal 7 variety: the same sprite (group label/sheet+rect) not repeated within 6 tiles; choose evenly across candidates in a category (round-robin/shuffled bag seeded).
H) Proposal 8 ground detail layer: tiles tagged 'ground_detail' (from optional sheets; a sheet images/map/sprite_sheets/dtv3_ground_detail.webp/json will be added later) render as a separate subtle layer UNDER decorations at reduced opacity (e.g. 0.55), passable, placed with low density via noise, never on water/roads; they do not count as decorations for spacing. If no ground_detail tiles are loaded nothing changes.
Also: OPTIONAL_SSE_SHEETS gets placeholders for images/map/sprite_sheets/dtv3_ground_detail.webp and dtv3_shore.webp only if the files exist (registry should tolerate missing optional sheet files gracefully: skip with a console warning, no crash).
Tests: unit tests for each helper (noise mask determinism, clusters, roadside/shore preference, keep-clear, spacing, landmark cap, variety distance, ground detail layer ordering). Keep existing tests green.
Docs: docs/changes/2026-10-16-map-generator-placement-rules.md, prompt-history/2026-10-16T13-05-00Z_map-generator-placement-rules.md, update skills/map-assets/SKILL.md (tags + rules), features/0.56.0.json. English, no title attributes, no top-level await. Run lint + unit tests.

## Work and verification

Implemented additive dtv2 categories, pure seeded noise/cluster/environment/spacing/rarity/variety helpers, separate ground-detail placement and terrain-layer rendering, optional-file discovery, preparation warming, twelve focused unit tests, a reproducible CPU/heap preparation probe, a dedicated spec and change/release notes. All existing impassable tags and default sheet registrations were retained. No commits, pushes or remote changes were made.

Installed dependencies from the local npm cache with `npm ci --offline --ignore-scripts --no-audit --no-fund`. Full unit suite: 280 files, 5,047 tests passed. Lint and changed-file lint autofix passed. Playwright was attempted, but the sandbox prohibited the development server's localhost listener (`listen EPERM`); browser validation and qualifying-hardware 75 FPS verification remain outstanding. Exact task duration and token usage are not exposed and are omitted.
