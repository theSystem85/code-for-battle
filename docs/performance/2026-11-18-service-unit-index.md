# Index service units in the stationary battle

Baseline commit `04ea9eb1` compared with this change. These captures seeded local tutorial preferences, but that path did not guarantee suppression. Treat them as historical diagnostics. The camera stays centered on the fight. Each starting construction yard retains at least one health and cannot be sold in the benchmark, so both sides remain in play. Unit combat, damage and destruction continue. Both runs selected 47 tanks, reached 26 simultaneous projectiles, and finished with 481 units.

```sh
BENCHMARK_URL=http://127.0.0.1:4188 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-service-before node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4189 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-service-after node scripts/benchmark-unit-heavy.mjs
```

Both captures used headed Chrome 157.0.8103.79, hardware ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 26.7.3 (Build 25G342)), webgpu terrain, DPR 2, and a 950×739 CSS-pixel viewport. The stationary battle scenario loaded a 500-unit save with the camera held on the battle. V8 sampling was enabled for both runs. Minimum FPS is the worst trailing one-second callback count.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Average FPS | 2.10 | 2.08 | -0.58% |
| Minimum FPS (1 s) | 2.00 | 1.00 | -50.00% |
| Frame p95 (ms) | 966.40 | 967.40 | 0.10% |
| Frame p99 (ms) | 983.60 | 983.70 | 0.01% |
| Frame max (ms) | 999.50 | 1000.30 | 0.08% |
| Intervals above 1000/60 ms | 125.00 | 126.00 | 0.80% |
| Mean CPU update (ms) | 46.24 | 41.12 | -11.06% |
| Mean CPU render (ms) | 4.08 | 4.19 | 2.76% |
| Terrain GPU p95 (ms) | 22.35 | 20.91 | -6.45% |
| JS heap p95 (MiB) | 247.91 | 242.72 | -2.09% |
| Long tasks | 73.00 | 71.00 | -2.74% |
| Save readiness (ms) | 3704.00 | 3674.00 | -0.81% |
| Surviving units | 481.00 | 481.00 | 0.00% |

Browser page errors were 0 before and 0 after. Raw deadline counts include callback timestamp jitter. These are browser callback measurements for this fixture. Physical presented-frame acceptance needs separate evidence.

| V8 self time | Before | After |
| --- | ---: | ---: |
| Ambulance logic | 681 ms | 277 ms |
| Tanker logic | 574 ms | 260 ms |
| Recovery logic | 411 ms | 198 ms |
| Shared service index | — | 37 ms |
| Garbage collection | 89 ms | 79 ms |
| Browser main-thread idle | 49,978 ms | 50,998 ms |

Mean CPU update fell 11.06%. Callback FPS stayed near 2, and the worst one-second window fell from 2 frames to 1 after a 1,000.3 ms callback interval. The stationary scene exposes a large scheduling or presentation delay outside the sampled JavaScript. The tab reported visible and focused in both runs. The data establishes neither a GPU-time cause nor a physical refresh count.

The index runs once per host simulation tick and uses ordered owner groups plus ID lookups from the same live unit references. At 60 ticks/s and 500 units it makes up to 60,000 classification and indexing visits per second across two passes, with the second pass skipped when there are no service vehicles. Position and eligibility tests still inspect live units. The index reuses the provider and owner lists, and the ordering of eligible targets follows the original unit array. The lookups are independent of canvas DPR.

Full lint passed. The full unit suite passed 5,895 cases, with the pre-existing `U05433` sprite alpha mismatch.
