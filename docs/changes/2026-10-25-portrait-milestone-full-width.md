- [x] **Improvement: full-width portrait milestone videos that close on tap**
  In condensed portrait, the milestone clip spans the viewport width at the existing 4:3 ratio, stays below the safe area, and closes when tapped.
  Spec: none

Condensed portrait (`body.mobile-portrait.sidebar-condensed`) no longer uses a 160×120 box. The overlay is `width: 100%` with `left: 0` and `right: 0`, and `aspect-ratio: 160 / 120`, so the picture fills the screen width and keeps the same proportions. `top` is still 12px plus the larger of `--safe-area-top` and `env(safe-area-inset-top)`. Inline left, top, right, width, and height stay cleared so a later safe-area update can move the clip. The same rule applies in the browser and in the installed PWA.

A tap (primary `pointerup`) on a playing portrait milestone video calls the existing fade-out close. Desktop and landscape clips stay click-through. Collapsed portrait stays a 160×120 corner clip. Expanded, desktop, and landscape layouts still follow the minimap.

Placement still runs on playback and layout changes, not every frame. No simulation or renderer loop changed.

Verification: unit coverage checks the full-width CSS contract, the safe-area top formula, tap-to-close on portrait, and that landscape taps do not dismiss. Headless Chrome at 390×844, with `--safe-area-top: 59px`, placed the playing clip at top 71px, left 0, width 390px, height 292.5px (12px below the protected band, 4:3 across the viewport). A tap removed the visible clip and, after the 400ms fade, stopped and cleared the video. Qualifying-hardware 75 FPS acceptance is unchanged and was not re-run; this is not a per-frame path.
