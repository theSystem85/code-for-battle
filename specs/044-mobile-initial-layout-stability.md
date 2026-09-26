# Spec 044: Mobile Initial Layout Stability

## Context
Mobile Safari/Chrome emulation can initialize with stale orientation-safe-area values and sidebar state before the first rotation event, causing hidden controls and unfilled safe-area regions.

## Requirements
- On initial mobile landscape load, the sidebar must start in a visible condensed/open state (not fully hidden/collapsed by default).
- Mobile safe-area CSS variables must be synchronized on initial load (and shortly after) so portrait bottom inset regions render correctly without requiring manual rotation.
- In mobile landscape, the notification bell button must render at the top-left safe-area position to avoid overlap with sidebar controls.

## Implementation Notes
- Keep existing rotation/resize listeners intact.
- Add an initial + deferred safe-area inset sync pass using runtime-computed `env(safe-area-inset-*)` values.
- Preserve persisted user sidebar preferences when explicitly set; only adjust the fallback default for first landscape load.


## Follow-up (PWA Verification)
- Landscape bell placement MUST apply for all `body.mobile-landscape` sizes, not only narrow (`max-width`) breakpoints, so tablet/wider PWA landscape still pins to top-left safe area.
- Portrait `pwa-standalone` canvas rendering MUST extend through safe-area insets on first load so no bottom gap appears before rotation.
- Safe-area sync SHOULD run multiple deferred passes after startup/layout updates because iOS may resolve inset values asynchronously after first paint.

## Portrait first-load viewport (2026-09-26)
On the first portrait paint, iOS WKWebView (Safari, Chrome, in-app browsers such as the GitHub app, and installed standalone PWAs) can report a layout height about 100–120px shorter than the visible webview. The previous canvas resize wrote that short value as an inline pixel height and only reliably refreshed it on `orientationchange`, so a black band sat under the build bar until the phone was rotated.

### Requirements
- `html` and `body` use `100dvh`, with `100vh` and `-webkit-fill-available` fallbacks. `--app-height` may grow the box when the live viewport is taller; a shorter first reading must not pin the page below `100dvh`.
- The portrait canvas display height and backing store use the laid-out document height (`documentElement.clientHeight`, which follows `100dvh`), not a one-time `innerHeight`. A replaced canvas does not stretch with `height: auto`, so the pixel height is rewritten whenever that document height changes.
- The portrait condensed build bar is anchored to the bottom of that document and keeps `env(safe-area-inset-bottom)` inside the bar (padding), including non-standalone browsers.
- Viewport sync listens for `resize`, `visualViewport` `resize`, `orientationchange`, `pageshow`, and `load`, plus a `ResizeObserver` on the document element. It also remeasures on a double `requestAnimationFrame` and at 120ms, 320ms, and 700ms. Those passes are coalesced to one animation frame and do not run from the simulation frame loop.
- A settle pass may only grow the published height. Shrink is allowed for `resize`, `orientationchange`, and `pageshow`, which drop `--app-height` so dynamic units can follow.

### Verification
- Unit: `npx vitest run tests/unit/viewportLayout.test.js tests/unit/canvasManagerAdaptiveDpr.test.js`
- Playwright (no rotation): `npx playwright test tests/e2e/mobilePortraitInitialViewport.test.js --project=chromium`
  - Initial portrait screenshots at 390×844 and 430×932 with the tutorial already completed.
  - A run that starts at 390×640 and grows to 390×844 must still leave no gap under the build bar.
- This path is not on the per-frame update/render loop, so it does not change the 75 FPS hot path. No frame-time benchmark is required for this change.
