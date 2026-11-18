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

The measurements are in the [collision separation performance report](../docs/performance/2026-11-18-collision-separation.md).

## Functional verification

- The focused unit regression covers live cross-cell positions and center-based self-occupancy. Boarding collision coverage also exercises the indexed response.
- `npm run test:unit` passed 5,891 tests. The single failure, `U05433`, reported 98 different alpha pixels for the woodland soil sprite sheet and reproduced with the same count on the unmodified `dev` snapshot.
- All four focused Playwright checks passed after restarting Vite. The stale HMR server failed the mine detonation check while the clean branch server and the unmodified dev snapshot passed it.
- Both `npm run lint:fix:changed` and `npm run lint` passed.
