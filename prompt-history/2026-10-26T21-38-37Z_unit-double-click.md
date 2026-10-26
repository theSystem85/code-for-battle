# 2026-10-26T21:38:37Z

Model: Codex using GPT-5.6 Sol
Harness: Codex

## Prompt

Work on the `dev` result branch only, commit the result, do not open a pull request, and use English and Conventional Commits. Follow the applicable AGENTS.md rules, including unit tests, lint, a docs/changes entry, an unreleased feature JSON entry when applicable, and a uniquely named prompt-history file with the exact model.

Fix the bug where a single unit click can sometimes select all visible units of the same type and owner. Verify the actual input and selection root causes. Same-type selection must require a genuine double-click; Shift+double-click must add matching units. Preserve single-click, Shift+single-click, Ctrl/control-group, Alt queue, and mobile double-tap behavior. Prefer native `MouseEvent.detail` when available, use a time-and-distance fallback for touch, process a physical click once, consume completed double-click state, and reset tracking after intervening interactions.

Add focused Vitest coverage for a single click, slow clicks, duplicate dispatch, genuine and Shift double-clicks, a third click after a double-click, and an intervening different-unit click. Run focused tests, `npm run test:unit`, and `npm run lint`; do not run full Playwright/e2e or GPU/FPS benchmarks. Note the three known unrelated tutorialNarration unit failures if present. End with a short summary of the verified cause, fix, touched files, and checks.
