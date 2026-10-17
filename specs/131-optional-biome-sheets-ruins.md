# Optional biome sheets and clustered ruins

Version: 0.61.0 (originally 0.56.0, renumbered on the 2026-10-17 rebase). Follow-up to PR #688.

- Keep the seven main sprite sheets in their original order in the default registry and index.
- Offer all five dtv2 sheets as optional custom sheets in Map Settings and SSE. Do not select them automatically.
- Preserve explicit empty selections across settings reload and saved games. Empty custom mode must use the default tile, decoration and procedural-ground paths.
- Expose `ruins` in editor tags and preferred tags. Tag entire propLayout footprints whose ids contain `ruin`, plus `soil_collapsed_shed` and `universal_rubble_pile`. Preserve existing tags and exclude adobe huts.
- Prepare 2–4 deterministic cluster centers on eligible land, scaled by map area. Use radius 8 and minimum anchor distance 4. Match the biome and keep full footprints within one biome. Other decoration selection keeps its existing intervals.
- Seed ruin sampling from the map seed. Sampling and catalog filtering happen at layout preparation, outside the frame loop.

## Validation

Run `npm run test:unit`, `npm run lint:fix:changed`, `npm run lint`, and `npm run test:e2e -- tests/e2e/emptyCustomSheets.test.js --project=chromium --reporter=line`.

Unit coverage checks default registry/index equality, restored storage eligibility, optional sheets, clustering, repeatability, minimum spacing, empty selection tile/decoration parity, and renderer procedural-water choices for both checkbox states.

The renderer change reads the prepared active-mode boolean once per frame, rather than the settings intent. This is constant work at 75 calls/second, independent of entity count and DPR, with no new raster work, state allocation, resizing or draw calls. Layout sampling runs only when preparing a new layout.

Qualifying-hardware performance acceptance remains outstanding: this sandbox cannot bind a development-server port (`listen EPERM`), and cannot certify 75 presented FPS. Before acceptance, follow `performance_improvement.md`: compare cold traversal, repeated full-map scrolling, selected layered units, firing, movement and procedural water at realistic entity counts and unchanged fidelity. Record backend/DPR, FPS, p95/p99/max frame times, missed 13.333 ms deadlines, CPU update/render time, GPU time where available and memory/GC evidence.

Sandbox results (2026-10-16): `npm run lint:fix:changed` and `npm run lint` passed. `npm run test:unit -- --maxWorkers=2` passed all 5,035 tests in 279 files (118.89 seconds). An earlier unrestricted run hit an unrelated flow-field setup timeout; the bounded-worker run required no weakened assertions or increased timeouts. The E2E command could not start its Vite server; a direct `npm run dev -- --host 127.0.0.1` confirmed `listen EPERM: operation not permitted 127.0.0.1:5173`. No live benchmark metrics or canvas-pixel equivalence are claimed.
