- [x] **Improvement: reliable dev delivery and installed Chromium support**
  Remember the direct-to-dev push preference and allow Playwright to use an explicitly configured system Chromium executable when browser downloads are blocked.
  Spec: none

Verification: system Chromium launches successfully. The existing harvester browser regression has a separate initialization failure; diagnostic corrections then timed out and were reverted. No user browser installation is required in this environment.

Lint passes. Broad unit/integration checks completed; concurrency timeout failures pass on isolated retry, and the remaining sprite alpha mismatch reproduces on unchanged origin/dev. AI regressions pass.
