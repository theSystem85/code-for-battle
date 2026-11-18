# Combined CPU and GPU FPS comparison

The baseline is the original `dev` branch point `83bbe651`. Its temporary build received the one-line `?tutorial=0` startup guard from `0a8a917a` so the tutorial could be disabled consistently. The comparison production bundle includes the final game runtime through `cabbb3fc`. It was built with the standby-canvas patch before that commit was created, so its embedded commit label is `69aac537`. Later changes through `eef9c4bc` affect benchmark tooling and documentation.

All four runs used the same 500-unit save loaded through the game's import UI. The benchmark held the camera fixed, protected construction yards against defeat, and measured the first 60 seconds after the loading screen closed. Chrome recorded animation callbacks and compositor presentation feedback. Earlier per-item results covered different milestones, routes and unit counts and cannot be added to give a combined FPS number.

## Reproduce

Serve the baseline and final production builds on ports 4194 and 4193 respectively. In the baseline snapshot, apply the tutorial startup patch only. [Production setup and fixture instructions](2026-11-18-physical-display-acceptance.md)

```sh
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1
export BENCHMARK_PROFILE=1 BENCHMARK_COMPOSITOR_TRACE=1
BENCHMARK_URL=http://127.0.0.1:4194 BENCHMARK_OUTPUT=tmp/unit-heavy/total-dev-stationary node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4193 BENCHMARK_OUTPUT=tmp/unit-heavy/total-final-stationary node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4193 BENCHMARK_OUTPUT=tmp/unit-heavy/total-final-stationary-repeat node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4194 BENCHMARK_OUTPUT=tmp/unit-heavy/total-dev-stationary-repeat node scripts/benchmark-unit-heavy.mjs
for run in total-dev-stationary total-final-stationary total-final-stationary-repeat total-dev-stationary-repeat; do
  node scripts/performance/report-unit-heavy-presentation.mjs "tmp/unit-heavy/${run}/compositor.json"
done
```

## Results

The runs used the Apple M1 GPU, built-in 60 Hz Retina display, headed Chrome 157.0.8103.79, hardware WebGPU terrain, DPR 2, and a 950×739 CSS-pixel viewport. The baseline started with 500 live units and the final runs with 499 after import. All runs had 47 selected tanks, 18–21 Apache rockets and 18–19 impact centers at peak, 480–481 surviving units, and zero page errors.

| Run | Average presented FPS | Minimum presented FPS (1 s) | Average callback FPS | Presentation p95 / p99 / max (ms) |
| --- | ---: | ---: | ---: | ---: |
| Dev A1 | 2.083 | 0 | 3.773 | 966.7 / 1,000.0 / 1,149.9 |
| Final B1 | 2.170 | 1 | 2.072 | 966.6 / 966.7 / 983.3 |
| Final B2 | 2.059 | 1 | 2.094 | 966.6 / 983.3 / 983.3 |
| Dev A2 | 2.103 | 0 | 3.859 | 983.3 / 1,000.0 / 1,066.6 |

| Two-run mean | Dev | Final | Change |
| --- | ---: | ---: | ---: |
| Presented FPS | 2.093 | 2.115 | +0.021 FPS (+1.03%) |
| Presented FPS after the first 10 s | 2.141 | 2.117 | −0.024 FPS (−1.10%) |
| Callback FPS | 3.816 | 2.083 | −45.41% |
| CPU update per render frame (ms) | 51.57 | 39.29 | −23.82% |
| CPU render submission per render frame (ms) | 34.47 | 4.35 | −87.39% |
| Import through ready (s) | 1.385 | 3.565 | +2.180 s |

The first pair changed presented FPS by +0.087 and the reversed pair by −0.044. Most of the baseline's extra callbacks occurred early, and they did not translate into more frequent presentation feedback. Preparation also moved work into the load interval. The combined changes reduced measured CPU work and removed the full-second presentation gap in these final samples. The small average presentation difference is within the run variation. There is no demonstrated sustained average FPS gain, and the stationary scene still misses 60 FPS.
