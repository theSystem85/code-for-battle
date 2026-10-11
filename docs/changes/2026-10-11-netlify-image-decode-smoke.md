- [x] **Bug: Netlify startup smoke test fails during sprite preparation**
  Added the browser Image.decode promise contract to the shared headless image mock: wait for loading, reject on errors, and clean up listeners. The unchanged startup smoke test reproduced `entry.image.decode is not a function` before the fix and passes afterward. Production rendering is unchanged.
  Spec: none

Validation: clean `npm ci --include=dev`, production build, startup smoke test, all 4,683 unit tests, all 86 integration tests, `lint:fix:changed`, full lint and `git diff --check` passed. GitHub connector job 114457748606 exposed the same failure in PR #730; Netlify's build command also runs this smoke test. Direct Netlify logs were unavailable because no Netlify connector/plugin was found.
