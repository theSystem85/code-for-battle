# Spec 024: CI PR Checks

## Goal
Ensure every pull request runs linting, unit tests, and integration tests so failures block merges.

## Requirements
- GitHub Actions workflow runs on `pull_request` events targeting `main`, including new commits pushed to an open PR (`synchronize`).
- CI steps include:
  - `npm run lint`
  - `npm run test:unit`
  - `npm run test:integration`
- The existing build step remains in the CI workflow.

## Acceptance Criteria
- A PR creation or update triggers the CI workflow.
- The workflow fails if linting, unit tests, or integration tests fail.
