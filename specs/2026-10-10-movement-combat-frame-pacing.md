# Movement and combat frame pacing

## Assessment before gameplay changes

2026-10-10, seed 11, 100×100 map, four players, 320 mixed combat units, procedural water, moving battle camera, 300 smoke particles, 80 dust particles and 12 recurring explosions. No graphics quality reductions or CPU throttling. These are diagnostic Chromium runs, not physical 75 FPS certification.

The user reproduces similar stutters on an M1 MacBook Pro (desktop game) and an iPhone 13 Pro Max, independently of screen resolution. Their browser, display refresh and usual army size were not specified. The local machine is Apple M1 / MacBookPro17,1. Headless Chromium uses SwiftShader; headed Chromium uses ANGLE Metal / Apple M1. Reference-device identity alone does not establish refresh eligibility or complete the required acceptance matrix. Audio is disabled in the benchmark, so these recordings cannot rule out audio startup hitches.

Existing benchmark command:
`HEAVY_BATTLE_PROFILE=1 HEAVY_BATTLE_BACKEND=webgl HEAVY_BATTLE_MAP_SIZE=100 HEAVY_BATTLE_UNITS=320 HEAVY_BATTLE_DURATION_MS=60000 HEAVY_BATTLE_WARMUP_MS=0 HEAVY_BATTLE_OUT=/tmp/microstutter-baseline-existing.json PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test tests/e2e/heavyBattleProfile.test.js --project=chromium --workers=1 --reporter=line`

Its last 600 game frames at DPR 1: interval average 20.06 ms, p95 28.3 ms, max 51.5 ms; simulation average 6.45 ms/max 38.6 ms; movement average 2.82 ms/max 8.4 ms; AI average 1.9 ms/max 35 ms; effects average 0.14 ms/max 0.3 ms. The phase ring describes only the final window, not the entire recording.

Independent 60-second recording command (1440×1000 viewport, DPR 2):
`node scripts/performance/microstutterBenchmark.mjs /tmp/microstutter-before.json`

Independent rAF: 19.95 FPS, p95 83.3 ms, p99 83.4 ms, max 133.5 ms, 1198/1198 intervals over 13.333 ms. Game CPU update average 21.6 ms/max 69.8 ms, render average 2.38 ms/max 16.9 ms. CPU sampling identifies repeated `checkBaseDefenseNeeded` building/threat scans, movement neighbor queries and `findPath`. All intervals, including hitches, are retained; independent rAF and uncapped simulation scheduling are reported separately. Trace sampling adds overhead. Backend is WebGL; native GPU timing and physical refresh eligibility are unavailable in this diagnostic run. Heap drops are suspected GC only; sampled `(garbage collector)` time is reported separately in the CPU profile.

## Before/after live results

[Archived reports](../docs/performance/2026-10-10-microstutter-results.json) retain every completed diagnostic run, CPU phases, sampled GC, entity/effect counts, memory/counters, and available 1-second/5-second windows. Original interval arrays and CDP profiles are in the `/tmp/microstutter-*.json` / `.cpuprofile` files named in the archive. All runs use unchanged WebGL/procedural-water settings, 1440×1000 viewport and actual canvas DPR 2. No competing benchmark ran concurrently. Individual single-run results are evidence for investigation, not three-repeat acceptance certification.

