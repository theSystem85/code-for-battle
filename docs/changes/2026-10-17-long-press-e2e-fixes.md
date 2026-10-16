- [x] **Bug: Map action initialization races**
  Preserve browser agent actions, bind settings before first open, and wait for renderer boot before pointer regression setup.
  Spec: [Long-press map action menu](../../specs/long-press-map-action-menu.md)

Validation and loading-screen investigation are recorded in [the feature change note](2026-10-17-long-press-map-action-menu.md). Real-browser acceptance remains with the operator.

- [x] **Bug: E2E setup isolation** — Clear prior movement before hold/release assertions and restore tank selection after Escape before API checks. Spec: none
