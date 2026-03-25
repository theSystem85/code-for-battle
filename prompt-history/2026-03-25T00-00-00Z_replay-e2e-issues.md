2026-03-25T00:00:00Z
copilot

User asked to stop running the replay determinism E2E locally for now and instead fix the currently known setup issues in the test itself:

1. Ensure the tutorial is skipped or the game starts with tutorial disabled.
2. Fix the immediate defeat screen shown at test start.

Applied changes focus on the Playwright test harness only: explicitly suppress tutorial UI after page load in addition to seeding tutorial localStorage, and keep `humanPlayer` on `player1` instead of forcing a spectator-like value that triggers normal defeat logic.