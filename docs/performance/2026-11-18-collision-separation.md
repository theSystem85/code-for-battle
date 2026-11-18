# Crowded-unit collision separation

Original [CPU performance spec and reproduction commands](../../specs/2026-11-17-unit-heavy-cpu-performance.md).

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
