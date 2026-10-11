# 105 — Full-screen Automation modal on phones only

Status: specified, not implemented. Read [099](099-automation-cfbl-program.md). Dependencies: none beyond 099 for initial shell work; final validation requires [103](103-automation-default-view-and-state-indexes.md) and [104](104-automation-text-view.md). Own device classification and Automation sizing, not a general sidebar/device-layout rewrite.

## Classification contract

Do not reuse `mobile-portrait`: current `deviceLifecycle.js` puts touch iPads in that class too. Do not use only `max-width:640px`: iPhone landscape is wider; iPad split-screen may be narrower; an on-screen keyboard shrinks visualViewport height. Full-screen applies to iPhone/Android **phone hardware** in both orientations and PWA mode, not tablets or narrow desktop windows.

Add an independently testable classifier/helper with inputs for UA client hints where available, iOS phone/tablet signals, touch capability and stable screen geometry. Priority:

1. Explicit iPad/tablet signal returns tablet, including iPadOS's desktop-Mac UA with multiple touch points. Explicit iPhone/iPod or supported Android phone signal returns phone. Android tablet signals return tablet.
2. Where UA Client Hints exposes a phone/mobile distinction, use it alongside explicit tablet exclusion; don't treat every coarse pointer as a phone.
3. Unknown devices may use coarse pointer plus a **screen** short edge below 600 CSS px as a documented fallback, never keyboard-shrunken visualViewport or split-window width. Real-world classification is imperfect; publish/test the heuristic and allow test injection. Do not claim UA-free perfect hardware identification.

Orientation/window resizing changes dimensions but does not change phone-versus-tablet classification just because a keyboard opened. Update classification only if actual device information changes. Screen dimensions may be normalized for reported orientation; no host-specific hidden assumptions. This policy is intentionally separate from existing sidebar behavior.

## Modal sizing and interaction

- Phone Automation backdrop padding 0; modal fills available visual viewport, width 100%, height using `100dvh` with safe fallback and visualViewport offsets where Safari keyboard handling needs them. No bounded max-width/max-height or rounded outer corners. CSS full screen only; do not invoke browser Fullscreen API.
- Header with title/toggle/close and footer with Save/Cancel remain reachable. Body is the single primary vertical scroller. ATV owns its code/options scrolling; avoid unintended double vertical body scrolling. Respect safe-area top/bottom/left/right; do not double-add safe-area padding when the visual viewport already excludes an inset.
- Keyboard opening uses the visible height so footer and flyout remain accessible; scroll focused numeric/query input into view without losing the caret. Use at least 16 px input text to avoid iOS focus zoom and 44 px touch targets. Support narrow portrait and short landscape without hiding the view toggle or validation message.
- Trap focus within dialog, label it, set appropriate modal semantics, and prevent background scroll/input. Restore the invoking control's focus and pre-open scroll/pause state on close. Remove viewport listeners and stale classes/inline sizes on teardown. Resize/toggle cannot resume the game or lose the shared draft.
- Tablets/iPad and desktop keep the current centered bounded modal (760 px nominal width, viewport-safe height) and may adapt internal stacking without becoming a phone full-screen shell. Narrow iPad split-screen may naturally fill available width, but retains bounded-dialog styling and no phone classification.

## Test matrix and acceptance

| Device context | Expected shell |
| --- | --- |
| iPhone SE/13 Pro/Pro Max, portrait and landscape | full screen |
| Android phone, portrait and landscape | full screen |
| Phone Safari/Chrome with keyboard and browser bars; installed PWA | full visual viewport, safe controls |
| iPad mini/iPad Pro, portrait and landscape | centered bounded dialog |
| iPadOS desktop UA, touch points >1, split-screen narrow width, keyboard open | bounded dialog |
| Android tablet with keyboard | bounded dialog |
| Narrow desktop window, coarse-pointer laptop | bounded dialog |
| Unknown coarse device with stable screen short edge <600 | phone heuristic, documented |

Unit tests cover classifier signals and keyboard-independent geometry. Browser viewport tests cover no-margin phone bounds, safe-area styles, title toggle/footer, rotation with unsaved source, body scrolling and flyout clipping. Run actual iOS Safari/PWA interaction checks: emulation does not reproduce all keyboard/visualViewport behavior. Qualify that evidence separately in 108. Run all unit tests and lint for implementation. Handoff: classifier export, shell CSS class/viewport interface, matrix results and any real-device gaps.
