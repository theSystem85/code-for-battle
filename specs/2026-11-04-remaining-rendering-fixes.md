# Remaining rendering fixes 4–6

Date: 2026-11-04. Base: current origin/dev `09f64405979b0e0ae0d0801589450ae4cd89d616`. User reports poor rendering across browsers/devices, including fresh incognito matches at defaults. This does not establish a browser-specific defect.

## Reproduction gap and hardware gate

Headed installed Chrome 156.0.8078.80 reports Apple M1 / ANGLE Metal, hardware Canvas/rasterization/compositing, WebGL and WebGPU enabled. No SwiftShader or software adapter qualifies. The native fresh-context default is **DPR 2**, browser viewport 1200×739, screen 1440×900, playable canvas 950×739 logical / 1900×1478 backing pixels. Earlier 200×200 tests explicitly emulated DPR 1. At native DPR 2, the previous 256 MiB full-map raster admission rejects 200×200 and retains the streaming path. Good results for the DPR-1 retained-page path did not establish good default performance on this machine.

The benchmark now defaults to native viewport/DPR. Explicit `BENCHMARK_DPR=1` or `=2` still enables the controlled 1280×720 fixture. Record the actual canvas/backing dimensions from every capture rather than inferring them from the device.

## Implemented scope

### 4: WebGPU startup and recovery

Parenthesize the WGSL grain multiplications before XOR. Verify the real compiler, animated water, backend pixel parity and a destroyed GPU device. Auto must provide working WebGL water during device recovery and return to a newly initialized WebGPU device when available. No shader detail, quality setting or animation cadence is reduced.

### 5: lifecycle-owned decoration configuration

Observe writes to decoration settings, map seed and player count once per shared game state. Keep enumerable raw save/UI values; changes to effective normalized values advance a primitive revision. Equivalent normalized writes and the derived aggregate count do not invalidate a layout. Installation preserves the observer identity.

Only preparation normalizes settings. The per-tile reader compares map identity and primitive map/catalog/configuration revisions through a positional reader; it performs no normalization, JSON serialization or temporary options-object construction. Sheet/catalog changes and map invalidation retain their existing lifecycle invalidation. Direct writes from generation, saves, networking and UI are covered without depending on every producer remembering an explicit invalidation call. State schema and serialized values do not change. These modules require a reload for live update.

### 6: bounded allocation and native canvas lifecycle

Prepare three raster pools before gameplay: masks, biome composites/shorelines and SOT composites. Each has at most 512 canvases and a 2 MiB RGBA backing limit. The normal 32-pixel case reserves 6 MiB in the shared terrain-resident budget, including spare canvases; one reusable mask ImageData buffer avoids per-mask typed-array churn. Repeated preparation preserves storage and stats identity. Evictions recycle an existing backing/context, clear its pixels and reset transform/alpha/compositing state. Explicit size/asset changes and disposal release backing stores. Mask keys include feather width and the actual shoreline pattern variant; the former omissions made output depend on cache history.

The streaming chunk cache transfers a matching offscreen canvas, its context and existing resident reservation to a new page once the entry limit is reached. Current viewport pages are pinned; prepared-map pages are not repurposed. Old context listeners are removed and new ownership listeners attached. Matching-size transfer never shrinks/re-expands the backing. Unchanged resident reservations retain identity. No cache entry limit, DPR, graphics detail or visual cadence is raised/lowered to obtain a result.

Pooling alone failed the sustained test: minutes 1–5 were 59.55, 60.00, 28.61, 21.99 and 22.01 FPS, with late p95 183–199 ms and max 417 ms. Allocation fell roughly 98%, yet repeated mutable ground rasterization still collapsed. That implementation was not accepted as a sufficient fix.

For high-DPI maps that exceed native full-map raster admission, prepare and retain the **existing streaming path’s world-pixel raster** before play, then upload immutable pages into WebGL/WebGPU textures. This preserves the old streaming ground sampling grid (one texel/world pixel); it does not change canvas DPR, entity resolution, water detail, animation or settings. Maps that already fit native-density preparation keep their original path. Pixel coverage and nearest-texel boundary rules match the independent Canvas path, including fractional camera positions. Pure ground comparisons at DPR 1.5, 2, 2.5 and 3 differ by at most one channel level on both backends. Existing live resource, decoration, entity and effect drawing stays on Canvas above ground. This ground test is not a full-scene overlay pixel-equivalence claim.