| Fixture / runtime | Independent rAF FPS | Interval p95 / p99 / max (ms) | Average CPU update / render (ms) | CPU work frames >13.333 ms |
| --- | ---: | --- | --- | ---: |
| Battle, original, headless SwiftShader | 19.95 | 83.3 / 83.4 / 133.5 | 21.60 / 2.38 | 911 / 911 |
| Battle, all fixes, headless SwiftShader | 20.75 | 66.8 / 100.0 / 183.3 | 15.94 / 2.47 | 929 / 960 |
| Full map, original, headless SwiftShader | 24.71 | 66.7 / 83.4 / 200.0 | 15.83 / 1.56 | 1005 / 1233 |
| Full map, all fixes, headless SwiftShader | 25.76 | 50.1 / 83.3 / 133.3 | 11.28 / 1.58 | 571 / 1360 |
| Full map, original, headed production M1 Metal | 74.56 | 14.3 / 14.4 / 253.5 | 3.47 / 1.37 | 72 / 6329 |
| Full map, all fixes, headed production M1 Metal | 74.90 | 14.3 / 14.4 / 40.0 | 2.49 / 1.35 | 16 / 7083 |
| Battle, original, headed production M1 Metal | 74.53 | 14.3 / 14.4 / 80.9 | 3.95 / 2.28 | 134 / 5521 |
| Battle, all fixes, headed production M1 Metal | 59.97 | 17.6 / 17.7 / 33.4 | 2.78 / 2.28 | 28 / 6161 |
| Battle, original, requested fixed window, M1 Metal | 37.28 | 149.9 / 200.0 / 250.0 | 7.25 / 5.52 | 444 / 2329 |
| Battle, all fixes, requested fixed window, M1 Metal | 59.99 | 17.6 / 17.7 / 33.2 | 2.80 / 2.26 | 25 / 6190 |

CPU averages are per game render iteration, including iterations with no simulation tick. Changing render-loop iteration counts means their percentage reduction is not automatically the reduction in total simulation CPU over 60 seconds. Independent rAF and game-loop sample counts differ because the existing benchmark disables the frame limiter. The full-map route travels approximately 108,026 logical pixels at 1800 px/s, completing four two-lap route cycles. Its first traversal is measured immediately after scenario readiness; no extra warmup lap hides it. Eight player units are selected for layered sprites and selection overlays. Battles include actual firing and destruction as well as the persistent smoke/dust/explosion fixture.

M1 full-map final-window AI average/p95/max falls from 0.95/4.9/18.6 ms to 0.19/1.1/10.5 ms. Whole-recording sampled GC is 478.3 ms original versus 426.0 ms optimized. Native heap ranges are 24.4–57.8 MB original and 25.7–55.2 MB optimized; ending deltas +23.6 MB versus +1.6 MB are single-run observations, not proof of long-term stable memory. Final WebGL-pass GPU query samples are 2.25 ms versus 0.35 ms, but differing camera/time and single final queries prohibit interpreting these as GPU performance averages. They omit Canvas effects and browser composition. The headless traversal sampled GC falls from 248.3 to 148.9 ms; its quantized heap readings cannot prove absence of allocations or collections.

The initial four-fix battle run also remains in the archive: 21.78 rAF FPS, p95/p99/max 66.7/99.9/150.1 ms, average update/render 13.74/2.25 ms. Although CPU cost improved, battle p99/max did not consistently improve across software runs. Do not claim every hitch or explosion stall was removed. Native effects submission still exhibits occasional >13.333 ms spikes, while its normal average is about 0.25 ms; this can include scheduling/GC pauses and needs a trace synchronized to the particular hitch.

The host has a built-in Color LCD and an LG ULTRAWIDE at 3840×1600 / 75 Hz. Native callback cadence varies between approximately 75 and 60 Hz. The attempted `--window-position=100,100` did not produce identical observed coordinates, and the baseline attempt contains large unresolved stalls. These rows remain visible, but the pair cannot certify equivalent display/visibility conditions or isolate a FPS regression. Playwright's emulated `screen.width/height` describe the context, not a physical monitor. Raw deadline counts include browser/display jitter: callbacks alternate around the nominal period with roughly 0.1 ms timestamp granularity; they are not independently verified dropped presentations. CPU over-budget counts demonstrate remaining application work spikes even without resolving that ambiguity. Refresh/visibility control and clean repeated recordings remain outstanding.

Exact after/before recording commands (substitute the original-server port for the optimized-server port):

