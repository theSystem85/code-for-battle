# Deterministic worker performance

## Outcome and assessment

The user accepted the improved performance and requested ending implementation without further optimization. Completed CPU and loading changes preserve effect pixels and animation cadence. Physical 75 FPS certification and broad replay correctness remain outstanding; this note does not certify either.

The unchanged pre-follow-up working tree, including earlier movement and scrolling fixes, was captured at `/tmp/gemini-rts-worker-baseline` before coding. First-use 1024×1024 explosion black-key conversion took 22.3 ms cold and 6.7/6.8 ms on subsequent decoded images; 1,000 cached lookups took 0.1–0.3 ms. Moving conversion into readiness-controlled preparation directly removes this first-death CPU stall from gameplay.

## Completed work and remaining checks

- [x] Measure first-use conversion, AI bursts, firing and physics costs before implementation.
- [x] Prepare explosion sheets in a worker before gameplay, with identical startup fallback pixels and explicit failure propagation.
- [x] Spread periodic AI across deterministic simulation-tick phases, preserving 20 Hz per-player decisions with the normal three enemies.
- [x] Reduce friendly-tile collision work, projectile options/trail allocation and Apache target searches without asynchronous simulation mutation.
- [x] Fix hypothetical firing positions blocking themselves and invalid target coordinates producing unbounded line traversal.
- [x] Evaluate impact effects separately: measured effect rendering averaged approximately 0.24 ms and peaked at 1.9 ms; preserve existing effects and synchronous damage/RNG order.
- [x] Verify worker transfer/failure/timeout, stale editor completion, exhaustive alpha arithmetic parity, asset readiness and actual production death animation.
- [x] Record native M1 frame/CPU tails, backend/DPR and profiler evidence; retain unsuccessful prototype captures.
- [ ] Resolve the existing full four-player replay divergence; baseline already fails the unchanged 99% comparison threshold.
- [ ] Certify the full physical 75 FPS matrix, including iPhone 13 Pro Max. The user requested stopping additional tuning and measurements.

## Threading decision

Rendering and authoritative AI/physics currently execute on the main JavaScript thread. Only pure explosion-sheet pixel preparation moves into a Web Worker. It transfers decoded ImageBitmap input and prepared output through OffscreenCanvas, with one serial preparation job, termination/error/10-second timeout handling and the exact main-thread fallback before readiness. The worker never reads simulation state, advances its clock or consumes simulation RNG.

AI, firing, physics and damage share live entity references, occupancy and a seeded RNG stream. Worker conversion would require immutable tick snapshots, deterministic barriers and stable result application order; applying results when they arrive would make outcomes depend on scheduling. Snapshot copying and blocking for results would add cost without evidence of benefit. Keep authoritative physics and combat synchronous and reduce repeated work. AI phases derive from saved simulation time and fixed tick duration, with stable player ordering and host/replay guards; unrelated game instances cannot shift the phase through a private invocation counter.

At 60 ticks/s and 320 entities, one pair scan can perform 6.14 million checks/s (15 million at 500). CPU work has no DPR multiplier. At 1440×1000 DPR 2 the viewport contains 5.76 million backing pixels, so no additional large translucent fills were introduced. Projectile target indexing builds once, lazily, per relevant bullet pass and preserves first-live-ID and earlier-impact death semantics. Collision checks retain live center-based tiles and self-exclusion because positions can change within the same physics pass. Trail storage retains identity and exact 300 ms expiry.

A pooled friendly-shot spatial grid prototype preserved boolean checksums but increased representative firing costs: near-target median 60-pass runs changed from 8.8 to 9.2 ms at 320 units and 20.5 to 22.6 ms at 500; inclusive live shot cost also regressed. The prototype was removed. No shot-grid implementation remains.

## Preparation lifecycle and quality

Default and configured explosion sheets complete preparation before gameplay. Render callbacks only look up prepared textures; they neither decode nor launch workers. Relative and absolute paths share canonical assets. Owned retained resources are bounded to 16 MiB decoded RGBA per sheet, 64 MiB for source plus processed textures, 32 sheets and bounded aliases; this does not bound the browser's temporary decoder memory before size validation. Editor changes publish only after preparation and ignore older jobs finishing late. Failed swaps retain current art; failed required startup assets display an error and never start gameplay. Late parallel sprite progress cannot overwrite that error.

Existing sprite frame resampling remains the prepared-rendering policy conflict documented in the earlier frame-pacing spec and rendering ownership plan. This work does not silently exempt it or reduce visual fidelity. Earlier fractional terrain-camera alignment fixes remain in place and are verified against unit/building anchors at DPR 2.

