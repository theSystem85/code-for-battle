- [x] **Bug: Map action labels cut off**
  Labels in the long-press map action menu and its automation submenu now render at 7 px and shrink per button until every line sits inside the round button.
  Spec: [Long-press map action menu](../../specs/long-press-map-action-menu.md)
- [x] **Improvement: Shorter default map hold**
  The default long-press delay before the map action menu opens is now 1000 ms instead of 1500 ms; Settings and `remoteControlApi.setLongPressDuration(ms)` still adjust it (300–5000 ms).
  Spec: [Long-press map action menu](../../specs/long-press-map-action-menu.md)

Label fitting runs once per menu open over the few text buttons (event-driven, no simulation or render-loop work). It measures line boxes in layout pixels, so the fly-out scale transform does not affect the result. Only the map action menu is restyled; other radial menus keep their 9 px labels.

Validation: `npm run lint`, `npm run test:unit`, and `tests/e2e/longPressMapActionMenu.test.js` (chromium, including a new label-fit case for all three options and a 36-character automation name). The E2E file now seeds the `rts_tutorial_*` keys so the tutorial's input-method chooser does not cover the map. Visual check: `/workspace/vfx-verify/753-labels.png` (main menu and submenu at DPR 3).

Release: rebased onto main, which shipped 0.57.0 for the M2 light tank; this feature's notes moved to `features/0.58.0.json` and the version is bumped to 0.58.0.
