# 2026-10-16T23:50:02Z — Strengthen impact VFX

Harness: Codex. Model: GPT-6 (exact model revision and reasoning level unavailable). Token counts unavailable; omitted.

## User prompt

Follow-up on the impact VFX branch (read AGENTS.md; the previous commit added src/rendering/vfx/impactVfx.js and changed src/rendering/effectsRenderer.js). Close-up captures showed the new effects are WEAKER than main. Fix (visual only, keep effects-system scope, no gameplay/damage/ammo changes):
1. The M2 Bradley's real unit type is `lightTank` (src/config.js unit config). Map it to the 'sparky' profile via unit type/config: add an explicit `impactVfxProfile` field to the relevant unit configs (lightTank: 'sparky'; tank, tank_v1, tank-v2, tank-v3: 'blasty') and have selectImpactProfile resolve from the shooter type's config (projectile originType/shooter.type -> config lookup), keeping the old alias names as fallback.
2. Tank V1–V3 ('blasty'): clearly bigger and blastier than main's old explosion. Main draws an orange radial fireball growing to ~2x maxRadius over ~300ms with glow. The new fireball must be at least that size and brightness (layered additive core + orange body, ~350-450ms), PLUS debris chunks flying outward, embers, and dust/smoke puffs lingering ~1-1.5s.
3. M2 ('sparky'): many more sparks (e.g. 24-40 on high quality), bright (white-yellow core, additive), longer-lived 250-400ms with drag, longer streak length, directional cone around the reflected projectile direction; small bright flash; no fireball.
4. Remove ANY ring/outline completely: no stroked arcs, no gradient that has a bright band at its edge. The pressure pulse must be a filled soft radial gradient with peak at center fading monotonically to 0 at the edge (or drop it). Also check the 'default' profile path and old code paths for remaining ring strokes and remove them.
5. Ground vs unit hits visibly different: ground = dust/dirt colored debris + dust puff + scorch; unit/building = metal sparks (brighter, more), hot metal fragments, less dust.
6. Keep perf safeguards: pooling, caps, no per-frame allocations, low-quality/mobile scaling. Update unit tests (profile resolution via config incl. lightTank, no ring stroke calls, caps).
7. Update docs/changes entry and prompt-history (add a new prompt-history entry for this follow-up). Version stays 0.59.0.
8. Run npm run lint and npm test until green. Do not commit. Print a summary.

## Outcome

Implemented config-driven Bradley/tank profiles, larger 400 ms tank fireballs, additive directional sparks with drag, surface-specific debris/dust/scorch, culling updates and tests. Preserved the playable roster with a non-enumerable tank alias. Updated the 0.59.0 release notes and change/spec documentation. Lint passed; 5,045 unit tests and 5,131 combined tests passed. No commit. Live visual/performance checks remain blocked by port binding restrictions and absent Chromium. Exact whole-task duration is unavailable and omitted.
