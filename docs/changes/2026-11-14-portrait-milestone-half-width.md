- [x] **Improvement: half-width portrait milestone video**
  In condensed portrait, the milestone clip is 50vw wide, keeps the 4:3 ratio, and stays centered under the safe area so it does not cover the build bar, action row, or corner controls. Desktop, landscape, expanded, and collapsed portrait placement stay unchanged.
  Spec: none

Condensed portrait (`body.mobile-portrait.sidebar-condensed`) no longer stretches the milestone overlay across the viewport. The same rule is `width: 50vw` with `height: auto` and `aspect-ratio: 160 / 120`, centered with auto margins. `top` is still 12px plus the larger of `--safe-area-top` and `env(safe-area-inset-top)`. Inline left, top, right, width, and height stay cleared so a later safe-area update can move the clip. The same rule applies in the browser and in the installed PWA.

On a 390px-wide phone the clip is 195px by 146.25px. That leaves a quarter of the screen on each side (the notification bell and the tutorial dock sit in those gutters) and keeps the picture well above the condensed build bar and the action buttons.

Collapsed portrait stays a 160×120 corner clip. Expanded, desktop, and landscape layouts still follow the minimap. Placement still runs on playback and layout changes, not every frame. No simulation or renderer loop changed.

Verification: the unit CSS contract checks 50vw, the 4:3 ratio, centering, and the safe-area top formula. Playwright at 390×844 with the condensed sidebar measures the overlay at half the viewport width, centered, with its bottom above the action row, and confirms it does not intersect the build bar or the action row. This Chromium build does not decode the HEVC milestone files, so the screenshot shows the sized overlay rather than the picture; Safari still plays those files. Qualifying-hardware 75 FPS acceptance is unchanged and was not re-run; this is not a per-frame path.