The default 200×200 map retains 169 pages / 167,184,900 RGBA bytes; preparing both GPU backends needs about 334,413,160 bytes of explicit texture/buffer reservations, plus 48 diagnostic timestamp-query bytes when enabled. A separate shared `gpuTerrain` owner has the existing pipeline’s 512 MiB cap. Admission failure retains the bounded CPU path. Native context/driver overhead is additional to these byte estimates. Staging releases the old standby before replacement when needed; map disposal releases textures, buffers, shaders, queries and reservations. WebGL context and WebGPU device recovery retain a working alternate/CPU path.

Startup now awaits actual terrain completion instead of abandoning the wait after ten seconds. That timeout could start rendering while a generation was still baking, invalidate its in-flight pages and leave streaming active; delayed preparation is covered by E00253. Preparation waits for WebGPU queue completion and WebGL fences before readiness, including retained water topology uploads. Normal camera traversal only culls and draws retained textures; terrain mutations advance the prepared-raster revision even when the backing canvas identity stays unchanged, then refresh affected textures on both backends. A cumulative bake counter covers work done before per-frame counters reset. Optional GPU timestamps measure the static pass independently of water. Arbitrarily large maps and other existing gameplay source-image sizing paths remain outside this targeted repair.

## Hot-loop accounting

At 75 FPS, a worst-case 3,000 logical cells in the visible/preparation footprint would produce 225,000 decoration lookups/s. Earlier diagnostics observed about 4,600/s because page caching changes actual lookup frequency. The new reader performs primitive checks and does not allocate per lookup. It adds no entity/turret scans; measured fresh matches grow to roughly 18 units, while larger armies remain an acceptance workload.

Native DPR 2 multiplies destination pixel work by four: 950×739×4×75 is about 210.6 million canvas pixels/s before overdraw. Pool source tiles remain the existing 32-pixel inputs; destination resolution is unchanged. A streaming miss can scan the existing 48-entry cache once for an eligible canvas. At approximately 20 misses/s this is at most about 960 candidate checks/s, independent of entity count. Clean hits do not scan or initialize the pools. The retained GPU pass checks 169 page bounds per frame (12,675 primitive-bound checks/s at 75 FPS), submits roughly 4–9 visible quads and reuses its visible array, uniforms and options; this work does not scale with army size. GPU command encoders/pass handles are required API submissions and are included in measured render costs. Static pool preparation is outside the measured first traversal; the cold traversal itself is retained without a warmup lap.

## Commands and coverage

- `npm run test:unit`, `npm run test`, `npm run lint:fix:changed`, `npm run lint`, `npm run build`.
- Headed hardware Chrome: `npm run test:e2e -- remainingRenderingFixes.test.js --project=chromium` with installed Chrome, unsafe SwiftShader flag removed and one worker. E00249 checks real compilation/fallback/recovery; E00250 compares recycled rasters against fresh rasterization pixel-for-pixel under forced eviction. E00251 checks the unchanged ground pixels at four DPRs on both backends, no camera-triggered baking and resource release; E00252 checks two real topology mutations with stable canvas identity and coherent uploads. E00253 holds a real terrain bitmap conversion for over ten seconds and requires loading to remain visible until publication.
- Existing water E00201 and E00203 validate animation and cross-backend pixel parity. Existing E00202 still exposes the baseline display-density/derivative filtering discrepancy; do not reduce high-DPI detail or weaken its assertion to conceal it.
- Focused unit tests cover pool identity, byte limits, pixel release, viewport pinning/reservation/context-listener ownership, effective setting revisions and 10,000 layout reads without normalization/serialization.
- Production diagnostic: `BENCHMARK_URL=http://127.0.0.1:4176 BENCHMARK_MINUTES=5 BENCHMARK_PROFILE_MINUTE=4 BENCHMARK_OUTPUT=tmp/scrolling-analysis/remaining-retained-native-456 caffeinate -di node scripts/benchmark-scrolling-stalls.mjs`.
- The previous dev build is copied to `/private/tmp/rendering456-baseline-dist` and served with `npm run preview -- --outDir /private/tmp/rendering456-baseline-dist --host 127.0.0.1 --port 4186` for paired diagnostics. All captures run serially, without builds/tests competing for CPU. Profiler/trace phases are explicitly diagnostic.

The collector records independently measured intervals, CPU update/render spans, actual backend/DPR, available GPU timing, heap, canvas/context creation, dimension writes, ImageData creation, bounded pool counts/bytes, entity/effect counts, worker checkpoints and blank/stopped controls. It discards per-minute frame arrays between phases. Artifacts are under ignored `tmp/scrolling-analysis/`.

## Measurements and acceptance

Unprofiled native-default baseline: minute 1 = 29.46 FPS, rAF p95/p99/max 183.3/217.1/500.0 ms; minute 2 = 22.96 FPS, 183.4/233.4/434.0 ms. Stopped/blank controls return to 60 FPS. This reproduces the reported poor default experience with the previous fixes present.

