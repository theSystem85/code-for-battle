- [x] **Deploy previews for PRs targeting dev** — Build all PR deploy previews, including dev PRs, instead of canceling them through the Netlify ignore command. Preview decisions no longer require a GitHub lookup; standalone branch deployments remain limited to dev. Updated the deployment guidance and regression tests, including actual CLI exit codes.

Spec: none

Validation: lint and all four ignore-command tests pass. The full unit and unit/integration runs were completed; CPU contention caused timeouts in several unrelated suites, which all pass on the serial retry (8 files, 77 tests, including the browser smoke test). Both DPR cases of the focused retina E2E test pass after restarting the local development server.
