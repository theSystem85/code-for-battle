# Unit-heavy CPU performance

Target at least 60 FPS through representative foreground gameplay, with a 16.67 ms frame budget. This is also the repository hardware acceptance threshold. A finite supported scene, camera speed, viewport, display and graphics envelope is needed to interpret the result. Browser scheduling, system interruptions and unconstrained entity counts prevent a universal minimum-FPS guarantee.

## CPU improvement backlog

- [x] Replace army-wide unit scans in separation and yield checks with a live spatial query. The baseline sampled about 3.9 seconds under separation, including 2.0 seconds in the position blocker. Use the existing exact terrain, occupancy, ground-domain, distance and wreck checks on spatial candidates. Keep the pre-movement quadtree for the existing contact detection flow. [Collision results](#local-comparison)
- [x] Prepare all eligible wreck sprite variants before gameplay and publish them by sprite generation and density. Profiled gameplay frames spent up to about 564 ms inside a synchronous wreck-sprite pixel readback. Preserve the desaturation and noise at the current visual quality. [Wreck sprite report](../docs/performance/2026-11-18-wreck-sprite-preparation.md)
- [x] Audit asynchronous preparation after save restore. In the baseline, render work on one frame reached 321.6 ms, and a clean post-change run still recorded 932 ms and 871 ms long tasks dominated by bitmap creation and decoration layout. Make the restored map and sprite generation explicitly ready before gameplay starts, then measure the first full traversal. [Save-restore report](../docs/performance/2026-11-18-save-restore-readiness.md)
- [x] Bound AI breach planning work per tick. The baseline sampled 2.4 seconds in `planWeakestBreach`, including 1.4 seconds in `findMinPeakPath`. Measure search work per tick, reuse compatible results, and investigate resumable searches with deterministic work quotas and invalidation on map or danger changes. [AI breach report](../docs/performance/2026-11-18-ai-breach-budget.md)
- [x] Profile the remaining movement cost at 400 and 500 units. Investigate repeated contact queries, the friendly-waypoint owner-list scan, and idle-unit movement work. Keep blocked units, hazards, service movement and flight behavior covered. [Movement report](../docs/performance/2026-11-18-live-movement-lookups.md)
- [x] Profile ambulance, tanker and recovery candidate selection. Reuse spatial and ID lookups across support systems where eligibility and deterministic tie order allow it. [Service unit report and stationary setup](../docs/performance/2026-11-18-service-unit-index.md)
- [x] Measure fog visibility reset and reveal separately. If still material, track previously touched cells while preserving discovery, sight range, renderer invalidation and save/load behavior. [Fog visibility report](../docs/performance/2026-11-18-sparse-fog-visibility.md)
- [x] Document the tested reference workload and capture the combined optimizations in a stationary battle without V8 profiling. [Combined hardware report](../docs/performance/2026-11-18-stationary-battle-60-fps.md)
- [ ] Pass physical 60 FPS acceptance under [the rendering performance plan](../performance_improvement.md), including the layered naval case, confirmed refresh, and cold and repeated traversal. The current hardware run misses the deadline.

## Hot-loop and occupancy audit

At 60 simulation ticks/s, 400 starting units represent up to 24,000 index inserts and 24,000 post-movement update checks per second at normal speed. A separation can try five destinations, so scanning all 400 units once per attempt could perform up to 2,000 entity checks for one separation, before subsequent corrections. The new broad phase visits at most four 64px cells per separation query at the 22.8px minimum distance. Dense cells can still hold multiple units. Cell buckets and the query output array are reused. Existing occupancy remains center-based, the moving unit’s own contribution is subtracted, and pushed units are moved between buckets as soon as their position changes. The CPU work runs at simulation cadence and is independent of canvas DPR. The measured native DPR is 2, with four backing pixels per logical pixel and unchanged drawing code.

## Reproduce

Start `npm run dev -- --host 127.0.0.1 --port 4176 --strictPort`. Run the following commands serially with Chrome foregrounded. Run the first command on the base source with the benchmark script available. Restart Vite from the changed source before the second command, reusing the exact fixture. Use a fresh server for each source revision so Vite hot updates cannot leave split module instances.

```sh
BENCHMARK_CREATE_FIXTURE=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/baseline node scripts/benchmark-unit-heavy.mjs
BENCHMARK_FIXTURE=tmp/unit-heavy/baseline/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/after node scripts/benchmark-unit-heavy.mjs
```

The benchmark verifies Chrome hardware rasterization, creates a four-party 200×200 seed-11 save starting with 400 mixed units, and loads it through the game save system. It selects the human tanks and scrolls the loaded battle and full map at 3,600 logical pixels/s for 60 seconds or two laps, whichever takes longer. Normal simulation, firing, terrain and procedural water remain active. Combat changes the live unit count. Metrics use independent requestAnimationFrame cadence, reported app CPU update/render time, a sampled V8 CPU profile, WebGPU terrain timer samples where available and heap samples. The minimum FPS counts callbacks in the worst trailing one-second window. The slowest-frame equivalent is also recorded.

## Local comparison

Measured on the local Apple M1 GPU in headed Chrome 157.0.8103.79, ANGLE Metal, automatic renderer selection with WebGPU terrain, native DPR 2, 950×739 CSS-pixel game canvas (1900×1478 backing), and a roughly 60 Hz idle callback cadence. Each of the four runs lasted 60 seconds, covered 2.94 laps, loaded the same 400-unit save, selected 38 tanks, and recorded no page errors. Peak concurrent projectiles ranged from 45 to 58. FPS is browser callback cadence. It does not directly measure presented frames.

| Capture | Average FPS | Minimum 1 s FPS | Frame p95 / p99 / max (ms) | Intervals over 16.67 / 13.33 ms |
|---|---:|---:|---:|---:|
| Profiled dev baseline | 47.10 | 4 | 33.4 / 150.0 / 466.5 | 1,643 / 2,827 |
| Profiled with index | 45.68 | 2 | 33.3 / 148.4 / 916.8 | 1,547 / 2,742 |
| Unprofiled dev baseline | 46.70 | 2 | 33.3 / 133.2 / 985.1 | 1,682 / 2,803 |
| Unprofiled with index | 46.22 | 1 | 32.9 / 133.8 / 1,031.3 | 1,681 / 2,774 |

The unprofiled comparison changed average FPS by −1.03% and minimum one-second FPS by −50% (one fewer frame in that window). Its slowest-frame equivalent changed from 1.02 to 0.97 FPS. The profiled comparison changed average FPS by −3.03% and minimum one-second FPS by −50%. Both pairs measured lower FPS after the CPU change. The raw interval budget counts include small browser timing variations around 16.67 ms.

| Capture | CPU update mean / p95 / p99 / max (ms) | CPU render mean / max (ms) | Terrain GPU p95 (ms, sampled) | Peak sampled heap (MiB) | Long tasks |
|---|---:|---:|---:|---:|---:|
| Profiled dev baseline | 11.39 / 27.90 / 77.00 / 192.80 | 0.92 / 321.60 | 10.88 | 257.0 | 77 |
| Profiled with index | 10.39 / 22.20 / 71.10 / 152.10 | 0.95 / 569.80 | 11.47 | 273.5 | 52 |
| Unprofiled dev baseline | 11.00 / 21.20 / 73.50 / 234.80 | 1.15 / 936.70 | 9.31 | 246.8 | 73 |
| Unprofiled with index | 10.19 / 17.40 / 72.90 / 230.60 | 1.00 / 674.10 | 3.60 | 247.1 | 51 |

Mean CPU update fell 8.75% in the profiled pair and 7.42% in the unprofiled pair. Inclusive V8 samples in `applySafeSeparation` fell from 3.877 s to 0.085 s (97.8%). Inclusive samples in `updateUnitMovement` fell from 14.063 s to 10.537 s (25.1%). GC samples moved from 0.296 s to 0.310 s. End-of-run survivors varied from 173 to 194, so the aggregate comparison is representative gameplay with run-to-run workload variation.

For the second pair, use the same fixture and omit `BENCHMARK_PROFILE`. The baseline ran against a separate local archive of `dev` at `83bbe651` on port 4177, using `BENCHMARK_URL=http://127.0.0.1:4177` with `BENCHMARK_OUTPUT=tmp/unit-heavy/baseline-unprofiled`. Both reported runs of the patch used a clean server with `BENCHMARK_URL=http://127.0.0.1:4178` and `BENCHMARK_OUTPUT` set to either `tmp/unit-heavy/after-fresh-profiled` or `tmp/unit-heavy/after-fresh-unprofiled`. The profiled baseline is in `tmp/unit-heavy/baseline`. The raw frame samples and DevTools CPU captures are in those directories. Earlier patch captures from the hot-reloaded server are retained in `tmp/unit-heavy/after` and `tmp/unit-heavy/after-unprofiled` for diagnosis. The first baseline's raw one-second summary predates correction of an off-by-one count. The table uses its raw intervals with the corrected count.

The longest profiled tasks align with post-load decoration and terrain preparation, wreck-sprite pixel readback during rendering, and AI breach planning. The normal save loader can return and expose the game before all asynchronous map work retires. The captures retain those stalls. The fixture focuses on layered land units, Apache helicopters, support vehicles and active combat. A separate layered naval fixture and hardware-backed presented-frame acceptance on a 60 Hz or faster display remain pending. The measured scene misses the 60 FPS target.

## Functional verification

- The focused unit regression covers live cross-cell positions and center-based self-occupancy. Boarding collision coverage also exercises the indexed response.
- `npm run test:unit` passed 5,891 tests. The single failure, `U05433`, reported 98 different alpha pixels for the woodland soil sprite sheet and reproduced with the same count on the unmodified `dev` snapshot.
- All four focused Playwright checks passed after restarting Vite. The stale HMR server failed the mine detonation check while the clean branch server and the unmodified dev snapshot passed it.
- Both `npm run lint:fix:changed` and `npm run lint` passed.
