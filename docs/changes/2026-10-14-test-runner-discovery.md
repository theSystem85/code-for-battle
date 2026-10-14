- [x] **Bug: Vitest collects Playwright suites**
  Scope Vitest discovery to unit and integration suites so the default test command no longer imports Playwright E2E files into the wrong runner.
  Spec: none

The reported 74 collection failures came from the broad `tests/**/*.test.js` discovery pattern, not duplicate Playwright installations or failing tutorial behavior. Vitest now owns `tests/unit/` and `tests/integration/`; the unchanged Playwright config owns `tests/e2e/`. No tests or lint rules were disabled. The permanent tutorial visibility E2E suite remains runnable with `npm run test:e2e -- tests/e2e/tutorialToggleVisibility.test.js`.

Validation: `npm run test:unit` passed 257 files / 4,871 tests; `npm run test` passed 259 files / 4,957 tests with no collection failures. `npm run lint:fix:changed`, `npm run lint`, and `git diff --check` passed. Playwright `--list` discovered all six tutorial regression cases. Live E2E verification remains assigned to the external runner as requested.
