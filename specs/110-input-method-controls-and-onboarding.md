# 110 — Input-method controls and onboarding

Status: implemented and verified in the available automated environment. Physical macOS Safari/Chrome acceptance remains open.
Date: 2026-10-14.

Revision: [spec 112](112-map-control-preferences.md) removes the hand-button mode described in the original contracts/evidence below. The current fallback is secondary-click hold-and-drag.

## Outcome

Players choose Mouse + keyboard, Trackpad, Touch or Gamepad as the first tutorial step. Persist that preference in the browser and allow changes later through the tutorial. Provide Open control settings to reach the appropriate Settings tab. The choice controls instructions/demonstrations without disabling other devices. Tutorial hints use the actual keyboard bindings and active gamepad profile; defaults are examples, not fixed prompts after remapping. Preserve existing onboarding progress/settings compatibility.

Publish an illustrated four-method guide in the deployed player manual and matching EN/DE landing sections. Semantic HTML/text diagrams are sufficient; every diagram needs readable text and meaningful context. No new binaries are required. Keep unrelated manual coverage, current Automation documentation and localized navigation intact.

## Camera and interaction contracts

- Consume nonpassive wheel events only over the game canvas. Normalize pixel units 1:1 to CSS pixels, line units to 16 CSS pixels and page units to canvas viewport dimensions; apply deltaX/deltaY to their respective camera axes, clamp to map bounds and consume delivered events at boundaries too. Shift with vertical-only wheel input provides horizontal panning; preserve an already supplied deltaX. Retain OS/browser momentum without adding inertia.
- Prevent page/boundary history navigation where the browser delivers cancelable events. Apply page-level overscroll containment consistent with the game owning the viewport. Preserve scrolling in dialogs/sidebar lists; do not promise to intercept gestures consumed by macOS/browser before the page receives them.
- Provide an explicit hand-button mode, labelled **Drag to pan map** with `aria-pressed`. While active, captured-pointer primary drag pans 1:1 until the mode is switched off or Escape is pressed. Sell/Repair buttons exit hand mode. Preserve ordinary Shift-primary additive selection when inactive. Keep secondary-click hold-drag camera panning and brief secondary-click deselection/context distinct; no accidental order after a camera drag.
- Consume Ctrl/Meta-wheel without pan or zoom on the canvas; do not reinterpret pinch-wheel as diagonal panning. Preserve map-editor wheel brush behavior.
- Describe actual primary-click orders after selection, rather than stale secondary-command labels. Refresh tutorial labels after settings/profile changes.
- Touch Sell mode takes priority over waypoint-building shortcuts. Leaving Sell restores ordinary waypoint behavior. Preserve other mode/ownership rules.
- Camera work is O(1) per input event. No changes to simulation cadence, rendering loops, visual fidelity or resolution are required for this input work.

## Documentation

[Input-method guide](../docs/input-method-controls.md) and `/docs/user-documentation.html#input-methods` explain all four methods, persisted preference, real Settings bindings/profiles, trackpad camera fallbacks and mode precedence. macOS troubleshooting covers Trackpad → Point & Click secondary click/tap settings, More Gestures → Swipe between pages off/remap, Scroll & Zoom → Natural scrolling, and system/browser limits. The landing page has localized anchors, four visual method cards and a deployed guide link.

## Acceptance and evidence

| Check | Required evidence |
| --- | --- |
| Tutorial choice and persistence | First-step method selection, restart/reload, switching methods, retained legacy progress |
| Actual configured hints | Remapped keyboard and active gamepad-profile prompt tests, appropriate touch/trackpad demonstrations |
| Delivered wheel events | Both axes, diagonal movement, pixel/line/page units, map edges, Shift-wheel, cancelable event prevention and scrolling outside canvas |
| Fallback and selection | Hand-button accessible state/toggle, primary drag camera motion; ordinary Shift-primary selection preserved when off; secondary drag does not issue a command |
| Touch Sell priority | Owned waypoint-capable building sells in Sell mode; shortcut works again after leaving the mode |
| Manual and localized landing | EN/DE text/anchors, accessible diagrams, no missing translation keys or guide links |
| Physical macOS Safari and Chrome | Execute [the physical-device protocol](../docs/input-method-controls.md#check-the-controls-on-a-physical-mac), record versions/settings/results; **pending** until measured |

Integrated verification on 2026-10-14:

- `npm run test:unit -- --maxWorkers=2`: 252 files / 4,845 tests passed, including normalized wheel input, current keyboard/controller mappings, input-aware text and tutorial progress migration/resume.
- `npx playwright test tests/e2e/mapInputControls.test.js tests/e2e/tutorialInputMethods.test.js`: five Chromium scenarios passed using the installed `/usr/bin/chromium` through a local Playwright config. Browser: Chromium 151.0.7922.173 on Debian 13. The project config currently targets Chromium only.
- Browser coverage includes native delivered diagonal/Shift/boundary wheel input, no page movement or history navigation during those gestures, scrolling outside the canvas, hand-mode primary drag with release outside the map, touch selling of a selected Vehicle Factory with one refund and no rally change, and desktop/iPhone-sized tutorial choice/settings/persistence/continuation. iPhone is Chromium device emulation, not physical Safari verification.
- Changed-file lint fix, full lint and production build passed. EN/DE landing control cards and manual anchors were checked at desktop/phone widths; no new binary assets are needed for the diagrams.
- The phone tutorial width regression caught during integration was fixed by including the card border in its declared width. Header/footer remain outside the guide's scrollable mapping content.

Synthetic Linux wheel events verify delivered-event handling only. They cannot certify macOS navigation gestures or a physical trackpad. No physical acceptance result is claimed by this specification. Follow the linked physical-device protocol to determine whether a particular Mac/browser emits horizontal wheel events with Swipe between pages disabled; use secondary-click hold-and-drag when it does not.

Documentation checks: `npx vitest run tests/unit/landingPage.test.js` passed 11 tests; full lint and relative-link checks pass. System Chromium verified four localized cards without horizontal overflow at 1280px and 390px for both EN/DE landing routes, plus the deployed manual anchor and four method diagrams. These are software layout checks; final integrated input checks are recorded by root orchestration.
