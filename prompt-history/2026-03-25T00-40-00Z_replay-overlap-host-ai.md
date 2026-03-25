2026-03-25T00:40:00Z
copilot

User asked not to run the replay determinism E2E locally and requested four fixes:

1. Replace the replay save comparison with a 2-decimal percentage overlap metric instead of strict true/false equality.
2. Ensure local AI controlling the player's own party never attacks its own units/buildings and correctly treats all other parties as enemies.
3. Address observed save drift examples around `gameTime` and `frameCount` by making the comparison more robust.
4. Fix the replay E2E harness so money behavior is not distorted by test-side cheats.

Applied changes switched the Playwright replay determinism test from exact serialized equality to a parsed-state overlap percentage, removed artificial building-budget inflation from the fast-forward harness, and generalized multiple AI ownership helpers/subsystems so host-controlled AI parties participate in support logic and no longer rely on legacy `humanPlayer === enemy` assumptions.