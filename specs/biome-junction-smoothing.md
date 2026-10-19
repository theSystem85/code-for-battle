# Biome junction smoothing

The inland sand boundary previously applied its blend only to tiles at an exact ocean distance. Curved coasts include tiles at fractional Euclidean distances, leaving some boundary cells opaque. Region transitions could also choose only one neighboring source, dropping other materials at triple junctions.

Resolve a separate immutable surface map after region coloring, shoreline sand assignment, and plateau snow selection. At each junction, count each biome's ownership among the adjacent terrain cells. Exclude water and runways. Each cell receives the same corner fractions as its neighbors, including diagonal-only contacts and all four materials where needed.

Interpolate these fractions with smoothstep in both spatial directions. Render materials in a fixed order with conditional source-over alpha: source weight divided by source plus preceding weights. This reconstructs normalized material coverage, even when neighboring tiles have different material subsets. The first material is an opaque base, and later layers replace it wherever its weight is zero. Pure cells retain one base draw.

Both organic and integrated terrain use the same coverage. Prepared masks include the preceding weights in their keys, descriptors, backing density, and byte accounting. Composites retain the existing bounded cache. Save/load copies the layer arrays and recomputes their numeric cache signature; older single-source saves upgrade once before terrain preparation. Legacy single-source masks remain supported.

## Cost and verification

Corner sampling runs once during map assignment or old-save migration, with four junctions and at most four neighbors per junction per terrain cell. Material interpolation and extra layer draws run during static terrain baking. A cell uses one base and at most three overlays. Cached frame rendering retains the same terrain chunk blits at any entity count or DPR; no per-entity or simulation work is added. The existing legacy signature path consumes a precomputed numeric layer signature instead of hashing all layer arrays every frame. DPR 2 multiplies mask backing pixels by four; mask bytes remain included in terrain preparation budgets.

Behavior coverage includes curved ocean edges in all four orientations, all mixed materials, triple junctions, pure-to-transition edges, opaque terrain, prepared conditional masks at DPR 2, save/load, old-save migration, and direct-versus-chunk textured rendering after a map edit.

Validation results and exact commands are recorded below after verification. Headless Chromium in this environment cannot certify the repository's physical-hardware 75 FPS requirement. The qualifying-hardware scrolling/combat certification remains outstanding; no reduced quality or weaker FPS threshold is used to claim compliance.

### 2026-10-19 diagnostic evidence

- `npm run lint:fix:changed` and `npm run lint`: passed, including 5,340 unique test declarations.
- `npm run build`: passed. The generated commit metadata was restored afterward so it is not part of the change.
- `npx playwright test tests/e2e/organicTerrain.test.js --config .biome-playwright.config.js --workers=1`: uses a temporary local config pointing to `/usr/bin/chromium` because the managed machine has system Chromium rather than a Playwright browser download. The config extends the checked-in configuration without changing viewport, device scale factor, or assertions.
- Pixel regression E00208 (assigned E00129 on the original base) measured zero channel discontinuity across 18,032 shared tile edges in the two terrain paths and four coast rotations, including 1,070 triple-or-higher junction cells; terrain remained opaque. Its two-channel-level assertion tolerance accounts for canvas alpha quantization; the measured maximum was zero.
- Textured chunk regression E00083 compares all RGBA pixels between direct drawing and four cached chunks, including mixed biomes and a topology edit at a chunk boundary. The test now initializes the renderer's normal cache lifecycle before sending its dirty-tile notification. Existing asset-dependent tests wait for the explicit terrain readiness promise.

A separate temporary Playwright diagnostic compared the original map assignment from commit `6ecbc357` with the updated assignment on the same headless Chromium, 1440x1000 viewport, DPR 2, 100x100 map, seed 4, 32 regions, curved ocean edge, plateau snow, and 49 cached chunks. It baked each map once, then checked all cached chunks 30 times:

| Diagnostic | Before | After |
|---|---:|---:|
| Map assignment | 444.6 ms | 420.7 ms |
| Cold static bake | 2682.2 ms | 1596.7 ms |
| Cached pass median | 0.1 ms | 0.1 ms |
| Cached pass p95 | 0.3 ms | 0.1 ms |
| Cached pass maximum | 4.3 ms | 0.1 ms |
| Retained mask variants | 94 | 421 |
| Ending observed JS heap | 78,468,239 bytes | 78,672,102 bytes |

This single diagnostic ran alongside other verification. Cache/order effects and system load prevent treating its cold timing difference as a speedup claim. Heap snapshots do not establish GC behavior or total raster/GPU memory. It measures static baking and cache validation, not presented FPS, combat, GPU timing, or the physical reference workload. On verified hardware GPU environments only, reproduce the retained static workload with `TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --workers=1 --grep E00086`; the before/after diagnostic additionally used the original assignment function in a temporary sibling module. The qualifying-hardware 75 FPS check remains open.

Final browser run: **9 passed, 2 skipped**. E00085 and E00086 retain their existing opt-in benchmark condition; the separate before/after static diagnostic above was run explicitly. No functional terrain test was skipped. The temporary Playwright config and diagnostic source files were removed after verification.

Final unit verification: `npm run test:unit -- --maxWorkers=4` passed **316 files / 5,303 tests**. The sandbox's Git subprocess restriction affected the initial release-script tests; the final run used process permission for their disposable scratch repositories, without changing their assertions. Adding the required release entry during the first run also changed its startup version expectation; the final run used the finalized files. `git diff --check` passed.

## Dev publication

Reapplied the fix onto current `origin/dev` at `4eb47e44` before publishing. Source changes merged cleanly with the new water rendering and save/live-update code. Unpublished test IDs were reassigned after collisions with newly landed tests: U05411, U05412, U05413, and E00208. The latest dev instructions already persist the PR-and-rebase-merge workflow and require hardware performance acceptance to be performed by Patrick on dev; no further software performance benchmarks are run.

The final dev refresh moved the base to `c731e7d4`. The stale M2 assertion was independently fixed upstream in that refresh, so this PR preserves the upstream M2 test and behavior. Lint passed with 5,383 unique test declarations. The full pre-push unit/integration run executed 5,425 cases on the prior dev base; its four timeout-affected files subsequently passed in isolation (95 unit cases), startup smoke passed, and the M2 regression passed with the corrected upstream expectation. The full covering terrain browser suite passed 9 functional cases, with the 2 existing hardware/performance opt-ins skipped.

On the final `c731e7d4` base, the focused biome, mask preparation, save/load, coastal depth, M2 and startup rerun passed **7 files / 90 tests**. No game balance changes are included in this PR.
