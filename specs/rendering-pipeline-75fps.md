# Rendering pipeline: strict 75 FPS and preparation

Date: 2026-09-16. Status: requirements and implementation plan; no optimization implemented by this documentation task.

The minimum performance acceptance target for new code is 75 FPS during fast scrolling at unchanged visual quality on qualifying reference hardware. Frame deadline: 13.333... ms. The target supersedes historical 20% regression allowances and lower FPS floors in older specifications/tests. Low-refresh/headless/software-rendered diagnostic environments cannot certify 75 presented FPS; record outstanding physical verification rather than passing a lower threshold.

Authoritative supporting documents:

- [Measured analysis](../rendering_analysis.md): present call paths, CPU sample ranking, actual resize requests, memory accounting and uncertainty.
- [Design and acceptance protocol](../performance_improvement.md): constant-time cache validity, startup preparation, bounded residency, live water, prepared assets, profiler requirements and validation matrix.
- [Delegation checklist](../rendering_improvement_todos.md): GPT-5.6 Luna tasks, disjoint ownership, parallel groups and serialized integration/measurement barriers.

Required behavior: preserve terrain/biome/street/cliff visuals and continuously animated procedural water; no quality or cadence reduction to achieve performance. Prepare ordinary raster sizes before gameplay with byte budgets and explicit readiness. Only aircraft takeoff/landing dynamic size animations are exempt. Keep rotation and clipping semantics; unresolved effect-size conflicts must remain explicit.

Required diagnostics: a separately toggled live function timing table in the performance overlay, sorted by aggregate self compute time, with inclusive time, counts, averages and tail/max data. Add capability-labeled CPU/GPU/memory evidence, cache/upload/resize counters and exportable reproducible scene reports. No per-function profiling overhead when disabled; unsupported GPU or memory measurements must be labeled unavailable, not inferred as exact values.

New verification must cover first traversal after readiness, repeated full-map laps, maximum supported scroll speed, reversals/jumps, mutations/save/load, selected combat/effects and all renderer backends. Keep exact visuals/density, report tails and missed deadlines, and measure performance serially. Existing permissive tests remain unchanged by this docs-only task and must be updated in P01 before implementation acceptance.

2026-09-16 diagnostic baseline: local Chromium 145, Vite, seed 4, 100×100 mixed, 32 regions, viewport 1440×1000, DPR 2, 8px/rAF route: 43.67 FPS, 2.40 ms update, 9.10 ms render, 7.95 ms terrain, final JS heap 64.85 MiB, CPU water fallback. The 200×200 fast-route CPU sample points to `computeChunkSignature`/`mixSignature` as the first optimization priority. Neither run passes or certifies 75 FPS; see analysis for commands, profile details and limitations.