A separate one-minute native baseline allocation/GC diagnostic varies substantially: 58.80 FPS, p95/p99/max 18.4/18.7/499.9 ms. Keep that spread visible rather than selecting the faster baseline or attributing every difference to a single factor. Its ready/end totals are 831→63,514 canvases, 837→63,521 contexts, 1,666→133,064 dimension writes and 586→748 ImageData allocations. At the end, the organic caches contain 193 masks / 512 composites / 0 SOT composites. Its main-thread major GC reaches 60.484 ms, including 55.386 ms in the native/embedder epilogue; nested durations are not additive. CPU profile samples include 947.4 ms GC, 282.7 ms getContext and substantial native drawImage/program time. This is direct allocation/lifecycle evidence, not proof that GC alone explains every slow frame.

The display/browser cadence is around 60 Hz and cannot certify 75 presented FPS. Keep all application CPU/GPU deadline misses, native memory/GC attribution and realistic selected/moving/firing armies outstanding until qualifying-hardware acceptance completes. Do not silently lower the gate or claim the performance problem solved solely from a short fast run.

During final validation, one DPR-1 fixture timed out waiting for publication and one DPR-2 pixel fixture observed no prepared GPU representation. Repeating only fast successful boots was insufficient. Inspection found the ten-second `Promise.race` in startup, now removed. The test assertion was preserved and a deliberately delayed preparation regression added.

Final checks: `npm run test:unit` = 368 files / 5,745 passed; `npm run test` = 370 files / 5,831 passed. `npm run lint:fix:changed`, `npm run lint` (5,746 unique declarations) and production build pass. The final serial headed hardware command was:

```sh
npm run test:e2e -- --config=/private/tmp/rts-analysis-playwright.config.mjs remainingRenderingFixes.test.js scrollingStallRecovery.test.js terrainCachePressure.test.js proceduralWaterRendering.test.js --project=chromium
```

It passed all **12 cases in 1.5 minutes**. The temporary configuration imports the repository configuration, uses installed `channel: chrome`, `headless: false`, removes `--enable-unsafe-swiftshader`, uses one worker, no webServer, and baseURL `http://127.0.0.1:5175`. The delayed test preserved the loading/publication assertions. An earlier run concurrent with CPU suites still timed out waiting for DPR-1 pages in E00247; five subsequent independent idle DPR-1 loads published 169 pages without a pipeline error, followed by the complete serial pass. That remaining contention-associated failure's exact cause was not captured; do not claim it conclusively explained or erase it. The full repository E2E suite was not run. Existing E00202 density parity fails on both baseline backends at maximum channel difference 57; E00201/E00203 pass. Assertions/visual detail were not weakened.

## Final native-DPR production capture

Command: `BENCHMARK_URL=http://127.0.0.1:4176 BENCHMARK_MINUTES=5 BENCHMARK_PROFILE_MINUTE=4 BENCHMARK_OUTPUT=tmp/scrolling-analysis/remaining-retained-native-456 caffeinate -di node scripts/benchmark-scrolling-stalls.mjs`. No other tests/builds ran during measurement. Backend: actual hardware WebGPU, Apple M1 / ANGLE Metal. Native DPR 2, 950×739 logical / 1900×1478 backing. Preparation took 6,335 ms. First traversal starts immediately after readiness, without a warmup lap; route speed is 3,600 logical px/s and repeats the full map. Minute four includes profiling overhead.

| Minute | FPS | rAF p95 / p99 / max (ms) | CPU update p95 / p99 / max | CPU render p95 / p99 / max | Update+render p95 / p99 / max | CPU work >13.333 ms |
|---|---:|---|---|---|---|---:|
| 1 | 60.00 | 18.60 / 18.70 / 18.80 | 1.20 / 1.80 / 6.90 | 1.50 / 1.70 / 3.70 | 2.50 / 3.10 / 8.10 | 0 |
| 2 | 59.77 | 18.60 / 18.70 / 200.00 | 2.30 / 5.30 / 11.00 | 1.40 / 1.70 / 7.90 | 3.60 / 6.00 / 11.90 | 0 |
| 3 | 59.97 | 18.60 / 18.70 / 50.00 | 2.40 / 5.00 / 10.20 | 1.50 / 1.80 / 14.00 | 3.70 / 5.80 / 14.90 | 1 |
| 4 | 59.95 | 18.60 / 18.70 / 64.60 | 2.10 / 3.80 / 6.50 | 1.50 / 1.90 / 9.30 | 3.50 / 4.70 / 10.30 | 0 |
| 5 | 59.92 | 18.70 / 18.70 / 50.00 | 3.80 / 5.10 / 11.50 | 1.50 / 2.00 / 15.90 | 4.60 / 5.80 / 16.90 | 1 |

