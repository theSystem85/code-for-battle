UTC timestamp: 2026-10-16T22:50:00Z (requested entry timestamp)
Harness: Codex. Model: GPT-6; exact model revision and reasoning level are not exposed. Token usage and exact task duration are unavailable.

## Prompt

Work in the current repository on branch codex/fix-the-long-press-map-action-me-20261017-004435-013d77, based on feat/long-press-map-action-menu, version 0.57.0. Follow AGENTS.md; do not commit, push, change remotes, leave the workspace, access the network, or add credentials. Fix tests/e2e/longPressMapActionMenu.test.js using the supplied real-browser findings; the sandbox cannot run a browser.

1. Make openMapActionMenu, forceAttackAt, defendHoldAt, applyAutomationOnArrival, listApplicableAutomations, setLongPressDuration and related APIs survive remoteControlState initialization regardless of module order. Register alongside the remote API or merge extensions. Unit-test both orders.
2. Investigate the loading overlay at “Compiling the renderer 99%” after gameStarted. Fix production if stuck; otherwise identify the test race. Add/use waitForLoadingScreenHidden under tests/e2e/helpers before pointer input, tolerating an absent overlay.
3. Re-check menu selectors, data-id options, radial geometric hit testing, mobile touch holds, two-finger cancellation and settings duration. Preserve 1500 ms default, configurable duration, movement cancellation, consumed release and normal click/drag/pan interactions.

Update docs/changes/2026-10-17-long-press-map-action-menu.md and this prompt-history file. English, no title attributes, no top-level await. Run lint and unit tests.

Supplied operator results: all four Chromium tests failed. Desktop and mobile holds left the menu hidden; defendHoldAt option was absent; settings expected a hidden menu after a 500 ms hold but found it visible. The choose helper timed out at its option visibility assertion, desktop at the menu visibility assertion, mobile after touchEnd, and settings after changing duration to 900 ms.

Operator debug: after prepareRegressionScenario(page, 417) plus three seconds, elementFromPoint at canvas +300,+300 resolved to #loadingScreenKicker, displaying “Compiling the renderer 99%”; real pointer events hit the overlay. Other regression tests bypass pointer input. remoteControlApi contained none of the new methods: mapActionMenu assigns onto the existing object, then remoteControlState replaces it with a new object.

## Work

Merge remote-control base methods into the existing API; cover both actual initializer orders. Wait for overlay dismissal before regression fixture mutation and pointer input. Initialize settings idempotently on public open so changes bind before the deferred startup initializer. Preserve renderer readiness and existing gesture behavior. Add unit coverage, release note, and validation details to the change note. Browser verification remains with the operator.

Validation: offline dependency installation succeeded. All 5,046 unit tests across 280 files passed; changed-file lint autofix, full lint, and diff whitespace checks passed. No commit, push, remote changes, or browser run.
