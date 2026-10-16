- [x] **Improvement: SSE touch and trackpad navigation**
  All sheet viewports support wheel pan, cursor-anchored pinch zoom, Safari gestures, and synchronized sidebar percentage inputs.
  Spec: none

Validation: `npm run lint:fix:changed`, `npm run lint`, `npm run test:unit`, and `npx playwright test tests/e2e/sseTouchZoom.test.js --project=chromium --reporter=line`.
Navigation is event-driven, with no new animation/update/render loop work or bitmap preparation changes.

Results: lint auto-fix and full lint passed. All 284 unit test files passed (5,055 tests).
The E2E command could not start its web server: the sandbox denies listening sockets (`listen EPERM 127.0.0.1:5173`). Browser gesture verification remains outstanding.
