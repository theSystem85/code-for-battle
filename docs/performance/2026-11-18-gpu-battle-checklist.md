# GPU rendering work for dense battles

The CPU optimization checklist implementation is complete on the local feature branch. The measured 60 FPS acceptance check remains open. The representative case for this work is the loaded 500-unit battle with the camera fixed, tutorial disabled at startup and construction yards protected from defeat.

1. [x] Reduce Apache impact flash overdraw and measure the stationary battle. [Impact flash report](2026-11-18-apache-impact-flash.md)
2. [ ] Consolidate WebGPU terrain uniform writes so the cost of submitting prepared pages grows more slowly as more pages enter the viewport.
3. [ ] Record Chrome compositor and raster traces during a dense volley on an active physical display. Attribute the gaps between animation callbacks before changing smoke, fire or projectile batching. Compare a diagnostic run without GPU query readback to isolate measurement overhead.
4. [ ] Move deferred atlas cropping and resizing off the main thread. The first profile sampled about 0.65 s in sprite preparation's native bitmap call after gameplay readiness. Use a bounded worker queue, reuse decoded sources, transfer completed bitmaps, and preserve preparation readiness and memory ownership across save loads and display changes.
5. [ ] Prototype GPU-parallel particle updates or vertex evaluation where the trace attributes significant time to VFX. Keep particle ordering, normal and additive blend boundaries, fog visibility, effect lifetimes and DPR. Start with instanced geometry. A separate compute pass is justified only if it saves more work than the extra dispatch and composition cost.
6. [ ] Verify production builds on an active physical display at 60 Hz or faster. Measure stationary dense combat first, then cold and repeated full-map traversal with selected layered units, firing, and animated water. Record the tested unit and effect counts, rendering backend, DPR, deadline misses and compositor presentation timing.

A 60 FPS frame has 16.67 ms available. The reference run reported CPU update times above that budget on their own. GPU work and worker parallelism can free time for the main thread, but measurement at explicitly tested workloads is required for a frame-rate guarantee. The benchmark's minimum FPS is the count in the worst trailing one-second window.
