UTC timestamp: 2026-10-17T19:52:00Z
Harness: Grok Bot executor subagent. Exact model revision, reasoning level, token usage and task duration are unavailable.

## Prompt

Two changes on PR #753 (branch feat/long-press-map-action-menu):
1. Reduce the font size of the labels inside the radial long-press map action menu buttons so every label fits fully inside its button with no cut-off text. Check all three options, including the longest one (the unit control automation option), and any submenu or list labels.
2. Change the default long-press delay before the menu opens from 1500 ms to 1000 ms. Keep it configurable, and update the spec, docs, features json and tests that mention 1500.
Do not rebase or force-push, and leave the version and PR title unchanged. Add the changes as new commits and push normally. Follow repo rules (English, conventional commits, lint and tests before committing, no title attributes, a docs/changes note and a prompt-history entry). Visually verify with Playwright by opening the menu and taking a screenshot, making sure all labels fit. Do not merge; wait for the Netlify deploy-preview check.
