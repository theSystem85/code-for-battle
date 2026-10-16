# Prompt: impact VFX variations

UTC: 2026-10-16T22:56:03Z (entry creation)
Harness: Codex. Exact runtime model version, reasoning level, token counts and authoritative full-task duration are not exposed by this session; unavailable values are omitted.

## User request (English, verbatim)

You are working in a clone of the code-for-battle RTS game (branch feat/impact-vfx-variations). Read AGENTS.md first and follow its rules (docs, conventional style, English). No network access is available; node_modules is installed.

GOAL: improve impact/explosion visual effects. Keep ALL changes inside the effects system (src/rendering/effectsRenderer.js, src/game/spriteSheetEffects.js, explosion creation helpers, a new src/rendering/vfx/* module if useful). Do NOT change projectile gameplay stats, splash damage, ammo or M2 unit config (a separate branch changes M2 projectile splash/ammo; we must merge cleanly). Only add a visual "impact profile" selection keyed by projectile/unit type at the point where explosions/impacts are created.

Requirements:
1. More randomized variation per impact: size, rotation, timing/duration, debris count, smoke puff shape/count. Use a cheap seeded or Math.random jitter; deterministic gameplay must not depend on it (visual only).
2. Directional sparks oriented by projectile travel direction (reflect/cone around the reverse of the incoming direction, biased by surface: ground vs unit/building).
3. REMOVE the expanding pressure-wave/shockwave RINGS entirely (e.g. effectsRenderer.js ~line 426 and any other ring drawing for explosions). Replace with a subtle, short-lived (~120-200ms) background distortion/blur pulse: e.g. a radial soft brightness/blur pulse drawn with a cached radial gradient sprite, or on WebGL/WebGPU a cheap approximation. Must be subtle and cheap; disable on low quality.
4. Tank V1/V2/V3 (tank, tank_v1, tank-v2, tank-v3 – check the actual type ids) impacts: more "blasty": fireball, dust/debris chunks, lingering smoke.
5. M2 (Bradley / m2 – check actual id) impacts: "sparky": small, many fast short-lived sparks, small flash, no big blast/fireball.
6. Own ideas with negligible perf cost (implement): brief ground light flash (additive cached gradient), ember particles for tank impacts, scorch decal variety if a scorch/decal system exists (random rotation/scale/variant). Optional camera micro-shake ONLY if behind a settings toggle default off — skip if not trivial.
PERFORMANCE RULES (mandatory): pooled particles (preallocated arrays / object pool, no per-frame allocations, no new closures/arrays inside the render loop), hard caps on total particle count, cached gradient sprites (offscreen canvas created once), quality scaling: read existing graphics/quality/low-end/mobile settings (search for existing quality / performance / lowEnd / mobile detection settings and respect them) and scale particle counts down or disable distortion. Respect WebGL/WebGPU renderer paths if effects are drawn there.
7. Add a reusable benchmark script scripts/vfxBench.mjs (Playwright, chromium headless, uses existing heavy battle benchmark scenario in src/benchmark/heavyBattleScenario.js / benchmarkRunner.js) that starts against a given URL (env BENCH_URL, default http://localhost:5173), runs the heavy battle scenario for ~20s and prints JSON with avg/p50/p95/p99 frame time in ms and fps. It must work on the current code without depending on new VFX code, so it can also be run against main.
8. Unit tests for the pool/caps/profile selection (vitest, tests/unit/). Update/fix existing tests that asserted ring drawing.
9. Docs: add docs/changes/<short-name>.md describing the change and list implemented vs proposed (not implemented) ideas; add a prompt-history entry following the repo convention (prompt-history/ folder); bump version to 0.59.0 in package.json (and package-lock.json root version, and anywhere else the repo keeps the version, follow AGENTS.md).
10. Run `npm run lint` and `npm test` and make them pass. If possible run relevant e2e (`npx playwright test --project=chromium` for a smoke subset). Do NOT git commit; leave changes in the working tree. At the end print a summary: files changed, ideas implemented, ideas proposed only.

## Outcome

Implemented effects-only profiles, pooled randomized particles, directional sparks, cached local light pulses replacing rings, quality/culling safeguards, benchmark tooling and version 0.59.0. Existing randomized decal variants remain in use. Weapon gameplay is unchanged. Lint, 5,039 unit tests and 5,125 combined tests passed. Browser tests and live performance acceptance remain blocked by missing Chromium and denied server binding. Exact model metadata and token accounting were unavailable; no values were invented. Changes were left uncommitted.
