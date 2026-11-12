# Prompt History Entry

**UTC Timestamp:** 2026-11-12T00:25:00Z
**LLM:** Grok 4.7 in Cursor cloud agent
Token counts and a precise elapsed time were not available to this run.

## Prompt Summary

Follow-up on the squad assault: retreating units keep firing, a budgeted dynamic danger map is combined with the stationary map for attack and retreat, in-range threats come before the next base building, and the overlay can show that dynamic layer per party.

## Original Prompt

Follow-up from Patrick on the enemy AI squad assault you landed (ad5acbf2). First fetch and rebase onto the latest origin/dev (tip is now 1937611e or later; a build fix regenerated prepared soil sprites — make sure `npm run build` incl. check:map-sprite-tiers still passes). Do NOT edit docs/brainstorm.md.

1. Retreating units keep firing: AI units/squads that retreat must still fire back at attackers in range while moving away (no turning into passive targets).

2. Dynamic danger zone map: in addition to the stationary-defence danger map, generate a dynamic danger map per party that includes mobile combat units (firepower/range/HP/crew-aware, consistent with your outcome estimator). Make it efficient: incremental or coarse-grid updates, budgeted, refreshed on the same ≥5s CPU-headroom cadence (or cheaper partial updates), no per-frame full rebuilds. Make it optionally visible to the player for each party (e.g. extend the existing danger-zone visualization/toggle with a dynamic layer and a party selector), default off.

3. Use the combined static+dynamic danger map for attack planning (breach corridor selection, sufficient-firepower check against defences PLUS defending units) and for retreat planning (retreat toward lower danger, not just away).

4. Target priority: besides the main goal (construction yard via the breach), squads first neutralise attacking enemy units and defence buildings within range before moving on to the next base building in the priority list (construction yard -> vehicle factory -> remaining defences -> other buildings). Threats engaging the squad take precedence.

Add unit tests for each (retreat-while-firing, dynamic map contents/update budget, combined-map corridor choice, in-range threat precedence). Run lint, unit tests and the exact Netlify build command (`npm ci --include=dev && npm run build && npm run test:smoke` with CONTEXT=branch-deploy BRANCH=dev). Add release-note JSON entries per AGENTS.md. Commit (conventional, with Live-Update trailer) and push directly to dev (`git push origin HEAD:dev`), rebasing if needed, no PR. Report the tip SHA from `git ls-remote origin dev`, what changed, tests, and gaps.

## Changes Made

- Retreating orders keep a return-fire list and the combat decision shoots anything on it that is still in range while the move target stays the retreat tile.
- Added a coarse incremental dynamic danger map per party, refreshed on the 5 second headroom cadence, and a danger-zone toggle cycle that can show it.
- Breach search, firepower checks, and retreat tile choice use static defence danger plus that dynamic map. In-range units and defences are fought before the next base building.