## Native live results

Fixture: Apple M1 MacBookPro17,1, Chromium 156, ANGLE Metal Apple M1, headed, DPR 2, 1440×1000 viewport, seed 11, 100×100 map, four players, 320 mixed units, procedural water and unchanged recurring smoke/dust/explosion effects, 60 seconds with no warmup. Benchmark disables the application frame limiter consistently in both versions. Independent rAF measurements differ from the application's counter; use independent measurements for FPS.

| Capture | Independent FPS | Update p95 / p99 / max ms | Update misses | Total CPU p95 / p99 / max ms | Total CPU misses |
| --- | ---: | --- | ---: | --- | ---: |
| Baseline 1 | 74.85 | 5.9 / 7.5 / 47.8 | 12 | 8.5 / 10.4 / 52.9 | 25 |
| Baseline 2 | 74.93 | 5.5 / 7.0 / 22.0 | 13 | 8.0 / 9.7 / 32.5 | 20 |
| Baseline 3 | 74.90 | 5.9 / 7.3 / 36.5 | 13 | 8.5 / 10.0 / 40.8 | 20 |
| Final hot paths | 74.97 | 5.7 / 6.8 / 15.1 | 4 | 8.1 / 9.5 / 20.0 | 12 |

Final rendering p95/p99/max: 2.7/3.4/10.8 ms, zero render CPU deadline misses. Independent frame intervals p95/p99/max: 15.2/15.4/26.8 ms. CPU deadline is 13.333 ms; final total CPU still missed it 12 times across 6,263 samples. This is useful improvement, not proof of stutter-free or 75 presented FPS. The final capture precedes only startup-error handling changes, which do not execute in successful gameplay.

One rejected-prototype capture fell to 49.43 FPS with cliff drawImage stalls (terrain max 210 ms); a clean repeat reached 74.93 FPS. Both are retained, and the cause of that intermittent raster stall is unresolved. Profiler GC self-time was approximately 465 ms in baseline 1; retained heap samples and profiler summaries are in the report. Available WebGL GPU timing covers its pass rather than the entire Canvas/compositor, and no memory-leak or GPU-wide certification is claimed. Additional repeated traversal/scaling/iPhone captures were not pursued after the user's stop request. Earlier scrolling coverage is recorded in the movement/combat frame-pacing spec.

Evidence: [Worker performance report](../docs/performance/2026-10-10-worker-performance-results.json), [earlier movement and scrolling assessment](2026-10-10-movement-combat-frame-pacing.md). Raw diagnostic JSON and CPU profiles remain under `/tmp/worker-combat-*.json` and matching `.cpuprofile` files.

Reproduce before/after:

```sh
PERF_BASE_URL=http://127.0.0.1:5174 PERF_HEADED=1 node scripts/performance/microstutterBenchmark.mjs /tmp/worker-combat-before.json
PERF_BASE_URL=http://127.0.0.1:5173 PERF_HEADED=1 node scripts/performance/microstutterBenchmark.mjs /tmp/worker-combat-final-1.json
PERF_BASE_URL=http://127.0.0.1:5173 node scripts/performance/combatCpuBenchmark.mjs /tmp/combat-cpu.json
```

## Verification

Final full-unit result: 238 files and 4,683 tests passed. Changed lint, full lint and the production build passed. Development focused browser coverage passed four tests before the final startup-error guard; final production coverage passed both tests in 11.5 seconds, including that guard.

Run full units with `npm run test:unit`, changed lint with `npm run lint:fix:changed`, full lint with `npm run lint`, and production preparation with `npm run build`. Development browser coverage checks exhaustive worker/fallback pixels, movement/firing/death, no gameplay sheet readback, canonical cache identity and fractional scrolling alignment. Production browser coverage checks the emitted worker chunk, actual death animation and missing required assets:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test tests/e2e/explosionPreparation.test.js tests/e2e/explosionWorkerBuild.test.js tests/e2e/movementCombatPacing.test.js --project=chromium --workers=1 --reporter=line
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test tests/e2e/explosionWorkerBuild.test.js --project=chromium --workers=1 --reporter=line
```

The existing full replay test required updating its storage reader from removed localStorage saves to IndexedDB/compact decoding; comparison thresholds were preserved. Current four-player playback agrees at 91.15%, frozen baseline at 91.70%, both below required 99%, with the same building/milestone/AI-budget mismatch branches. Broad pre-existing replay divergence remains unresolved. Focused deterministic AI phase and presentation-only worker state/RNG tests pass; these cannot certify the entire replay pipeline.