```sh
# Development diagnostic; original snapshot uses port 5174, current source 5173.
PERF_BASE_URL=http://127.0.0.1:5174 PERF_SCENE=traversal node scripts/performance/microstutterBenchmark.mjs /tmp/microstutter-traversal-before.json
PERF_BASE_URL=http://127.0.0.1:5173 PERF_SCENE=traversal node scripts/performance/microstutterBenchmark.mjs /tmp/microstutter-traversal-after.json

# Production build: optimized npm run build; original snapshot uses direct Vite
# build to avoid prebuild version writes. Serve these builds in separate shells.
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5175 --strictPort
# In original snapshot /tmp/gemini-rts-microstutter-baseline:
node node_modules/vite/bin/vite.js build --outDir /tmp/gemini-rts-baseline-dist
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5176 --strictPort --outDir /tmp/gemini-rts-baseline-dist

PERF_HEADED=1 PERF_PRODUCTION=1 PERF_BASE_URL=http://127.0.0.1:5176 PERF_SCENE=traversal node scripts/performance/microstutterBenchmark.mjs /tmp/microstutter-m1-traversal-before.json
PERF_HEADED=1 PERF_PRODUCTION=1 PERF_BASE_URL=http://127.0.0.1:5175 PERF_SCENE=traversal node scripts/performance/microstutterBenchmark.mjs /tmp/microstutter-m1-traversal-after.json
PERF_HEADED=1 PERF_PRODUCTION=1 PERF_BASE_URL=http://127.0.0.1:5176 node scripts/performance/microstutterBenchmark.mjs /tmp/microstutter-m1-combat-before.json
PERF_HEADED=1 PERF_PRODUCTION=1 PERF_BASE_URL=http://127.0.0.1:5175 node scripts/performance/microstutterBenchmark.mjs /tmp/microstutter-m1-combat-after.json
# Additional placement attempts used the same battle commands with
# PERF_WINDOW_POSITION=100,100 and output suffix m1-combat-fixed-before/after.
```

The original source snapshot was materialized with `git show` from `095559ccc0a3f452e572ff600309394629647894`; only unchanged public assets and node_modules were shared. Current gameplay source was frozen throughout each matched measurement series. Profiling overhead and diagnostic UI were enabled equally. The new script's development-only CPU-array capture and low-frequency GPU-pass/display metadata improve future reproductions; production CPU tails remain unavailable rather than substituted with zeros.

## Possible causes and prioritized TODOs

- [x] Repeated base-defense searches: reuse a player-pass threat snapshot and maintain live defender counts without delaying reactions. Storage is reused; weapon eligibility and nearest-target ties remain intact.
- [x] A* open-set scans: replace neighbor-by-neighbor heap scans and `indexOf` with indexed decrease-key lookup, preserving tie order, mine rules, occupancy and strict destinations.
- [x] Collision tree churn: reuse bounded nodes between rebuilds; preserve center-based positions, self-exclusion, deterministic traversal and explicit disposal.
- [x] Terrain rounds camera positions down while entities/GPU water use fractional positions: remove per-layer rounding, retain fractional translation without resizing source art.
- [x] Repeated allocations while units fire in range, harvest, unload, lack fuel/driver or undergo repairs: retain empty paths and zero existing movement vectors. Tests exercise repeated ticks and object identity, not just numeric equality.
- [x] Diagnostic verification: record movement/combat/full-map scrolling, independent tails, CPU phases, heap and GC evidence; inspect residual hotspots. This closes recording work only, not the physical smoothness gate.
- [ ] Fixed 60 Hz simulation positions are rendered without local interpolation. Investigate separately if high-refresh movement remains uneven after CPU spikes are removed; do not mutate authoritative positions just to smooth rendering.
- [ ] Bullet collision and some support/targeting paths still scan entities. Optimize only with demonstrated benefit and collision/target-order parity, including airborne height offsets.
- [ ] Sound cache misses/audio node creation, dirty terrain preparation after destruction, large procedural explosion raster work and synchronized AI decisions remain candidate hitch sources. `preloadSounds()` explicitly skips preparation; effects fetch/decode on first use (concurrent identical loads are already deduplicated). Measure with audio enabled before changing that existing lazy-loading policy. Effects CPU submission alone does not measure GPU raster time.
- [ ] Qualifying physical hardware: cold traversal, repeated full-map laps, selected layered units, movement, firing, procedural water, 40/200/500-unit scenes, three serial ≥60-second runs at unchanged quality. Capture actual GPU/DPR/refresh, p95/p99/max, CPU/GPU time and zero application-caused missed 13.333 ms deadlines. No diagnostic average can close this task.

## Threading assessment

