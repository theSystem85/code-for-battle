# Scrolling stall fixes 1–3

Date: 2026-11-04. Scope: terrain cache churn, empty GPU water passes and periodic autosaves. Evidence before implementation: [hardware investigation](../docs/performance/2026-11-04-scrolling-frame-analysis.md).

## Implementation and ownership

Prepare static organic terrain at the effective canvas density before map readiness. Keep the complete immutable page generation separately from the evictable decoration cache. Camera movement and resource/decal changes reuse these pages; topology/surface changes retain existing revision-driven rebuild semantics. Draw live resources over ground with the original padded-page clipping and ordering. Empty successful WebGL water passes retain ownership, matching WebGPU's existing behavior. Initialization failures still fall back.

Admission reserves a complete generation in the shared preparation byte budget before allocation: at most 256 MiB of retained raster plus one page of staging. Cancellation, replacement and disposal release both. A 200×200 map at DPR 1 uses 169 pages / 167,184,900 bytes. Generations that exceed this limit or available shared capacity retain the existing bounded streaming path. **This does not solve cold baking for oversized/high-DPR maps**, including 200×200 at DPR 2. Retained geometry/another bounded presentation architecture remains necessary there. No resolution, graphics detail or animation cadence is reduced.

The 60-second autosave mirrors immutable tile projections in revision-tracked chunks. Initial mirroring and changed chunk capture yield between bounded work slices. Revalidate every chunk before capturing dynamic state in the same task. Ordered worker messages apply map patches and encode one consistent map/entity cut. City health is checked separately because damage intentionally does not invalidate terrain. Static sheet metadata is sent on configuration changes. Map replacement cancels old jobs; manual/lifecycle saves supersede pending interval writes. Keep manual, pause, pagehide and update checkpoints synchronous for their existing durability contract. Worker failure falls back to cooperative encoding of the captured immutable snapshot. Save format/schema stays unchanged.

## Hot-loop audit and remaining limits

At 75 frames/s, a 1280×720 viewport traverses roughly 1,500–3,000 padded resource cells per frame (112,500–225,000 primitive checks/s); source sprite selection uses identity-preserving per-tile weak caching. Empty cells allocate nothing. DPR 2 multiplies raster pixels by four, not logical cell count. Static baking moves to preparation; ordinary camera cache hits do no terrain baking, hashing or gradient construction. Decorative-only sprite publication invalidates decorations rather than ground. Queue discovery clears obsolete work only at viewport/direction/revision boundaries.

Glow style objects retain identity and finite gradient/sparkle sprites are prepared before play. Continuous glow pulse still uses the existing fractional draw sizing. The live resource/decal pass also retains existing source-rectangle-to-tile draw sizing; complete final-size resource/decal variants remain outstanding. Moving those visuals into live compositing preserves their pulse, clipping and mutation behavior, but does not complete the broader final-size imagery requirement. This conflicts with the broader final-size imagery policy; it is preserved for fidelity, not silently certified as completion of the rendering plan. Canvas bitmap uploads, terrain edits, effects, selected layered units, context recovery and large armies still require full reference-hardware acceptance. Dynamic entity snapshot/structured-clone cost scales with entity count; worker encoding does not promise a hard deadline for arbitrary saves.

## Reproduction and checks

- `npm run test:unit`
- `npm run test`
- `npm run lint:fix:changed` and `npm run lint`
- `npm run test:e2e -- scrollingStallRecovery.test.js terrainCachePressure.test.js proceduralWaterRendering.test.js oceanWaterRendering.test.js saveGameImportExport.test.js --project=chromium` (use headed hardware Chrome with the project configuration override described below).
- `npm run build`; `npm run preview -- --host 127.0.0.1 --port 4176`
- Serial diagnostic: `BENCHMARK_MINUTES=5 BENCHMARK_OUTPUT=tmp/scrolling-analysis/fixed node scripts/benchmark-scrolling-stalls.mjs`. Optional `BENCHMARK_DPR=2 BENCHMARK_MAP_SIZE=100`; do not run competing tests/builds during capture.