Every measured rAF interval exceeds 13.333 ms on this 60-Hz display: 17,976 / 17,976. There are five intervals over 33.4 ms. Worst non-overlapping one-second windows by minute: 59.88, 49.18, 58.00, 57.05, 57.99 FPS; worst five-second windows: 59.98, 57.78, 59.62, 59.43, 59.60 FPS. Stopped and blank controls measure 60.013 / 60.001 FPS.

Water GPU p95 ranges 3.01–3.15 ms, p99 4.06–5.05 ms, worst sample 16.25 ms. Static-ground GPU p95 1.97–2.03 ms, p99 2.29–2.75 ms, worst sample 19.99 ms. These are independently timed passes, sampled asynchronously (latest values can repeat across frames, with browser timestamp quantization); do not add them to CPU work or treat repeated observations as unique completed GPU frames. Both CPU and GPU deadline exceedances remain outstanding, even though averages are fast.

The chunk-factory creation counter stays at **169 created, zero recycled**. This counter covers `createChunk`, not backing recreation when a prepared page is edited; whole-app canvas probes below include those allocations. Cumulative base bakes rise 169→208 over five minutes, with 338→416 GPU uploads: 39 later bakes and 78 backend refreshes. Browser tests independently prove zero camera-triggered bakes on clean pages; this live capture includes actual terrain revisions from gameplay/background work rather than asserting zero total updates. Ground GPU reservation remains 334,413,208 bytes, including both backends and optional timing resources. Organic pools stay at 512 backing stores / 2 MiB each; the mask scratch is reused. Whole-app ready/end counts are 2,434→3,697 canvases, 2,440→3,704 contexts, 5,208→31,342 dimension writes and 556→559 ImageData allocations. Other gameplay/unit/UI work still allocates; these totals are not a claim of zero allocation.

JS heap spans roughly 53.5–464.8 MB across snapshots, ending near 71.7 MB versus 63.6 MB at the first snapshot; the profiled minute has substantial instrumentation/GC variation. Native/driver memory is not measured by JS heap. Traced minute four has 40 main-thread MinorGC events, total 185.610 ms, max 23.347 ms; no MajorGC event in that captured minute. CPU-profile GC samples total 167.064 ms (versus 947.4 ms in the separate baseline diagnostic; different phases/workloads, not a precise paired ratio). Nested GC durations are not additive. Minute two has a 215 ms long task and a 200 ms rAF gap outside the captured trace; its exact cause remains unattributed. Minute five has a 54 ms long task. Checkpoint worker completion spans 74.2–95.2 ms off-thread; largest observed message-post call is 0.4 ms, so do not attribute the 215 ms task to a checkpoint without a stack.

The live match grows from zero units / four buildings to 19 units / 32 buildings, with 300 smoke particles and an explosion in the final snapshot. It does not replace explicit selected layered-unit, large-army and other reference-workload acceptance. No page errors were reported. Visibility/focus stayed active in the sampled counters; this does not prove that no external scheduling interruption occurred.

Serial alternate-backend command: `BENCHMARK_URL=http://127.0.0.1:4176 BENCHMARK_MINUTES=1 BENCHMARK_BACKEND=webgl BENCHMARK_OUTPUT=tmp/scrolling-analysis/remaining-retained-webgl-456 caffeinate -di node scripts/benchmark-scrolling-stalls.mjs`. Actual native-DPR hardware WebGL: 59.85 FPS; rAF p95/p99/max 17.60/17.70/166.70 ms, one interval >33.4 ms. CPU update+render p95/p99/max 2.40/4.90/9.40 ms, zero measured CPU-work deadline exceedances. Stopped/blank controls 60.012/60.002 FPS. This one-minute alternative check is not a sustained WebGL acceptance certificate.

The measured late collapse is removed in this five-minute run. **75-FPS performance acceptance remains pending**: the display is limited to 60 Hz, isolated application CPU/GPU misses and GC remain, driver/native memory needs qualifying-hardware measurement, and the full reference workload matrix is not completed. Continue dev delivery for Patrick’s qualifying-GPU checks; do not describe the rendering performance project as fully accepted.

The new hardware-only fixture checks CDP hardware device identity and enabled rasterization before opening gameplay. Software/unknown adapters are skipped, rather than running GPU coverage against SwiftShader or CPU fallback. The benchmark performs its own equivalent gate.
