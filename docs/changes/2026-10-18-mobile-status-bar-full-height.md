# Mobile money and power bars fill the status bar (2026-10-18)

## Problem
In the iPhone portrait PWA layout the money and power bars were fixed 12px strips inside the 34px status bar under the build cards, leaving unused space above and below them. In landscape the money row had a 24px wide track and the power row a fixed 18px height.

## Change (`styles/base.css`)
- Portrait PWA (`body.mobile-portrait.sidebar-condensed.pwa-standalone`): `#mobileStatusBar` stretches its rows (`align-items: stretch`), and `#mobileMoneyTrack` / `#mobileEnergyTrack` are `height: 100%` instead of `12px`. Padding is `3px 12px var(--portrait-status-bar-bottom-reserve, 3px)`.
- `--portrait-status-bar-bottom-reserve` (on `body.is-touch`) is `max(3px, calc(var(--safe-area-bottom) - 21px))`, so on an iPhone (34px bottom inset) the bottom 13px stay free for the home indicator, and the bars grow from 12px to 18px. On devices without a safe area it falls back to 3px.
- Landscape: the money and power rows share the status bar height (`flex: 1 1 0`, `min-height: 18px`), and both tracks fill their row.
- Portrait in the browser (not installed) already used full-height vertical bars and is unchanged. The desktop bars overlay the minimap at a fixed 14px with no extra space around them, so they are unchanged too.
- The value text stays vertically centered (flex centering inside the full-height track).

## Tests
- U05209, U05210 (`tests/unit/mobileStatusBarHeight.test.js`): the CSS rules.
- E00129 (`tests/e2e/mobileStatusBarFullHeight.test.js`): 390x844 iPhone emulation, standalone mode with a simulated 34px inset; the tracks are 18px tall, start 3px below the bar top, keep 13px free at the bottom and keep the text centered.
- Screenshots: `/workspace/vfx-verify/status-bar-height/{before,after}-*.png`.

## Follow-up: larger labels (2026-10-18)
With the bars now 18px tall, the portrait PWA money and power values use `font-size: 12px` and `font-weight: 600` (were 10px / 500). This was a CSS-only change, used as the first live-update check on the dev deploy: it was applied to an open page without a reload (`/workspace/vfx-verify/live-update/dev-*.png`). Covered by U05209.