The benchmark launches headed installed Chrome, removes Playwright's unsafe SwiftShader flag, checks the actual CDP hardware renderer/rasterization status before loading the app, and saves per-minute rAF intervals, CPU update/render spans, terrain counters, GPU timing where available, heap samples and entity counts. Default fixture: seed 11, 200×200, four players, 24 ore fields, 1280×720 viewport, DPR 1, unchanged Auto graphics, 3600 logical pixels/s serpentine full-map route. Cold first traversal starts after readiness with no warmup lap. Browser-regression configuration uses installed headed Chrome, one worker and the live Vite server; it does not turn the functional tests into an FPS certification.

Coverage: U07063/U07064 retained-page eviction, budget/cancellation and mutation behavior; U07058–U07062 coherent incremental snapshots, unchanged maps/city health, cancellation, format parity and worker fallback; U07065 stale worker generations and U07066 map-patch posting failure; U03880 actual timer/pause durability. E00246 camera jumps/inland zero-water views; E00247 pixel parity across padded page seams (maximum channel error 1 from canvas compositing rounding); E00248 real interval worker checkpoint restored from storage; E00244 cache pressure.

## Measurement results

Hardware: Apple M1, ANGLE Metal, Chrome 156.0.8078.80, hardware rasterization enabled. Actual backend WebGL (Auto still encounters the pre-existing WGSL parser error). Production-build 200×200 fixture, actual canvas 1030×720 at DPR 1, 3600 px/s, five serial 60-second phases; no tests/builds ran alongside capture. Worker target was explicitly checked alive after each phase. Minute four additionally collected a CPU profile and V8/timeline trace, so it is diagnostic rather than an uninstrumented acceptance repetition.

| Minute | rAF FPS | rAF p95 / p99 / max ms | Update p95 / p99 / max ms | Render p95 / p99 / max ms | CPU update + render frames >13.333 ms |
|---|---:|---|---|---|---:|
| 1 | 30.00 | 35.00 / 35.30 / 35.40 | 2.70 / 3.60 / 11.80 | 1.90 / 2.20 / 4.30 | 0 |
| 2 | 29.93 | 34.90 / 35.20 / 166.70 | 6.50 / 11.20 / 19.30 | 1.70 / 1.90 / 3.70 | 8 |
| 3 | 30.00 | 35.00 / 35.30 / 35.40 | 7.10 / 10.30 / 14.90 | 1.60 / 1.90 / 8.10 | 9 |
| 4 | 30.00 | 35.00 / 35.30 / 35.40 | 5.60 / 8.50 / 11.70 | 1.40 / 1.60 / 3.20 | 0 |
| 5 | 29.93 | 34.90 / 35.30 / 150.00 | 5.30 / 8.00 / 11.20 | 1.50 / 1.80 / 3.70 | 0 |

Across all five minutes: **zero cold terrain cache misses**, two revision-driven redraws (minute two), zero render spans over 13.333 ms, retained ground 167,184,900 bytes. The earlier locked origin/dev two-minute run had 214 cold misses, 992 redraws, and render maxima 252.10 / 417.60 ms. The final run's render maximum is 8.10 ms. Direct FPS comparisons are invalid under the current cadence limit: the five-minute capture measured 29.93–30.00 rAF FPS, then **30.01 FPS with the game loop stopped and 30.00 FPS on an empty page in the same browser**. A subsequent fresh-browser empty-page control measured 30.00 FPS before loading any game code. Earlier diagnostics initially ran near 60 FPS and later changed to 30; the cause of that browser/device cadence change is not established. Visibility remained visible and focus true. There is no 75 FPS certification.

All 8,991 measured rAF intervals exceed the 75 FPS deadline under this cadence limit. Separately, 17 measured application update+render frames exceed 13.333 ms, primarily in update; these remain outstanding even if cadence is restored. WebGL GPU timers cover the instrumented GPU work, not all Canvas/compositor work: worst per-minute p95 1.66 ms, p99 1.94 ms, maximum 2.58 ms. JS heap samples span 47.95–104.26 MB with collections and growing AI state (0→18 units, 4→33 buildings, smoke pool up to 300); retained byte reservations do not establish browser-native/VRAM usage or absence of leaks.

Five timed worker checkpoints completed without worker errors or fallback: 5.56–5.58 million characters, 68.8–92.1 ms from posting to worker response. Main-thread encode `postMessage` took 0–0.2 ms at browser timing precision; the slowest map-chunk post was 0.5 ms. No observed >50 ms long task coincided with those five checkpoint completions. Long tasks elsewhere reached 213 ms; they remain part of the unresolved GC/native/update investigation rather than being discarded from acceptance.

