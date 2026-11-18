# Frozen-world traversal comparison

This diagnostic holds the simulation loop after loading the 500-unit save, then calls the regular snapshot renderer as the camera traverses the same full-map route at 3,600 CSS pixels per second. The world does not advance and all 500 units remain. This isolates traversal from the unit losses that confounded the [earlier scrolling capture](2026-11-18-active-display-fps.md). It does not reproduce live combat, simulation updates, the normal frame scheduler, or the full running HUD. The stationary battle remains the primary benchmark.

Two fresh headed Chrome 157 runs used the active Apple M1 Metal GPU and Retina display, DPR 2, 47 selected tanks, `?tutorial=0`, and the same fixture hash `65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce`. The blank-page cadence was 60 Hz. Preparation completed before the first lap, including 169 prepared terrain pages. Thus “first lap” means first traversal after normal preparation, not an empty asset or GPU cache. The second lap reuses the same process and world, but cache eviction and asynchronous work can continue, so “repeat lap” is not a guaranteed fully warm cache.

| Run | Lap | Average presented FPS | Worst 1 s FPS | p95 / p99 / max interval (ms) |
| --- | --- | ---: | ---: | --- |
| A | first | 37.338 | 0 | 16.668 / 466.648 / 1149.948 |
| A | repeat | 38.171 | 1 | 16.668 / 499.975 / 883.298 |
| B | first | 36.995 | 0 | 16.668 / 533.312 / 1116.652 |
| B | repeat | 41.209 | 0 | 16.668 / 266.656 / 1083.290 |

The first two laps each last 20.408 seconds. Distinct renderer presentation timestamps are counted within each lap; intervals spanning lap boundaries are excluded from per-lap interval percentiles. The fixed-world captures averaged 39.13 and 40.23 FPS overall, and neither establishes 60 FPS. Both runs had zero simulation-time advancement, zero page errors and 500 ending units. Single-frame terrain chunk statistics were sampled roughly once per second. Sampled chunk misses were zero, peak terrain resident bytes were 201,299,188 and 202,378,684, and up to ten evictions were observed in a sampled frame. These samples are not a complete event count and do not establish which cache activity caused a stall. GPU upload and sprite-streaming events were not correlated in this experiment.

```sh
BENCHMARK_URL=http://127.0.0.1:4193 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_IMPORT_SAVE=1 BENCHMARK_FREEZE_TRAVERSAL=1 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/frozen-traversal node scripts/benchmark-unit-heavy.mjs
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/frozen-traversal/compositor.json
```

The fixed world provides a controlled route baseline. Complete cold-cache manipulation, sprite and upload event correlation, and live movement and combat coverage remain open in the [checklist](2026-11-18-next-performance-checklist.md).
