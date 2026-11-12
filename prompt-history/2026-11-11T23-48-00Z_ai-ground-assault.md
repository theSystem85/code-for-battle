# Prompt History Entry

**UTC Timestamp:** 2026-11-11T23:48:00Z
**LLM:** Grok 4.7 in Cursor cloud agent
Token counts and a precise elapsed time were not available to this run.

## Prompt Summary

Overhaul AI ground strategy so every AI player fights any opponent with squads, a danger-zone breach, ordered base destruction, crew-aware retreat, and a 5 second CPU-budgeted planner.

## Original Prompt

Repository: theSystem85/code-for-battle, branch `dev`. Read AGENTS.md first and follow its conventions (conventional commits, release-note JSON entries under features/unreleased/<category>/ for behavior changes, docs/changes notes, specs, tests). Do NOT edit docs/brainstorm.md.

Goal: overhaul the enemy/AI-player ground strategy so it plays like a smart, systematic opponent. This applies to every AI player against ANY opponent (the human player, other AI players, and human players in multiplayer) — never hardcode "the player" as the only target.

1. New default ground assault strategy (systematic base destruction):
   - Attack in groups (squads) with SUFFICIENT combined firepower for the target, never trickle single units.
   - Use the existing danger zone feature/map to find the WEAKEST point in the opponent's stationary defence along a path to the opponent's construction yard.
   - Destroy only the minimum set of defence buildings needed to open a safe path, then destroy the construction yard.
   - Then destroy the weapons factory (vehicle factory), then all remaining defence buildings, then all remaining buildings.
   - Single units must NOT attack a base unless that base is completely defenceless (no ground defence and no air defence). Exception: if the target has no anti-air at all, sending a single Apache or F22/F35 to attack the base is fine.

2. Squads:
   - Units are organized into squads that move together, attack the same targets, and make attack/retreat decisions as a group.
   - The AI should prefer building "complete" squads: tanks and light tanks as the core, at least one rocket tank (anti-air), at least one howitzer (long-range base attack), one ambulance, one recovery tank, and exactly one ammo truck (not two). Use the actual unit type ids from the codebase.
   - Wounded units move slightly behind the front line so healthier squad members protect them until they get repaired (use existing repair/ambulance/recovery mechanics).

3. Retreat intelligence:
   - Any AI unit (and its squad) that is engaged by an enemy likely to win the fight retreats. Estimate the outcome from current firepower and HP of both sides, AND crew status: a unit missing its gunner or loader is always an easy target even if HP/firepower comparison makes it look stronger, so factor crew into both the threat and the opportunity side (attack crippled enemies, don't flee from them).

4. Performance budget:
   - These combat/strategy evaluations run at most once every 5 seconds per AI player (or per squad), and only when CPU capacity is available (e.g. throttle/skip when frame time budget is exceeded; reuse any existing idle/budget scheduling in the codebase if present). Keep per-frame cost negligible.

Implementation notes: find the current enemy AI code first (it is hard-coded today; there is also an automation state-machine system — no need to port to it in this task, but keep the code structured and readable so it can later be ported). Reuse the existing danger zone map rather than inventing a new one. Add focused unit tests for the outcome estimator (including crew-missing cases), target-priority ordering (defence breach -> construction yard -> weapons factory -> other defences -> rest), squad composition, single-unit/air exceptions, and the 5s throttle. Add or extend an e2e/sim test if the repo has a pattern for AI behavior. Run lint and the relevant test suites; all must pass.

Delivery: commit with conventional commit messages and push directly to `dev` (`git push origin HEAD:dev`), no PR. If dev moved meanwhile, rebase (never merge commits, never squash) and push again. Report the final tip SHA from `git ls-remote origin dev`, a summary of what changed (files, key design), test results, and any tradeoffs or known gaps. If the push is rejected, paste the exact error.

## Changes Made

- Added `src/ai/groundAssaultStrategy.js` with pure planning steps and one orchestrator.
- Wired orders into ground combat decisions, strategy permission, and vehicle production.
- Added `tests/unit/groundAssaultStrategy.test.js` (U07092–U07112).
- Added the spec, change note, and unreleased feature line.
