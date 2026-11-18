# GPU rendering work for dense battles

The CPU optimization checklist implementation is complete on the local feature branch. [CPU reports and stationary battle results](2026-11-18-stationary-battle-60-fps.md). The measured 60 FPS acceptance check remains open. The representative case for this work is the loaded 500-unit battle with the camera fixed, tutorial disabled at startup and construction yards protected from defeat.

1. [x] Reduce Apache impact flash overdraw and measure the stationary battle. [Impact flash report](2026-11-18-apache-impact-flash.md)
2. [x] Consolidate WebGPU terrain uniform writes and reuse them while the camera remains stationary. [Terrain uniform upload report](2026-11-18-webgpu-terrain-uploads.md)
3. [x] Trace Chrome compositor stalls in the stationary battle and compare timestamp probes and hardware backends. The session showed Core Animation backpressure, also confirmed in the subsequent active-display run. [Chrome presentation report](2026-11-18-chrome-presentation-trace.md)
4. [x] Run physical-display acceptance on the built-in 60 Hz Retina display. The stationary battle averaged 2.15 compositor-reported FPS and the scrolling run averaged 49.52. Both failed the 60 FPS gate. [Active-display benchmark report](2026-11-18-active-display-fps.md)
5. [x] Move Apache atlas decoding and crop preparation off the main thread with bounded staging and verified pixel parity. [Apache atlas worker report](2026-11-18-apache-atlas-worker.md)
6. [ ] Prototype GPU-parallel particles if physical-display profiling shows material effects raster cost. The active-display capture still showed 0.70 ms p95 for CPU effects submission and long Core Animation waits. The pipeline remains deferred until a trace attributes material GPU time to the effects. [GPU particle assessment](2026-11-18-gpu-particle-assessment.md)

A 60 FPS frame has 16.67 ms available. The reference run reported CPU update times above that budget on their own. GPU work and worker parallelism can free time for the main thread, but measurement at explicitly tested workloads is required for a frame-rate guarantee. The benchmark's minimum FPS is the count in the worst trailing one-second window.
