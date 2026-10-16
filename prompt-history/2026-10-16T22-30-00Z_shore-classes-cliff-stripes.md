UTC timestamp (requested filename): 2026-10-16T22:30:00Z
Processing date: 2026-10-17 UTC
Harness: Codex API. Model exposed by the environment: GPT-6; exact model version/identifier and reasoning level are unavailable. Token accounting and exact task duration are unavailable and omitted.

User request (English):

You are working in a git repository checked out at the current directory (branch codex/pr-688-code-for-battle-branch-cu-20261017-002143-7591d8, based on cursor/biome-decorative-tiles-745b).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
TASK:
PR #688 (code-for-battle, branch cursor/biome-decorative-tiles-745b). Two tasks, one commit each is fine (or one combined), conventional commits.

TASK A - Shore props: far less frequent + onshore/offshore/shore_trans.
Files: src/rendering/decorationLayout.js (coast pass "Coast props have first choice", shoreDistance, fits()), src/ui/spriteSheetEditor.js (DEFAULT_SSE_TAGS), public/images/map/sprite_sheets/dtv3_shore.json, scripts/build-terrain-details.mjs (generator that emits shore tags; update it to emit the new tags), tests/unit/decorationPlacementRules.test.js, skills/map-assets/SKILL.md.
1) Add tags 'onshore', 'offshore', 'shore_trans' to DEFAULT_SSE_TAGS. Every shore sprite keeps 'shore' plus EXACTLY ONE of these three.
2) Retag dtv3_shore.json exactly (keys are "col,row"; group_15 = tiles 2,2+3,2; group_16 = tiles 4,2+5,2):
   - reeds 0,0 1,0 2,0 3,0 4,0 5,0 0,1: onshore; REMOVE 'universal', add biome tags grass, soil, sand (NOT snow - green reeds were showing on snow).
   - rocks 1,1 2,1 3,1: onshore, universal.
   - grassy mounds 4,1 5,1: onshore; remove universal; grass, soil.
   - driftwood 0,2 1,2: onshore, universal.
   - pier group_15 (2x1, 2,2+3,2): shore_trans, universal.
   - fisher hut with jetty group_16 (2x1, 4,2+5,2): shore_trans, universal.
   - lily pads 0,3: offshore; remove universal; grass, soil, sand. passable.
   - rowing boat 1,3: offshore, universal, passable.
   Keep decorative/passable/impassable and group tags as they are otherwise. Also check dtv2_* sheets for sprites tagged 'shore' or water-related and give them the right one of the three tags (if none, nothing to do).
3) Placement: shore density must be MUCH lower than now (currently ~every other coast anchor with relaxed spacing). Target roughly 1 shore prop per ~12-16 coast tiles, seeded/deterministic, normal decoration spacing between shore props (no clumping).
   - onshore: footprint fully on decoratable land, touching water (8-neighbourhood), as today.
   - offshore: footprint fully on water tiles that are within 1 tile of land (shallow coast water), never blocks... keep passable; must not overlap units/buildings occupancy rules for water (they are decorative render-only on water; do not make water tiles impassable).
   - shore_trans (half land, half water): for a 2x1 sprite, one tile on land (coast anchor) and the other on adjacent water, so the long axis is PERPENDICULAR to the shoreline. Sprites longer than wide must be oriented perpendicular: if the coast normal is vertical (water above/below), the sprite must be placed vertically - support this by rotating the sprite 90/180/270 degrees at render time (add a rotation field to the placement and handle it in the decoration render path in textureManager/renderer, rotating the drawn image around the footprint center, and transpose the footprint width/height for 90/270). Choose rotation so the land end is on land and the water end on water (e.g. pier walkway start on land). Land half follows land occupancy rules (impassable only if tagged impassable), water half render-only.
   - Keep keepClear for roads/buildings/ore/spawns and no shore on streets.
4) Tests: unit tests for tagging invariants (each shore sprite in dtv3_shore.json has 'shore' + exactly one of the three; no reed/lily sprite tagged universal or snow), density (synthetic 60-tile straight coast -> between 2 and 8 props), onshore on land, offshore on water near land, shore_trans spanning land+water with perpendicular orientation for both a horizontal and a vertical coastline (rotation chosen accordingly), determinism.

TASK B - Investigate + fix broken stripes on rock cliffs (also visible on main in default mode).
The rock cliff strips (map tiles of type 'rock', rendered from images/map/sprite_sheets/rockCliffsMountains_64x64_1024x1024.webp/.json and the organic cliff / rock tile selection code in src/rendering/textureManager.js and related rendering files - rg "rockCliffs|organic|cliff" src) show broken horizontal stripes: tiles in a vertical cliff column do not connect, lighter bands / caps appear mid-column, and edges look sliced. Find the actual cause (e.g. random per-tile variant choice ignoring neighbour connectivity, sprite rects with padding/bleed causing seams, wrong rect rounding/half-pixel sampling, autotile mask mismatch, drawing order/overdraw of neighbours). Document the cause with evidence in specs/133-cliff-stripes-investigation.md (append section "Root cause (2026-10-17)"). Fix it if feasible in code (preferred: neighbour-aware selection / seam-free sampling); add unit tests for the selection/sampling logic. If not fully fixable without new art, implement the best mitigation and state precisely what art is needed.

General: docs/changes/2026-10-17-shore-classes-and-cliff-stripes.md, prompt-history/2026-10-16T22-30-00Z_shore-classes-cliff-stripes.md, features/0.56.0.json entries. English, no HTML title attributes, no top-level await. Keep tests/e2e emptyCustomSheets parity intact (default mode rendering may change only through the cliff fix). Run lint + unit tests.
