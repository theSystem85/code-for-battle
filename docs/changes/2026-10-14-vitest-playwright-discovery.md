- [x] **Bug: Vitest collects Playwright tests**
  Keep browser E2E tests with the Playwright runner and preserve Vitest default exclusions so the standard test command runs unit and integration suites correctly.
  Spec: none

Validation: `npm run test:unit` passed (255 files, 4864 tests); `npm test` passed (257 files, 4950 tests), including all enemy power regression tests. `npm run lint:fix:changed`, `npm run lint`, and `git diff --check` passed. Playwright E2E tests remain assigned to `npm run test:e2e`.
