# Seeded decoration placement rules

Optional dtv2/dtv3 catalogs use deterministic preparation from the map seed. Default mode and empty custom selections retain their existing rendering. No asset or impassability tag is removed.

- SSE categories: `trees`, `rocks`, `farm`, `landmark`, `roadside`, `shore`, `ground_detail`, `city`. Categories are additive on each propLayout entry and every covered tile. Water props retain existing water tags.
- Smooth value noise at a 16-tile scale multiplies placement probability, producing patches and clearings. Category seed centers get placement attempts even in clearings.
- Trees, rocks and farms use independent, biome-matching seeded centers with radii 11, 8 and 6. Farm orchards belong to farm clusters. Uncategorized props retain whole-footprint, biome and seasonal eligibility, with the common density and exclusion rules. Ruins retain clustered anchors.
- Streets, roads and airstrip streets cannot contain decorations. Their neighboring land tiles remain clear. Roadside props use the second land ring (Chebyshev distance 2); shore props use adjacent land (distance 1). Entire footprints must satisfy the environment constraints.
- Keep every footprint outside radius 8 around player starts/bases and radius 2 around ore/crystals. Reject narrow land tiles with water, rocks, buildings or explicit impassability on both opposite sides within two tiles.
- Closest footprint tile centers must be separated by at least 4 tiles for span >=3, 2 for span 2, or 1 for singles; use the greater requirement of each pair. Identical sheet/group identities require distance >=6.
- Seeded candidate bags offer each category's candidates once per cycle. Ineligible candidates are rejected. Landmarks use rejection sampling, one anchor per 64x64 region and at most three per map.
- Ground details have independent cells and low noise-weighted density (1/40 maximum), remain passable, and do not consume decoration spacing. Terrain baking draws them at opacity 0.55 below both SSE and organic decorations. No detail tiles means no additional imagery or per-detail lookup work.
- Future dtv3 detail/shore sheets enter the optional registry only when both WebP and JSON exist at build time. Missing pairs produce warnings; failed image loads are skipped. The seven default sheets remain unchanged.

## Preparation and performance

Placement masks, cluster centers, bags and the spatial occupancy index are constructed once per map/configuration and explicitly warmed in `publishPreparedRuntimeMap`. Normal rendering reuses the layout. No entity, turret, collision, selection, water shader or per-frame draw loop is extended. Ground details use the existing bounded static terrain chunk cache; no sprite variants or unbounded imagery caches are generated during gameplay.

Call-frequency audit: the added ground-detail branch runs once per land tile during static chunk baking, not once per entity per animation frame. For 128x128 land tiles there are 16,384 branch checks per full bake. At density <=1/40, at most the probabilistic density of ~410 single-tile draws is expected before exclusions (actual counts depend on noise). At DPR 2 each 32-pixel tile covers 4,096 backing pixels (~1.68 million additional blended pixels for 410 details); DPR 3 covers 9,216 (~3.78 million). No extra draw calls are added to warmed chunk compositing. Source detail art is not bundled yet; final-size/DPR image preparation must be verified when that art is supplied, through the existing preparation-and-swap lifecycle.

Reproducible preparation probe (Node, no renderer): import `buildDecorationLayout` and `buildDecorationPools` from `src/rendering/decorationLayout.js`, create a 128x128 grass grid and seven groups (`trees`, `rocks`, `farm`, `roadside`, `landmark` with 3x3 footprint, `ground_detail`, uncategorized), use salt 688, and time `buildDecorationLayout` with `performance.now()`. Initial implementation measurement: approximately 110 ms. This is preparation time, not frame time or presented FPS.

Validation commands:

```sh
npm run lint:fix:changed
npm run lint
npm run test:unit
npx playwright test tests/e2e/emptyCustomSheets.test.js --project=chromium --reporter=line
```

Qualifying-hardware performance acceptance remains **outstanding**: this sandbox cannot certify 75 presented FPS. Before acceptance, follow `performance_improvement.md` and record before/after cold traversal, repeated full-map scrolling, selected layered units, movement, firing and procedural water at realistic entity counts. Record actual backend/DPR, FPS, p95/p99/max frame time, missed 13.333 ms deadlines, CPU update/render, GPU timings where available and memory/GC. Do not lower visual fidelity or count headless/software rendering as certification.

## Sandbox verification results (2026-10-16)

- `npm ci --offline --ignore-scripts --no-audit --no-fund`: succeeded using the existing local cache, without network access.
- `npm run test:unit`: 280 files and 5,047 tests passed (48.55 seconds in the first full run).
- `npm run lint:fix:changed` and `npm run lint`: passed.
- `npx playwright test tests/e2e/emptyCustomSheets.test.js --project=chromium --reporter=line`: could not start its development server. Direct diagnosis with `npm run dev -- --host 127.0.0.1` failed with `listen EPERM: operation not permitted 127.0.0.1:5173`. Browser equivalence verification remains outstanding; existing unit equivalence coverage passed.
- `node scripts/benchmark-decoration-layout.mjs`: preparation-only benchmark, five samples per mode/size, same seed and synthetic all-land map; legacy mode omits the new categories and detail layer. These are layout construction costs, with different placement semantics and counts, not gameplay frame comparisons.

| Map | Mode | First (ms) | Median (ms) | Max (ms) | Heap delta (bytes) | Decorated cells | Detail cells |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 128x128 | Legacy | 22.30 | 14.45 | 22.30 | 4,966,512 | 4,735 | 0 |
| 128x128 | Natural | 91.21 | 50.04 | 91.21 | 12,421,928 | 212 | 220 |
| 256x256 | Legacy | 32.71 | 31.94 | 35.34 | 16,515,656 | 18,739 | 0 |
| 256x256 | Natural | 214.18 | 204.82 | 222.21 | -4,486,592 | 577 | 755 |

Heap deltas include garbage collection and are not retained-memory measurements. This Node run has no graphics backend, canvas DPR, GPU timer or presented-frame measurement. FPS, frame-time p95/p99/max, deadline misses, update/render CPU and GPU timings therefore remain unmeasured. The qualifying-hardware gate is still open.

## Roadside and rare props (0.61.0)
- `roadside` props are placed only in a dedicated sparse pass: anchors on land tiles directly next to a road, 1 in `ROADSIDE_INTERVAL` (14) such tiles by seeded hash; footprint cells stay within the second road ring and off roads. They are excluded from the generic category bags.
- `rare` props are placed at most once per map (identity-based).

## Stones (0.61.0)
- Props tagged `stones` are placed only by the seeded stones pass: `stoneCount` attempts target, cluster centres weighted toward water and rock terrain (within three tiles), stones scattered 1–5.5 tiles around centres (20% free weighted picks), mixing 1x1 and multi-tile stones. Deterministic for a given map seed.
