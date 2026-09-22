# 2026-09-22T20:33:00Z

**Processor:** Cursor Cloud Agent using Grok 4.7. Exact token counts were not available from this harness. Wall clock from 2026-09-22T20:33:00Z to 2026-09-22T21:04:01Z was about 31 minutes.

## Prompt

Repo: https://github.com/theSystem85/code-for-battle (branch from main).

## Problem
The current chimney / smoke implementation looks great but is **very slow** and drops frame rate. Optimize it for real-time play with a **GPU-optimized** approach. Preserve visual quality as much as possible; performance is the priority when trading off.

## Goals
1. Investigate how chimney smoke is currently implemented (CPU particles? canvas 2D? frequent allocations? overdraw? too many draw calls?).
2. Replace or refactor to a GPU-friendly path (e.g. WebGL/WebGPU instancing, a single smoke atlas + GPU particles, screen-space effect, baked sprite animation, or batched quads — pick what fits this codebase).
3. Keep smoke looking “super good” (similar soft plume / chimney aesthetic); acceptable small visual tweaks if needed for speed.
4. Measure or argue performance: fewer main-thread costs, fewer allocations per frame, batched GPU draws. Add a simple perf note in the PR.
5. Do not regress other rendering; keep Netlify install as `npm ci --include=dev && …` if you touch netlify.toml.

## Constraints
- Hand off outcome, not a guessed root cause — verify in code.
- Hypothesis only: smoke may be CPU-simulated per particle or redrawn inefficiently each frame — confirm.
- Prefer extending existing WebGL/effects systems over a one-off hack.
- Open a PR with before/after notes and how to verify (factories/power plants with chimneys, watch FPS).

## Done when
Chimney smoke remains visible and attractive, FPS stays healthy with many smoking buildings, tests pass, PR opened.
