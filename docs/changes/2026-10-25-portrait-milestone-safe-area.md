- [x] **Bug: portrait milestone video under the iPhone safe area**
  In condensed portrait, play the milestone video centered at the top with safe-area clearance so the Dynamic Island, notch, or status bar does not cover it. Desktop, landscape, and collapsed portrait placement stay unchanged.
  Spec: none

The condensed portrait overlay no longer uses a fixed top-left pixel origin. Its position comes from CSS: `top` is 12px plus the larger of `--safe-area-top` and `env(safe-area-inset-top)`, and the 160×120 clip is centered with auto margins. The same rule applies in the browser and in the installed PWA. Inline left/top/width/height are cleared in that mode so a later safe-area update can move the clip. Collapsed portrait stays at the top-left corner. Expanded, desktop, and landscape layouts still follow the minimap.

Placement still runs on playback and layout changes, not every frame. No simulation or renderer loop changed.

Verification: unit coverage checks the condensed CSS contract for both browser and PWA class sets, collapsed corner placement, and minimap placement after leaving condensed portrait. Headless Chrome at 390×844, with `--safe-area-top: 59px` standing in for the Dynamic Island inset that `deviceLifecycle` copies from `env(safe-area-inset-top)`, placed the 160×120 clip at top 71px and left 115px (12px below the protected band, centered). Clearing the variable moved the clip to top 12px without another placement call. Landscape still followed the minimap rectangle. Headless Chrome reports `env(safe-area-inset-top)` as 0, so the live inset was the CSS variable. Qualifying-hardware 75 FPS acceptance is unchanged and was not re-run; this is not a per-frame path.
