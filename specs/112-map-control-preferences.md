# 112 — Map control preferences

Supersedes the hand-button fallback in spec 110 and the original default values in spec 111.

- Remove the hand/pan action button, primary-drag pan mode, mode event interception and cursor CSS. Keep ordinary primary/Shift selection, secondary-button drag panning, wheel panning and two-finger touch panning. Update tutorial, manual and localized landing copy to stop referring to the removed button.
- Raise the default keyboard maximum from 8 to 32 reference pixels/frame (480 to 1,920 pixels/second). Expand the runtime maximum-speed field ceiling from 32 to 128. Keep acceleration at 1,200 px/s² and reversal deceleration at 2,400 px/s². Reduce automatic release braking from 3,600 to 1,200 px/s². From the new top speed, acceleration and release braking each take approximately 1.6 seconds.
- Runtime Config → Controls offers **Invert Touch/Trackpad Map Panning**, default off. Reverse both axes of the two-finger touchscreen pan and trackpad/wheel pan. Leave ordinary mouse secondary-drag, long-press single-touch pan and keyboard direction unchanged. A browser cannot reliably distinguish a trackpad wheel event from a mouse-wheel event; document that wheel direction also reverses.
- Read the preference on each gesture update through the existing runtime config system. No simulation/render-loop code or per-frame allocations are added. The higher speed uses the existing scalar keyboard integration.

Verify normal and inverted two-finger gesture direction through the UI setting, wheel handling, retained secondary drag, absence of the button, revised keyboard defaults and full unit/lint/build checks. Existing reference-hardware performance certification remains open; prior spec-111 measurements describe its earlier defaults rather than certifying the revised top speed.

## Implementation validation

`npm run test:unit -- --maxWorkers=2`: 254 files / 4,856 tests passed. `npm run lint:fix:changed`, `npm run lint` and `npm run build` passed. Chromium (system executable via temporary Playwright config) passed all five scenarios in `mapInputControls.test.js` and `keyboardCameraPedals.test.js`: wheel containment, secondary drag/button removal, touch factory sale, normal/inverted two-finger pan through Controls, and held-key acceleration/braking with live tuning. Unit coverage also reverses both wheel axes and Shift-wheel fallback.