`GameLoop` runs simulation, AI, physics, pathfinding and Canvas submission on the browser main JavaScript thread. WebGL/WebGPU work is submitted to the graphics stack; the PWA service worker handles caching, not simulation. There is no simulation worker. A worker is possible for immutable pathfinding/map snapshots, but async completion needs deterministic application ordering, cancellation and occupancy/version validation for lockstep/replay. Transferring entire mutable game state each tick would introduce copies and synchronization. First measure the algorithmic fixes; retain worker work as a candidate only if CPU traces still show pathfinding dominating the frame deadline.

## Hot-loop cost budget

Simulation runs at 60 ticks/s. For 320 units, an O(N²×B) base-defense search performs up to 6.14 million unit-pair checks/s before building checks (500 units: 15 million/s). Prepare once per AI player pass instead, reuse storage and update defender counts in constant time. A* runs on commands/replans, potentially many times in one tick; lookups must be O(1) and heap repair O(log frontier). The quadtree rebuilds at most once/tick (60/s), retaining nodes within existing maximum depth 6. Rendering runs once per displayed/uncapped frame; camera translation is O(1), replaces existing per-visible-tile rounding, and adds no draws. At 1440×1000 DPR 2, backing pixel area is 5.76 million pixels before sidebar deduction; add no fills, gradients, sprite scaling or blending passes.

Repeated blocked-state resets previously allocated up to three replacements/unit/tick: 320 blocked units × 60 ticks × 3 = 57,600 objects/arrays/s (500 units: 90,000/s). The replacement only allocates absent state or a transition from a nonempty path; subsequent ticks preserve identities. DPR has no multiplier on this CPU work. Independent rAF timing, CPU collection and profiler sampling in the benchmark add diagnostic overhead; they do not enter the normal game runtime.

## Validation and remaining acceptance

Implemented regression checks pass: `npm run test:unit` (235 files / 4666 tests), `npm run lint:fix:changed`, `npm run lint`, `npm run build`, and `PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test tests/e2e/movementCombatPacing.test.js --project=chromium --workers=1 --reporter=line` (one passing behavioral test). A live diagnostic comparison of 400 deterministic randomized 32×32 routes against baseline `095559ccc0a3f452e572ff600309394629647894` produced no path mismatches across occupied starts, rocks, roads, strict destinations and street-only options; original 37.4 ms versus optimized 26.1 ms. This supplemental check is not an FPS certificate.

The browser test observes movement, firing, damage and actual non-loop explosions, then captures transformed Canvas image anchors to prove terrain, a building and a unit translate identically under fractional scrolling at DPR 2. Unit tests additionally verify live defender quotas, air-target eligibility, threat refresh, quadtree traversal parity/self-exclusion/disposal and repeated stopped-state storage reuse.

The 75 FPS gate remains open: application CPU spikes persist, iPhone measurements and the full physical acceptance matrix remain outstanding. Headed Metal runs expose the existing WebGL-pass timer; final report samples and low-frequency samples do not measure the whole Canvas/compositor critical path. Headless SwiftShader reports `EXT_disjoint_timer_query_webgl2-unavailable`. Simulation work and independent rAF intervals are reported separately; uncapped in-game FPS is not presented FPS. Do not mark the microstutter issue complete from these improvements alone.

Production reports expose aggregate CPU averages/maxima and the final 600-frame phase p95, but not whole-recording CPU p99. The diagnostic development mode additionally retains per-frame CPU update/render/work arrays and summarizes their p50/p95/p99/max. Independently measured rAF p95/p99/max and missed deadlines always cover the entire recording. This observability gap remains part of the hardware acceptance work.

Final instrumentation smoke check: `PERF_DURATION_MS=5000 PERF_SCENE=traversal node scripts/performance/microstutterBenchmark.mjs /tmp/microstutter-instrumentation-check.json`; no page errors, 110 CPU frame samples, five one-second buckets and one five-second bucket, actual DPR 2. This short check validates data collection only and is excluded from the comparative 60-second table. The added script also passes `npx eslint scripts/performance/microstutterBenchmark.mjs` and `node --check scripts/performance/microstutterBenchmark.mjs` without rule exceptions.
