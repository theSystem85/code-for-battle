# Presentation gaps compared with short intervals

This offline measurement compares all consecutive presentation intervals in the two final hardware captures described in the [combined benchmark](2026-11-18-combined-cpu-gpu-fps.md). Each used the stationary Apache battle, tutorial disabled, defeat protection, and an Apple M1 GPU on the active 60 Hz Retina display. Average presented FPS was 2.170 and 2.059, and minimum one-second FPS was 1 in both captures.

For each interval, find the largest time intersection with any Chrome `CALayerTreeCoordinator::ApplyBackpressure` complete-event span. The analysis selects distinct presentation feedback timestamps in the marked game renderer window, as in `scripts/performance/report-unit-heavy-presentation.mjs`. The raw inputs are local ignored artifacts `tmp/unit-heavy/total-final-stationary/compositor.json` and `tmp/unit-heavy/total-final-stationary-repeat/compositor.json`.

| Capture | Interval group | Intervals | Intervals with overlap | Median largest overlap (ms) | Maximum overlap (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| Final B1 | At least 900 ms | 37 | 37 | 923.87 | 945.47 |
| Final B1 | Below 34 ms | 43 | 30 | 0.04 | 16.70 |
| Final B2 | At least 900 ms | 34 | 34 | 916.93 | 950.06 |
| Final B2 | Below 34 ms | 34 | 19 | 0.03 | 16.69 |

The long gaps consistently overlap the browser's backpressure waits. Some short intervals overlap a small part of a wait as well. Timing overlap alone cannot establish frame causality or identify a triggering layer. The full checklist item remains open until scheduling, simulation, submission and presentation can be linked, a positive control is measured, and instrumentation overhead is checked. [Prioritized checklist](2026-11-18-next-performance-checklist.md)
