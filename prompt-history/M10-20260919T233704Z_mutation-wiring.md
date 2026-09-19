# 2026-09-19T23:37:04Z

Model: GPT-5.6 Sol
Harness: Cursor Cloud Agent

## Prompt

You are a Wave 2 lane worker for the Code for Battle repo. Implement ONLY step M10 from rendering_improvement_todos.md in an isolated git worktree. Do not edit another lane's files or shared docs/TODO/package.json. Prompt-history only if required: unique M10 prefixed filename.

Read first:
- rendering_improvement_todos.md M10
- specs/069-rendering-preparation-contracts.md section "M10 producer inventory" and mutation domains/footprints
- src/rendering/prepared/renderRevisionStore.js
- C00-inventoried producers:
  src/mapEditor.js
  src/buildings.js
  src/factories.js
  src/game/harvesterLogic.js
  src/game/gameStateManager.js
  src/game/tileDecals.js
  src/game/mapBiomes.js
  src/gameSetup.js
  src/saveGame.js
  src/network/stateSync.js
  src/game/gameOrchestrator.js (map lifecycle transactions ONLY; startup readiness wiring is I20 — do not blanket-edit orchestrator)

Exclusive write set: those producer files plus a small notifier helper if needed (e.g. src/rendering/prepared/mapMutationNotifier.js that wraps RenderRevisionStore) and focused unit tests. MUST NOT edit files under src/rendering/ except a new prepared notifier helper, MUST NOT edit src/performance/, MUST NOT edit mapRenderer.js.

M10 requirements:
- Inventory all writes to fields formerly covered by signatures, including direct assignments and bulk replacements. Register/document exact files in a test fixture or module comment, not in shared markdown docs.
- Wire old/new local change notifications and bulk transactions for editor, resources/harvesting, building footprints, tile decals, map regeneration, save/load/replay and network map restoration.
- Domains/halos from spec 069: Topology type+airstripStreet with 10-tile halo; Surface biome/shorelineBiome/biomeBlend including featherPixels and static-building detail suppression with 2-tile halo; Resources ore, oreDensity, seedCrystal, seedCrystalDensity; Decals tag/variant/group dimensions/origins.
- noBuild and decalCounter are NOT direct render dependencies.
- Bulk replacement/generation/load/network restore: beginTransaction, map generation, coalesce local notifications, commitTransaction.
- Avoid per-entity/tick scans or allocations to discover mutations. Notify at the actual write point; coalesce duplicates.
- State serialization remains device independent: never put RenderRevisionStore/prepared caches into save/replay/network game state. No simulation/occupancy behavior changes.
- Occupancy: if you touch unit tiles, center-based formula; exclude self occupancy.

Cover parity tests for fields missing from legacy signature: oreDensity, seedCrystalDensity, biomeBlend.featherPixels, and decal grouping/origin fields.

Do NOT run 75 FPS benchmarks.
After implementation: npm run lint:fix:changed then npm run test:unit. Fix root causes. Gameplay tests around harvesting/buildings/save must still pass.
Commit in the worktree.

Return: changed paths; remaining uncovered producers if any; validation commands/results; exact model name.
