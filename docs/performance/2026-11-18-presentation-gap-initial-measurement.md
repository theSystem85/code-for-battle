# Initial presentation-gap measurements

This is an offline analysis of the existing `total-final-stationary` hardware capture described in the [combined comparison](2026-11-18-combined-cpu-gpu-fps.md). The capture used the loaded 499-unit Apache battle, a fixed camera, tutorial disabled at startup, defeat protection, a 60 Hz Retina display, Apple M1 hardware GPU, and Chrome 157. It measured 2.170 average presented FPS and 1 FPS in the worst one-second window. No new game or benchmark build was used.

For the three longest intervals between distinct presentation feedback timestamps in the marked game renderer, the following durations are the intersection of each interval with the longest matching Chrome trace span. Spans can overlap and are not additive. Intersections do not establish a frame-level causal match.

| Gap start after capture start (s) | Presentation gap (ms) | Swap span overlap (ms) | Core Animation backpressure overlap (ms) |
| ---: | ---: | ---: | ---: |
| 3.021 | 983.31 | 949.9 | 945.1 |
| 6.471 | 966.67 | 933.6 | 926.3 |
| 31.104 | 966.66 | 934.4 | 916.7 |

The result supports investigating the presentation path. It does not identify which surface or upstream operation caused the waits. The recorded trace lacks the instrumented frame linkage and positive control specified in checklist item 2. The raw trace is currently an ignored local artifact at `tmp/unit-heavy/total-final-stationary/compositor.json`.

Reproduce by selecting the game renderer PID using `cfb-benchmark-start` and `cfb-benchmark-end`, deduplicating `SwapEndToPresentationCompositorFrame` end timestamps inside that window, sorting adjacent gaps, and intersecting each gap with `X` spans named `SkiaOutputSurfaceImplOnGpu::SwapBuffers` and `CALayerTreeCoordinator::ApplyBackpressure`. The existing `scripts/performance/report-unit-heavy-presentation.mjs` implements the window and presentation selection.

The first two checklist items remain open. A repeatable run manifest, invalid-run checks, per-frame event linkage and a positive-control capture still need implementation and verification.
