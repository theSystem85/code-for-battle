# 2026-10-26T14:49:10Z — Vehicle factory exit

Model: Codex using GPT-5.6 Sol.

## Prompt

Work on the `dev` result branch only, commit the result with a Conventional Commit, use English, and follow `AGENTS.md`. Add a change note, an unreleased feature entry, and a unique prompt-history file naming Codex. Run lint and only focused tests for touched files; do not run the full Playwright suite.

Fix two Vehicle Factory exit issues:

1. Inspect `vehicle_factory.webp` and align the exit vector with the perspective doorway. The current path is slightly too far east and should point slightly farther south so vehicles pass through the opening rather than the middle bar.
2. Make vehicles selectable and commandable during the exit animation. Route commands through the existing selection/order path, keep them pending during the exit, and execute them after the animation completes.

Do not alter unrelated scrolling or decoration deferral. Report the measurable before/after angle, changed files, and focused verification results.
