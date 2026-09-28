# 2026-09-28 — Offline toggle under the action buttons

Notes for this change live here so they are not appended to `TODO/Bugs.md`, `TODO/Features.md`, or `Documentation.md`. Spec: [Offline mode](../../specs/095-offline-mode.md).

## Improvement

- [x] **Online/offline toggle sits under the action buttons** — the single sidebar toggle is no longer the first item above the minimap. It follows the repair, sell, pause, and other action buttons, in both online and offline states. The label is 11px with 3px 8px padding and a 26px minimum height, so the pill takes less space and stays readable and tappable. The custom tooltip is unchanged and the button still has no native `title`.
  - Spec: [Offline mode](../../specs/095-offline-mode.md)

- [x] **No empty band above the minimap** — moving the toggle removed its 12px/8px margins from the top of the sidebar. Desktop and portrait sidebar top padding is 0, and the minimap has no top margin, so the money and energy bars overlay the minimap's top edge. Portrait still starts the sidebar at the safe-area inset. Collapsed and condensed portrait sidebars still slide off-screen with the toggle inside them.
  - Spec: [Offline mode](../../specs/095-offline-mode.md)
