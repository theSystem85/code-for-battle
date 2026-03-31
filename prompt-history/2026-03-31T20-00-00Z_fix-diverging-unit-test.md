2026-03-31T20:00:00Z
LLM: copilot (Claude Opus 4.6)

# Fix Diverging Unit Test in gameSetup.test.js

The user reported that `tests/unit/gameSetup.test.js` was diverging (infinite loop) when run. The task was to identify and fix the root cause without running the test first, then verify it passes with a timeout.

## Root Cause
The `buildOreClusterPlan` function in `src/gameSetup.js` had a `while (allClusters.length < oreFieldCount)` loop with no max-attempts guard. On small maps (20×20, 30×30 as used in tests), the deterministic fallback position generator cycles through a tiny set of coordinates that all fall within distance 7 of each other, causing the `tooClose` check to always be `true` and the loop to never terminate.

## Fix
Added `const maxFallbackAttempts = 500` and changed the while condition to `while (allClusters.length < oreFieldCount && fallbackIndex < maxFallbackAttempts)`, matching the guard pattern used by all other while loops in the same file.
