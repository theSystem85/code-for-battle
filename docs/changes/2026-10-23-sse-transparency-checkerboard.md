- [x] **Improvement: SSE transparency checkerboard**
  Show black and very dark grey checkerboard tiles behind source images, target sheets, and animation previews so transparent areas are visible without changing image pixels or exports.
  Spec: none

Validation: lint/autofix and production build passed. The full unit run passed 5,399 tests; four sandbox-blocked release-script checks passed on a focused rerun with subprocess permissions (all five tests in that file passed). All 86 integration tests and nine SSE Chromium E2E tests passed. Browser inspection confirmed the checkerboard in source/target views and transparent canvas pixels; the full game E2E suite was not run for this CSS-only SSE change.

Hardware performance acceptance remains pending for Patrick on dev; no GPU benchmark was run in this environment.
