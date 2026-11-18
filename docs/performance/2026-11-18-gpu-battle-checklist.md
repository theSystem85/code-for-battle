# GPU rendering work for dense battles

The CPU optimization checklist implementation is complete on the local feature branch. The measured 60 FPS acceptance check remains open. The representative case for this work is the loaded 500-unit battle with the camera fixed, tutorial disabled at startup and construction yards protected from defeat.

1. [x] Reduce Apache impact flash overdraw and measure the stationary battle. [Impact flash report](2026-11-18-apache-impact-flash.md)
2. [x] Consolidate WebGPU terrain uniform writes and reuse them while the camera remains stationary. [Terrain uniform upload report](2026-11-18-webgpu-terrain-uploads.md)
3. [x] Trace Chrome compositor stalls in the stationary battle and compare timestamp probes and hardware backends. The session showed Core Animation backpressure. Repeating the trace with physical presentation is the highest-priority remaining item. [Chrome presentation report](2026-11-18-chrome-presentation-trace.md)
4. [ ] Verify production builds on an active physical display at 60 Hz or faster. Measure stationary dense combat first, then cold and repeated full-map traversal with selected layered units, firing, and animated water. Record the tested unit and effect counts, rendering backend, DPR, deadline misses and compositor presentation timing.
5. [x] Move Apache atlas decoding and crop preparation off the main thread with bounded staging and verified pixel parity. [Apache atlas worker report](2026-11-18-apache-atlas-worker.md)
6. [ ] Prototype GPU-parallel particle updates or vertex evaluation where the trace attributes significant time to VFX. Keep particle ordering, normal and additive blend boundaries, fog visibility, effect lifetimes and DPR. Start with instanced geometry. A separate compute pass is justified only if it saves more work than the extra dispatch and composition cost.

A 60 FPS frame has 16.67 ms available. The reference run reported CPU update times above that budget on their own. GPU work and worker parallelism can free time for the main thread, but measurement at explicitly tested workloads is required for a frame-rate guarantee. The benchmark's minimum FPS is the count in the worst trailing one-second window.
