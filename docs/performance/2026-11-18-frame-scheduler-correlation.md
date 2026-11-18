# Game scheduler and compositor frame correlation

The benchmark now saves the game loop's scheduler source and scheduling delay with each reported CPU frame. The gap reporter locates renderer main-thread `ProxyMain::BeginMainFrame` spans overlapping a presentation gap and counts game reports occurring inside those spans. It reports safe integer begin-frame and main-frame IDs when available. Chrome main-frame IDs larger than JavaScript's exact integer range are returned as null. Temporal containment does not prove which compositor feedback belongs to a game frame.

A 15-second normal stationary capture on the active Apple M1 Retina display used the 500-unit save, explicit tutorial flag, fixed camera and defeat guard. Chrome's blank-page cadence was about 60 Hz, and the game delivered 2.173 average presented FPS with a 1 FPS worst one-second window. All recorded game reports in the five longest gaps used requestAnimationFrame. The longest gap was 983.3 ms and included one reported game frame with a 428.3 ms scheduler delay. Another 966.6 ms gap included a report delayed 928.0 ms. These are sampled reported frames, and callback scheduling delay includes time outside game JavaScript. Identifying the earliest upstream delay still requires a reliable cross-process frame identifier.

```sh
node scripts/performance/report-unit-heavy-gaps.mjs tmp/unit-heavy/validity-control/compositor.json tmp/unit-heavy/validity-control/result.json
```

The report retains adjacent presentation intervals and overlapping swap and backpressure spans. Chrome timestamps and presentation events can be estimates. Existing unit coverage exercises renderer PID filtering, duplicate feedback, absent marks, insufficient presentation data and main-thread span matching.
