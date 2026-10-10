# Prompt history

UTC start: 2026-10-10 19:08:24 UTC
Harness: Codex via API
Model: GPT-6 (exact deployment version and reasoning level are not exposed to this session).
Token counts: unavailable; omitted rather than estimated.
UTC completion of final validation and server cleanup: 2026-10-10 19:46:39 UTC.
Duration through final validation: 38m15s.

## User request

1) The average frame rate is high and overall game performance is good, but units moving over the map cause microstutters. Analyze possible causes, list them, and fix them. Investigate CPU bottlenecks in AI, physics, and game-loop algorithms. Especially ensure attacks and explosions do not cause noticeable stutter, which happens frequently now.

2) Determine whether the CPU uses one thread and whether heavy algorithms should move to other threads, only if needed. Assess performance before coding using the game's existing benchmarks. Then create a TODO list and fix as many issues as possible without sacrificing code quality. The goal is smooth movement across the map.

3) Investigate and fix the occasional one-pixel jiggle of units and buildings while scrolling, potentially caused by position rounding inconsistent with map textures.

Repository instructions supplied with this request are in `AGENTS.md`; they require per-prompt history and change notes, unit tests, changed-file lint, full lint before commits, center-based occupancy and self-exclusion, prepared rendering, and the strict physical 75 FPS gate. No merge commits or merges from main are authorized.

## Outcome

Implemented AI defense-pass reuse, indexed A* lookup, retained collision-tree nodes, stopped-unit storage reuse and fractional terrain/entity camera alignment. Recorded the initial benchmark before coding, eleven comparative diagnostic runs including production M1 Metal runs, a five-second instrumentation smoke check and an explicit remaining TODO list. No simulation workers were added. All 4666 unit tests, the DPR 2 combat/alignment browser test, lint and the production build pass. Overall microstutter acceptance remains open because CPU deadline misses persist and the display/iPhone acceptance matrix is incomplete. No graphics quality was reduced and no commit was created.
