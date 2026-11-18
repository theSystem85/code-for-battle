# Apache impact flash overdraw

The orange flash now composites the opacity of eight concentric source-over fills in one fill. The expanding radius and fading additive core retain their timing. The band interiors use the previous blended opacity, and the internal antialiased edges are now gradient boundaries. Other particles keep their existing paths.

At 60 render frames per second and 18 simultaneous flash particles, the old orange glow can submit 8,640 fills per second, versus 1,080 after the change. The sum of the eight disks is 3.19 times the outer disk area. At DPR 2 each covered CSS square pixel corresponds to four backing pixels. The gradient adds color stops per flash. Direct impact GPU timing was unavailable, so these are operation and coverage counts.

```sh
BENCHMARK_URL=http://127.0.0.1:4192 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-impact-before node scripts/benchmark-unit-heavy.mjs
# Repeat after applying the renderer change with BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-impact-after.
node scripts/performance/report-unit-heavy.mjs tmp/unit-heavy/gpu-impact-before tmp/unit-heavy/gpu-impact-after
```

Both 60-second runs used headed Chrome 157.0.8103.79, verified hardware rasterization on the Apple M1 Metal adapter, WebGPU terrain, DPR 2 and a 950×739 CSS-pixel viewport. The same save started with 500 units and 47 selected tanks. The camera completed zero route laps. The harness passed `?tutorial=0` and verified no tutorial controller or overlay after the capture. The defeat guard kept combat running. Both captures recorded zero browser errors.

| Metric | Before | After |
| --- | ---: | ---: |
| Average callback FPS | 2.087 | 2.086 |
| Minimum callback FPS over one second | 2 | 2 |
| Frame interval p95 / p99 / max (ms) | 966.9 / 983.1 / 984.1 | 967.6 / 983.5 / 983.5 |
| Intervals over 16.67 ms | 125 | 124 |
| Mean CPU update (ms) | 41.08 | 46.10 |
| Mean CPU render submission (ms) | 4.21 | 4.20 |
| Terrain GPU p95 (ms) | 20.97 | 21.17 |
| JS heap p95 (MiB) | 243.14 | 191.83 |
| Peak Apache rocket centers in viewport | 21 | 21 |
| Peak impact centers in viewport | 18 | 29 |
| End units | 481 | 467 |

Average changed by −0.03% and minimum by 0%. Battle evolution varied across runs. V8 attributed about 15 ms before and 9 ms after in total to JavaScript in the impact module across the entire capture. These measurements show no FPS improvement or demonstrated 60 FPS acceptance. Terrain timestamps cover terrain only. Actual impact raster timing, physical display presentation, and cold and repeated scrolling acceptance remain open. The CPU profile's long idle intervals also leave the primary cause of the callback delays unisolated.

Lint passed. The full unit suite passed 5,898 cases, including the new band-composition test. The known `U05433` sprite-worker alpha assertion failed again and previously reproduced on the unchanged dev baseline.
