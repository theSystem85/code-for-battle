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

Chrome on iOS (CriOS) still did that after the `100dvh` fix. Its top address bar and bottom toolbar collapse without firing `window` `resize` or `visualViewport` `resize`, and `dvh` / `innerHeight` can stay on the small viewport while the WKWebView frame is already taller. A definite height overrides `bottom`, so the root never tracks that frame.

### Requirements
- `html` and `body` are `position: fixed` with `top`/`right`/`bottom`/`left: 0` and `height: auto`, so the border box is the webview. `100vh`, `-webkit-fill-available`, and `100dvh` remain earlier fallbacks. `--app-height` may only grow the box via `min-height` when `innerHeight` or `visualViewport.height` is taller than that box. A shorter reading must not pin it.
- `html` and `body` use `overflow: hidden` and `overscroll-behavior: none` so the document cannot scroll and CriOS toolbar state stays stable.
- The portrait canvas is `position: absolute` inside the fixed `body` and its display height and backing store use the max of `documentElement.clientHeight`, `body.clientHeight`, both border boxes (`getBoundingClientRect`), `innerHeight`, and `visualViewport.height`. A replaced canvas does not stretch with `height: auto`, so the pixel height is rewritten when that measurement changes. That height is never reduced by the sidebar's measured height or by `--portrait-condensed-bar-height`.
- The portrait condensed build bar is `position: absolute; bottom: 0` inside the fixed `body`, not `position: fixed`. Chrome on iOS treats a fixed bottom bar as layout chrome and shrinks the layout viewport by the bar's height (`--portrait-condensed-bar-height`, 96px), so `bottom: 0` then sits one bar-height above the webview. `env(safe-area-inset-bottom)` stays inside the bar (padding), including non-standalone browsers.
- `#sidebar` is `top: 0; height: 100%; bottom: auto`. It is an overlay. Condensed and collapsed portrait states do not reserve `--sidebar-width` on the canvas. An expanded portrait sidebar and the desktop column still reserve width only. Class changes (`mobile-portrait`, `sidebar-condensed`, `sidebar-collapsed`) recompute the canvas.
- Viewport sync listens for `resize`, `visualViewport` `resize` and `scroll`, `window` `scroll`, `focus`, `visibilitychange`, `orientationchange`, `pageshow`, and `load`. A `ResizeObserver` on `documentElement` and `body` remeasures when the fixed root changes size even if no viewport event fires. It also remeasures on a double `requestAnimationFrame` and at 120ms, 320ms, and 700ms. Those passes are coalesced to one animation frame and do not run from the simulation frame loop.
- A settle pass may only grow the published height. Shrink is allowed for `resize`, `orientationchange`, and `pageshow` on desktop and landscape, which drop `--app-height` so the fixed inset can follow.
- Phone portrait does not drop that floor when the width stays the same. The Netlify Drawer (deploy previews only) injects `div[data-netlify-site-id]` with `position: fixed; bottom: 0` and an iframe titled "Netlify Drawer" that is 48px tall and `100vw` wide (`/.netlify/scripts/cdp`). Chrome on iOS then shrinks the layout viewport by that bar and fires `resize`. Keeping the tallest height for the current width stops the canvas from latching the shorter value. A width change (orientation) replaces the floor, and a later taller viewport raises it. Production URLs do not receive the drawer, so this delayed gap does not occur there.

### Verification
- Unit: `npx vitest run tests/unit/viewportLayout.test.js tests/unit/canvasManagerAdaptiveDpr.test.js`
  - Includes a mocked `ResizeObserver` that grows the root border box while `innerHeight` stays short and no `resize` event fires.
- Playwright (no rotation): `npx playwright test tests/e2e/mobilePortraitInitialViewport.test.js --project=chromium`
  - Initial portrait screenshots at 390×844 and 430×932 with the tutorial already completed. The root is `position: fixed` with top and bottom `0`, and the build bar is `position: absolute` at the bottom of that root.
  - A run that starts at 390×640 and grows to 390×844 must still leave no gap under the build bar.
  - A CriOS user-agent run checks the same fixed inset, then grows the root box without a viewport resize and expects the canvas to follow the `ResizeObserver`. The build bar stays `position: absolute`.
  - A cold load with the tutorial still open, and a growth from 390×748 to 390×844 (the delta is the condensed bar height), must leave no gap under the bar. The gap must not equal the bar height.
  - After the portrait layout has filled, injecting a 48px fixed-bottom Netlify Drawer iframe and forcing the root height down by that amount must restore the canvas and build bar to the bottom of the 844px viewport.
- This path is not on the per-frame update/render loop, so it does not change the 75 FPS hot path. No frame-time benchmark is required for this change.
