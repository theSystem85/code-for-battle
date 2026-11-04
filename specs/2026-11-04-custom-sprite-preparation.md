# Custom sprite preparation lifecycle

Date: 2026-11-04. Base: origin/dev `43cb8bdd255a7137318cef3b3a68bec313d1af49` (PR #805 deployed successfully). The user clarified that the new observation was on localhost: custom sprites off was smooth, enabling them initially stayed smooth, then became slow after roughly ten seconds. Memory exhaustion/automatic streaming fallback was a hypothesis to test.

## Actual hardware reproduction before changing application code

Headed installed Chrome on verified Apple M1 / ANGLE Metal hardware; enabled hardware rasterization, no SwiftShader/software adapter. Native DPR 2; playable canvas 950×739 logical, 1900×1478 backing, default 200×200 map and bundled sheet selections. Current dev source was served on `http://127.0.0.1:5175`. The divergent pre-existing local dev branch was preserved as `codex/dev-local-backup-20261104-2151`; local dev now tracks current origin/dev. No old local commits were discarded or pushed.

A diagnostic based on `scripts/benchmark-scrolling-stalls.mjs` started with `rts-integrated-spritesheet-mode=false`, fast-scrolled for 30 seconds, opened Map Settings and checked the actual custom-sprite checkbox, then captured two more one-minute phases at 3,600 logical px/s. It recorded raster creation, page publication/invalidation stacks, actual budgets, CPU/GPU timing, heap, cache bakes and backend. The first on-minute includes CPU/GC tracing. Exact diagnostic command:

```sh
BENCHMARK_URL=http://127.0.0.1:5175 BENCHMARK_MINUTES=2 BENCHMARK_PROFILE_MINUTE=1 BENCHMARK_OUTPUT=tmp/scrolling-analysis/custom-sprite-before caffeinate -di node tmp/scrolling-analysis/custom-sprite-repro.mjs
```

The ignored diagnostic adds the off phase, native checkbox action and per-second prepared-page/budget/lifecycle probes to the committed collector; it does not alter application rendering. Its captures remain under ignored `tmp/scrolling-analysis/custom-sprite-before-*`.

| Phase | FPS | Frame p95 / p99 / max (ms) | Frames >33.4 ms |
|---|---:|---|---:|
| Off (30 seconds) | 59.73 | 18.20 / 18.60 / 148.60 | 1 |
| On, minute 1 (profiled) | 58.92 | 18.00 / 18.60 / 649.20 | 2 |
| On, minute 2 | 44.97 | 17.70 / 183.30 / 399.50 | 104 |

At app time 46,070.1 ms, `applyIntegratedSpriteSheetRuntime` calls `invalidateAllChunks`. The 169 prepared pages disappear, retained-ground GPU bytes fall from 334,413,208 to **zero**, and no subsequent `publishStaticTerrain` call occurs. The terrain pipeline still reports ready because its old publication is retained as metadata, even though the renderer's pages were explicitly closed. The remaining terrain-resident usage is only 11,455,632 bytes and decoded sources 122,028,032 bytes, under their respective 512 MiB limits. No budget-exhaustion error is recorded. This reproduces a lifecycle-driven fallback, not evidence of memory exhaustion.

The water backend continues to report WebGPU while ground has returned to the 48-entry streaming cache. Thus the backend label alone is insufficient to identify the ground route. Base bakes grow 181→2,946→5,066; streaming raster reuse reaches 4,772. Whole-app canvases grow 2,472→3,630→4,449. Minute-two CPU update+render reaches 409.30 ms (render alone 408.40 ms). The first on-minute CPU profile includes 1,041.865 ms drawImage, 320.203 ms GC and terrain/layout construction. Different GC events and nested/native durations must not be added as independent costs. JS heap alone cannot establish physical GPU/native memory pressure.

## Root cause and implementation

Sheet application invalidated all chunks on both enable and disable. It only initiated map regeneration when an existing topology fingerprint changed; a first/sheet-only configuration could therefore close the prepared ground and leave streaming as the permanent route. Later final-tier publication also remained asynchronous. Map regeneration itself returned before its terrain preparation, and saved/network restore callbacks could dispose newly published pages again.

- Treat sheet changes as an explicit preparation boundary, not ordinary gameplay work. Stop the current simulation/render loop, borrow an existing loading session or show a dedicated preparation screen, and resume only after the asynchronous operation finishes. Overlapping/nested operations share a reference-counted suspension; failures release it; replaced/stopped loops are not spuriously restarted. Do not enqueue behind an outer loading task awaiting the same operation.
- Load final prepared sheet derivatives within this boundary. Keep continuous rotation, clipping, water, animation cadence, source detail and native canvas DPR unchanged.
- Invalidate before computing SOT; rebuild the decoration/occupancy configuration and await a complete replacement runtime map even when topology regeneration is unnecessary. When topology does regenerate, await the map reset's terrain promise rather than starting a duplicate preparation.
- Preserve a player's paused state when a sprite-induced topology regeneration occurs.
- Saved sheet restores keep the runtime pages their sheet lifecycle already published. Legacy catalog restores prepare once after configuration rather than starting an obsolete map bake before the catalog loads. Network restores do not follow a runtime publication with a descriptor-only generation that disposes its GPU pages.

These operations run at human/configuration or map-restore frequency, not per tick/entity/frame. A default map prepares 169 pages once per explicit change and reuses the existing bounded terrain/GPU budget. No per-entity scans or new per-frame objects were introduced. DPR 2 still requires four destination pixels/logical pixel: 950×739×4 pixels/frame; the ground presentation and its existing sampling grid are unchanged. Preparation may take visible time; it is excluded from gameplay captures and reported separately rather than hiding in a warmup lap.

## Coverage and verification

- U07073: unchanged topology still invalidates in the correct order and awaits the replacement publication.
- U07074–U07076: overlapping preparation ownership, failure cleanup, caller-owned loading, stopped/replaced loops.
- U07077: host sheet restoration does not launch a descriptor-only replacement after runtime publication.
- U07078: saved custom sheet restoration does not invalidate its completed runtime publication.
- E00254: actual native-DPR off→on→off checkbox flow; after each change and twelve additional seconds, 169 GPU pages remain, uploads stay budgeted, the pause choice is preserved, and two sets of camera jumps cause no ground bakes. Simulation is paused in this functional test to distinguish camera work from legitimate AI terrain edits. The sustained diagnostic below runs normal simulation and permits counted real mutations.
- The new browser coverage inherits the verified-hardware-only gate. CPU/software GPU performance runs are not permitted.

The hardware display/browser cadence is about 60 Hz and cannot certify 75 presented FPS. All application-caused CPU/GPU deadline misses, memory/GC limitations and qualifying-hardware/reference-workload acceptance remain outstanding unless explicitly measured otherwise. Do not declare the full performance project accepted on averages alone.

## Verified results and exact commands

The user confirmed localhost:5137, checkbox-only changes and all default sheets enabled. No listener was present on that port when checked after the first isolated capture. The verified current checkout was then served on `http://127.0.0.1:5137` using `npm run dev -- --host 127.0.0.1 --port 5137 --strictPort`; the exact same control/default-selection flow was verified there.

- `npm run test:unit`: 369 files / **5,751 passed**.
- `npm run test`: 371 files / **5,837 passed**.
- `npm run lint:fix:changed`, `npm run lint` (5,753 unique declarations), `npm run build`, and `node --check scripts/benchmark-scrolling-stalls.mjs`: passed.
- `npm run test:e2e -- --config=/private/tmp/rts-analysis-playwright.config.mjs remainingRenderingFixes.test.js scrollingStallRecovery.test.js terrainCachePressure.test.js proceduralWaterRendering.test.js --project=chromium`: **13 cases passed, 2.2 minutes**. The configuration imports repository defaults, runs headed installed Chrome with one worker, removes the unsafe SwiftShader default flag, disables auto webServer and uses localhost:5175. It covers delayed readiness, water animation/settings, actual device recovery, masks/pixel parity, topology changes, cache pressure, autosave and the new sprite toggle. The full repository E2E suite was not run; the unrelated pre-existing E00202 water-density parity discrepancy remains documented in the previous rendering spec.

Initial post-fix five-minute diagnostic on port 5175: 59.72, 59.73, 60.00, 59.97, 59.75 FPS. Replacement preparation took 4,125 ms. The independently measured rAF intervals are valid. Inspection found that CPU frame samples could include artifact-collection work between phases; the collector now records explicit start/end timestamps and restricts frame samples, counters and long-task reporting to the active window. CPU maxima from the older inclusive collector are not used to certify deadlines. This justified a second serial five-minute run, on the exact reported port, with normal simulation and all sprites enabled.

```sh
BENCHMARK_URL=http://127.0.0.1:5137 BENCHMARK_TOGGLE_SPRITES=1 BENCHMARK_MINUTES=5 BENCHMARK_PROFILE_MINUTE=4 BENCHMARK_OUTPUT=tmp/scrolling-analysis/custom-sprite-5137-final caffeinate -di node scripts/benchmark-scrolling-stalls.mjs
```

No tests/builds or other automated GPU captures ran concurrently. Native M1 hardware WebGPU; unchanged DPR 2 / 1900×1478 backing. The off phase measured 59.80 FPS. Boot preparation took 5,364 ms; explicit sprite replacement took **4,092 ms**, before the first measured on traversal. No warmup lap is hidden. Minute four includes profiler overhead.

| On minute | FPS | rAF p95 / p99 / max (ms) | CPU update p95 / p99 / max | CPU render p95 / p99 / max | Update+render p95 / p99 / max | CPU work >13.333 ms |
|---|---:|---|---|---|---|---:|
| 1 | 59.73 | 18.60 / 18.70 / 185.40 | 2.40 / 5.20 / 12.10 | 1.60 / 1.90 / 3.20 | 3.70 / 5.70 / 13.10 | 0 |
| 2 | 59.75 | 18.50 / 18.70 / 201.80 | 2.40 / 5.20 / 7.80 | 1.60 / 1.90 / 206.90 | 3.90 / 6.10 / 207.80 | 1 |
| 3 | 60.00 | 18.10 / 18.50 / 18.70 | 3.70 / 5.20 / 7.00 | 1.60 / 1.90 / 11.60 | 4.50 / 6.00 / 13.90 | 1 |
| 4 | 59.83 | 18.40 / 18.70 / 68.30 | 2.70 / 4.50 / 6.90 | 1.60 / 2.00 / 5.90 | 3.90 / 5.40 / 8.10 | 0 |
| 5 | 59.97 | 18.40 / 18.70 / 33.60 | 2.70 / 4.80 / 9.00 | 1.70 / 2.10 / 16.90 | 4.20 / 5.60 / 17.80 | 1 |

All 17,958 measured rAF intervals exceed the 13.333 ms deadline on the 60-Hz display; 12 exceed 33.4 ms. Stopped/blank controls measure 59.976 / 60.000 FPS. Water GPU p95 ranges 2.49–2.69 ms, p99 3.74–4.33 ms, max 10.94 ms. Ground GPU p95 1.90–2.03 ms, p99 2.36–3.54 ms, max **24.71 ms**. GPU timing is asynchronous/quantized and latest samples can repeat across frames; do not count repeated observations as unique GPU frames or add pass times to CPU durations. Three measured CPU-work frames exceed 13.333 ms; the largest actual render span is **206.90 ms**. Active-window long tasks include 200 and 208 ms events in minutes one/two. Their precise internal/native attribution remains unresolved; they are not dismissed as artifact overhead. The progressive streaming collapse is fixed, while isolated stalls remain.

Every on-phase counter snapshot retains **169 GPU pages**, custom sprites enabled, terrain-resident reservation **178,640,532 bytes** and ground-GPU reservation **334,413,208 bytes**. The chunk-factory counter stays at 338, representing two prepared generations (off and on), with zero streaming recycling. This factory counter does not include backing recreation for edited prepared pages; whole-app probes do. Cumulative base bakes are 350→387 across the five on-minutes and GPU uploads 338→410, reflecting gameplay/background revisions and in-flight sampling rather than thousands of streamed re-bakes. E00254 separately proves zero camera-triggered ground baking on clean terrain.

Active-window whole-app snapshots grow from 3,272→4,575 canvases and 3,279→4,582 contexts, with 9,616→35,880 dimension writes and 1,111→1,112 ImageData allocations. Organic pools remain 512 canvases / 2 MiB each; the shared scratch is reused. Other gameplay/UI work still allocates. Sampled JS heap spans about 130–413 MB and ends around 366 MB; this neither measures physical GPU/native memory nor proves every long-run memory question resolved. The profiled/collection window has 43 main-thread MinorGC markers (180.702 ms total, max 23.471 ms) and five MajorGC markers (83.464 ms total, max 51.506 ms). These trace markers include collection-window overhead and nested durations are not additive; no exact GC-to-frame attribution is claimed without aligned stacks. No page errors were reported. The match grows from 3 units / 13 buildings to 23 units / 40 buildings, with 300 smoke particles and 11 explosions in the final snapshot.

The existing idle decoration-page cache and legacy sheets without prepared derivative manifests remain subject to the staged prepared-rendering roadmap; this change does not claim to complete every renderer path. The fix keeps final bundled source preparation and ground replacement inside explicit readiness, without changing DPR, detail, clipping, continuous rotation, procedural water or animation cadence. Selected layered-unit/large-army/reference-workload checks, native/driver memory measurement, remaining CPU/GPU outliers and **75-FPS acceptance remain pending**. Two sustained 60-Hz diagnostics establish removal of this reproduced late collapse, not compliance with the full 75-FPS gate.
