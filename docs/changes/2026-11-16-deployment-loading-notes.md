- [x] **Bug: Loading notes for deployments without releases**
  Compare notes against the last successful load, preserve the update in the manual, and avoid repeating notes when a release moves them to another version. Seamless updates remain disabled unless explicitly enabled, with regression coverage.
  Spec: none

Hardware performance acceptance remains pending on Patrick's GPU; these changes run only during loading and do not modify rendering.

Validation: lint, the full unit suite, and 15 focused loading/settings tests pass; all 86 integration tests pass. The sidebar update prompt E2E passes using system Chromium via a temporary Playwright configuration (the bundled browser download is blocked). The full E2E suite was not run. GitHub plugin authentication was restored; publication uses its Git API with a checked branch head. The relevant source files match current dev; the full-suite results above were obtained on the original workspace baseline.
