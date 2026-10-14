# Four regressions: Chromium validation and fixture fixes

UTC: 2026-10-14T20:20:07Z
Harness: Grok Bot executor (takeover of the Codex fallback job).

## Prompt

Take over the interrupted job for issues 2-5 (fire through buildings, rocket tank vs. air and move orders, Apaches sharing a helipad, enemy crewless tanks returning to the hospital). For each issue keep a permanent Playwright E2E test under tests/e2e, run it on main to see whether the bug still exists, fix it, run lint and unit tests, add the docs/changes note and an English prompt-history entry, and open one draft PR.

## Outcome

Ran the four tests in Chromium. Fixed fixture side effects (empty party table let the AI drive the human party; economy AI sold fixture buildings; invisible construction yards stayed in gameState.factories; circular JSON in diagnostics). Results: issue 2 already solved on main; issues 3, 4 and 5 fail on main and pass on the branch. See docs/changes/2026-10-14-four-regressions-chromium-validation.md.
