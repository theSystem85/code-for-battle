UTC timestamp: 2026-10-14T20:35:06Z
Harness: Codex. Model: GPT-6; exact deployment version and reasoning level are not exposed in this session. Token counts and exact task duration are unavailable and omitted.

You are working in a git repository checked out at the current directory (branch codex/fix-the-recurring-tutorial-toggl-20261014-223339-ab5818, based on main).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.

TASK:
Fix the RECURRING tutorial toggle button bug (green round "?" button).
1) Archaeology: search TODO/Bugs.md, TODO/Improvements.md, docs/changes/, prompt-history/, git log (git log --all -i --grep=tutorial, git log -S) and the PR list in context for earlier tutorial-button/overlap bugs+fixes. Determine why it keeps regressing (multiple show/hide code paths, state vs localStorage desync, CSS overrides/specificity, mobile layout re-renders re-adding it, etc.).
2) Fix root cause: one single source of truth for the button's visibility (one function/state that every hide/show path and layout re-render goes through, synced with persisted settings).
3) Portrait mobile with condensed sidebar: button placed top-left, never overlapping the sidebar. Keep compact layout, custom tooltips only (no title attributes), no nested scrollers.
4) Add a permanent Playwright E2E test (in the repo's existing e2e dir/conventions) covering: hiding the tutorial removes the button across all hide paths and after reload; on iPhone portrait (e.g. devices['iPhone 13']) with condensed sidebar the button is top-left and its bounding box doesn't intersect the sidebar's. Note: network is off in your sandbox; write the test so it runs with the repo's playwright config; it will be run outside.
5) Write docs/changes note with the archaeology summary + root cause + fix, an English prompt-history entry per AGENTS.md, keep lint clean and unit tests passing.

CONTEXT:
Related earlier PRs (from GitHub search, Codex cannot access network): #372/#374 (tutorial system, closed unmerged), #373 Fix tutorial minimize toggle (closed unmerged), #375 Restart Tutorial control, #376 mobile portrait sidebar+tutorial layout, #383, #386 (unmerged)/#387 Hide tutorial dock after completion, #432 refactor tutorial into modules, #440 tutorial modal default for portrait condensed, #441 tutorial overlay overlap sidebar + anchor top-left portrait, #468 moved sidebar utility buttons, #479 hide tutorial cursor when minimized/inactive, #678 portrait dense build bar + tutorial gesture onboarding, #712 (open) portrait layout first phone load.
Screenshot evidence: iPhone portrait, PR 732 deploy preview: green round "?" tutorial toggle sits on top of condensed sidebar at bottom right.
