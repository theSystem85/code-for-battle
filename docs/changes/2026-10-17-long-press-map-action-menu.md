- [x] **Feature: Long-press map actions**
  Reuse the radial menu for selected units and defences, with configurable holds, synchronized attack/hold/arrival automation orders and matching browser API calls.
  Spec: [Long-press map action menu](../../specs/long-press-map-action-menu.md)
- [ ] **Validation: Browser and qualifying-hardware acceptance**
  Run the E2E suite and certify the 75 FPS performance gate outside the sandbox, where localhost binding and reference hardware are available.
  Spec: [Long-press map action menu](../../specs/long-press-map-action-menu.md)
- [x] **Bug: Long-press startup and settings races**
  Preserve map action agent methods across remote-control initialization, initialize settings on first open, and wait for loading-screen dismissal before browser pointer tests.
  Spec: [Long-press map action menu](../../specs/long-press-map-action-menu.md)

Loading investigation: `setupGameWorld()` sets `gameStarted` before systems and renderer preparation. `initializeGame()` waits for the present boot phase (bounded at 20 seconds by `waitForBootPhase`) before hiding the overlay and scheduling deferred settings initialization. The operator's 3-second observation is inside that normal startup window; it does not establish a stuck real-game overlay. The regression helper now waits for the overlay to be hidden (or absent) before pausing and mutating the arena. Renderer preparation and the loading overlay remain intact.

The settings API now initializes listeners once per modal before opening, including when called before the idle startup task. The E2E duration case also asserts the effective config value. Radial option selectors match the implementation; options still use geometric pointer selection after fly-out. The default hold was 1500 ms at this point (now 1000 ms, see `2026-10-17-long-press-labels-and-delay.md`), with existing movement, camera, drag and multitouch cancellation and consumed-release coverage. No simulation or rendering hot paths were changed.

Browser acceptance remains outstanding in the operator environment: `npm run test:e2e -- tests/e2e/longPressMapActionMenu.test.js --project=chromium`.

Sandbox validation: `npm ci --offline --ignore-scripts` succeeded using the local cache; `npm run test:unit` passed all 5,046 tests in 280 files; `npm run lint:fix:changed`, `npm run lint`, and `git diff --check` passed. No browser or qualifying-hardware performance certification was attempted.
