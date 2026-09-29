# 2026-09-29T18:00:00Z

Grok 4.7 in the Cursor cloud agent. Token counts are not available to this agent. Elapsed 2026-09-29T18:00:00Z to 2026-09-29T18:19:23Z.

## Prompt

Fix a bug with the F22 aircraft attack behavior in code-for-battle (https://github.com/theSystem85/code-for-battle).

## Problem (user-reported)
The F22 already supports multiple attacks on its target until ammo is empty — that part is intended and should stay. The bug is that after a strike it does **not fly far enough away from the target** for the next consecutive attack to set up another strike. Instead it circles around the target, stops firing, and also does not return home.

Expected: after each strike (while ammo remains), egress far enough that the next attack run can acquire/fire again; when ammo is empty (or the attack is finished), return as designed.

## Constraints / repo rules
- Read AGENTS.md and follow it.
- Always rebase onto latest main (never merge main into the branch). Push with --force-with-lease if needed.
- Write change notes to a new per-issue file under docs/changes/ (YYYY-MM-DD-slug.md), NOT by appending to TODO/Bugs.md, TODO/Features.md, or TODO/Improvements.md.
- Specs for the behavior go in their own file under specs/ if you add or update a spec.
- Open a draft PR when done.
- Prefer fixing the root cause in the aircraft/attack AI path; do not hack unrelated systems.

## Hypothesis (non-binding — verify yourself)
My guess is the egress / re-attack distance or turning radius after a pass is too tight relative to weapon engagement range or attack-run geometry, so the plane never leaves the circle where it can re-acquire a valid attack vector. Investigate the actual F22 attack loop (attack run, egress, re-engage, return) and discard this if wrong.

## Done when
1. With ammo remaining, F22 completes multiple attack runs on the same target: each pass fires (or clearly attempts a valid strike), then flies far enough away to line up the next pass.
2. It does not get stuck endlessly circling without firing.
3. When ammo is empty (or the mission ends), it returns as previously designed.
4. Unit tests cover the re-attack / egress distance behavior where practical; `npm run test:unit` passes.
5. Draft PR exists with a clear description of root cause and fix.
6. If the bug is visual/behavioral in game, describe how you verified (tests, replay, or reasoning from the code path).

Investigate freely and implement the correct fix.
