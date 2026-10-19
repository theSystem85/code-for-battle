# Coastal Shallows and Graphics settings

## Behavior

- Coastal Shallows (enabled by default) reveals a sandy seabed at all solid coasts. Water transparency decreases continuously from 100% at the coast to 0% at 50 m / five tiles offshore. Deep water is unchanged. Narrow channels, islands and diagonal coasts use the nearest solid coast; the map boundary is open water.
- A persistent checkbox switches between coastal and opaque water.
- Graphics has a dedicated Settings tab. Frame pacing, radar noise animation, terrain backend/density, tracks, selection HUD appearance, water and all Graphics registry entries belong there. Future registry Graphics entries appear there automatically. Advanced runtime configuration excludes Graphics.
- Persistent sliders: wave direction (0–360 degrees clockwise), speed (0–3x), strength (0–2x), and existing view height (0.5–20x; controls pattern scale). Existing tone and saturation control both water appearances on WebGL, WebGPU and Canvas fallback.
- These are visual changes only; navigation, tile types, saves and simulation are unchanged.

## Rendering and performance

Shared lattice vertices store nearest Euclidean distance to solid terrain, clamped to five tiles. Distances are prepared when topology changes; bilinear interpolation supplies continuous within-tile opacity. Reuse the four unused water color attributes, keeping the 17-float instance layout. Composite procedural sand and water in the existing fragment shader, retaining opaque output to avoid another translucent canvas or geometry pass. Expand dirty chunk dependencies by six tiles for coastline edits.

Canvas fallback prepares shared local patterns for identical depth tuples, at actual drawing density with a 64 MiB raster budget. It retains animation, palette and visible runs. Preparation runs at map publication and graphics changes; animation and scrolling reuse patterns. Ordinary frames never create coast masks or upload topology. Per-frame work is a constant uniform update plus per-water-fragment interpolation/blending; at 1440×1000 DPR 2 the upper bound is 5.76 million covered pixels per frame, independent of army size. CPU fallback still uses eleven fills per visible water tile (approximately 1,400 tiles at a 1190×1000 gameplay viewport); entities receive no additional work.

## Verification

Commands:

- `npm run lint:fix:changed` and `npm run lint`.
- `npm run test:unit` and `npm run test`.
- `npx playwright test tests/e2e/coastalShallows.test.js tests/e2e/proceduralWaterRendering.test.js tests/e2e/runtimeConfigFuzzySearch.test.js --project=chromium`.
- `PERF_SCENE=traversal PERF_DURATION_MS=60000 PERF_UNITS=200 PERF_DPR=2 PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node scripts/performance/microstutterBenchmark.mjs /tmp/coastal-after.json` (repeat with `PERF_BASE_URL=http://127.0.0.1:5174` for the baseline archive).

Before switching to dev and reading its stricter hardware-only test policy, an initial baseline diagnostic on Chromium/SwiftShader, 1440×1000 DPR 2, 100×100 map, seed 11, 200 combat units, selected units and 1800 px/s two-lap traversal: 8.25 FPS; frame interval p95 233.3 ms, p99 300 ms, max 350 ms; 496/496 intervals exceed 13.333 ms. CPU render p95 46.1 ms, p99 72.9 ms, max 146.6 ms. This initial baseline overlapped a unit-test run and is contaminated, not an acceptance comparison.

75 presented FPS certification remains outstanding. A headless, software-only cloud browser cannot certify the physical reference device/display. Qualifying hardware must cover cold traversal, repeated scrolling, movement, firing and layered selected units at unchanged quality, reporting FPS, p95/p99/max, missed deadlines, CPU/GPU timing and heap/GC evidence. Do not interpret passing lint/unit tests as performance certification.

Dev integration preserves existing Ocean Surface Water / Classic Water selection, wave height, strength and speed settings. Ocean Surface Water and Classic Water share the new direction and coastal shader composition. Existing settings are reused; no speed/strength aliases or lost user preferences. Per current dev AGENTS.md rule 14, further GPU and performance runs are skipped on this verified SwiftShader worker.

Final implementation computes direction sine/cosine once per frame as uniforms, uses integer grain only on shallow fragments, and bypasses sand composition entirely when disabled. CPU pattern cache validation compares primitive fields without per-frame key strings. New unit coverage: U05406–U05409; settings persistence: E00206; hardware-only pixel coverage: E00130.

Final checks on the dev-based implementation: `npm run lint` passed; `npm run test:unit -- --maxWorkers=4` passed 5,340 tests across 322 files; `npm run test:integration` passed 86 tests across two files; the focused final M2 cadence/versioning rerun passed 13 tests. Production build passed. Playwright Graphics tab/persistence coverage passed once (29 seconds). The user's confirmed M2 1500 ms interval is preserved; only its stale regression expectation was corrected. Full GPU/e2e rendering/performance runs were skipped under dev's hardware-only policy because this worker is SwiftShader.
