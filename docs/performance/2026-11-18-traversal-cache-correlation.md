# Traversal cache correlation

This analysis uses the two [frozen-world traversal captures](2026-11-18-frozen-traversal.md), which retain the same 500 units and were recorded with the active Apple M1 GPU and Retina display. Each run's ten longest consecutive renderer presentation gaps are compared with the most recent sampled terrain statistics at or before the gap, provided the sample is at most one second old. Samples represent single rendered frames, not cumulative events. They can miss activity between samples.

| Capture | Long gaps with a recent sample | Samples reporting zero chunk misses | Samples reporting an eviction | Samples reporting queued chunks | Oldest included sample |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 9 / 10 | 9 / 9 | 6 / 9 | 7 / 9 | 988 ms |
| B | 9 / 10 | 9 / 9 | 6 / 9 | 8 / 9 | 691 ms |

The missing sample in each capture fell outside the one-second lookback. Each reported eviction, queue and miss count is from the sampled frame alone. The results do not establish whether intervening terrain work, sprite preparation or GPU uploads caused a gap. One-second sampling cannot rule out a missed first-use event. The renderer used prepared terrain pages before traversal, so this is not an empty-cache experiment.

```sh
for run in frozen-traversal frozen-traversal-repeat; do
  node scripts/performance/report-traversal-cache.mjs "tmp/unit-heavy/$run/compositor.json" "tmp/unit-heavy/$run/result.json"
done
```

The reporter lists each gap, its sample age, terrain counters and the longest overlapping Core Animation backpressure span. Fine-grained page, sprite and upload events remain necessary for causal attribution.