Commands/artifacts: `BENCHMARK_MINUTES=5 BENCHMARK_PROFILE_MINUTE=4 BENCHMARK_OUTPUT=tmp/scrolling-analysis/fixed-worker-final caffeinate -di node scripts/benchmark-scrolling-stalls.mjs`. Per-minute JSON/frame samples, the minute-four `.cpuprofile`/`-trace.json` and cadence controls are retained under ignored `tmp/scrolling-analysis/`. The capture completed all phases and controls; its final redundant frame export errored after navigating to the blank control. The diagnostic now writes metadata before navigation and removes that export. The subsequent DPR-2 run verifies the corrected runner to completion.

Checks: `npm run test:unit` — 366 files / 5,739 tests passed; `npm run test` — 368 files / 5,825 tests passed; `npm run lint:fix:changed` and `npm run lint` passed; production build passed, emitting a standalone bundled checkpoint worker. Focused headed Chromium E00091, E00092, E00244, E00246, E00247, E00248 all passed (6 tests, 51.3 s). The full E2E matrix is not claimed green; see baseline failures below.

**Acceptance remains pending:** three clean repetitions at ≥75 presented FPS on an appropriate refresh-rate device, realistic selected/moving/firing armies, the larger/high-DPR memory envelope, remaining application update/GC deadlines and full native memory attribution. Existing visuals/settings were preserved.


## Baseline asset repair

The required test gate exposed a pre-existing stale generated `dtv7_nature_soil_large.webp`: 98 alpha samples disagreed with the checked-in source in component 11. Regenerating with `node scripts/build-map-sprite-sheets.mjs --name=dtv7_nature_soil_large` and `npm run build:map-sprite-tiers` restores zero alpha mismatches. Metadata and test expectations remain unchanged; generated tiers/catalog follow the repaired source. WebP encoding quality remains 85.

## Expanded browser baseline failures

A broader 13-case hardware Chrome run produced seven passes, one skip and five failures outside the focused change: E00202 WebGL density comparison (maximum channel error 57); E00201/E00202 WebGPU and E00203 backend parity (existing WGSL multiplication/XOR parser error); E00102 save import/export (existing compact-save filename metadata bug). The same five declarations fail against an extracted unmodified `origin/dev` source snapshot at c6a7aa77, served separately with the same locked dependencies and hardware browser. E00102 fails earlier waiting for its save row on that baseline snapshot, so its identical failure mechanism is not established by that rerun; the filename path itself is unchanged by this implementation. No test assertions were weakened. These broader failures are retained, and a full green E2E suite is not claimed. Focused checks cover the implementation independently.

### GC and DPR-2 follow-up

The minute-four main-renderer trace's longest completed `MajorGC` event is 8.135 ms (heap 70.92→44.82 MB), rather than the earlier baseline's 264 ms native/embedder GC episode. CPU profile self-time includes 44.88 s idle, 9.96 s `(program)`/native and 123.1 ms garbage collector; this is not full source attribution of the remaining 61/83 ms observed long tasks. Native/compositor/OS scheduling and other update tasks remain unresolved; do not label every long task as GC.

Corrected-runner replay: `BENCHMARK_MINUTES=1 BENCHMARK_DPR=2 BENCHMARK_MAP_SIZE=100 BENCHMARK_OUTPUT=tmp/scrolling-analysis/fixed-dpr2 caffeinate -di node scripts/benchmark-scrolling-stalls.mjs` exited successfully. Hardware/browser/backend unchanged; actual backing canvas 2060×1440 for 1030×720 logical pixels. It retained 49 pages / 167,443,600 bytes, with zero cold misses and three revision-driven redraws. Preparation/navigation readiness took 3,962 ms. Cadence moved from 30.00 FPS on the initial blank control to 60.00 FPS on the final blank control; the application's mixed-cadence minute averaged 41.21 FPS (rAF p95/p99/max 34.2/34.9/35.4 ms). Render p95/p99/max 3.70/4.20/9.30 ms; update 1.20/1.90/8.30 ms; no sampled combined CPU update+render frame exceeded 13.333 ms. GPU p95/p99/max 3.55/8.47/13.56 ms, including one GPU sample over deadline. One worker checkpoint completed in 80.7 ms, no errors/fallback and no observed >50 ms long tasks. This is a diagnostic, **not acceptance**, and does not extend the 256 MiB envelope to 200×200 DPR 2.
