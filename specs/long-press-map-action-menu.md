# Long-press map action menu

Version: 0.58.0

Hold the primary mouse button or a single touch on the map with owned units or completed defence buildings selected. After 1000 ms by default (`DEFAULT_MAP_ACTION_LONG_PRESS_MS`), open the existing radial menu at the press location. Settings and `remoteControlApi.setLongPressDuration(ms)` adjust the duration to 300–5000 ms, persisted through the game's IndexedDB storage. The production-tooltip delay is independent.

Movement beyond 8 CSS pixels for mouse or 12 for touch cancels. Early release, pointer cancellation, another pointer, camera movement, wheel input, drag selection, blur, keyboard input, or an interaction mode change cancels a pending hold. Existing touch pan and per-unit policy timers defer to a pending map hold. Short taps retain the ordinary input path. Opening the menu consumes the original release and compatibility mouse events, resets selection/touch drag state, and leaves the menu available for a subsequent selection. Escape closes it. A small DOM progress indicator appears after 200 ms and uses no map canvas draw calls.

Combat units with the existing ground-attack capability and defence buildings can force attack the chosen world position through the existing attack handler and defence target queue. All mobile units can move there and hold, engaging enemies in range without chase or line-of-sight repositioning. This uses a zero-distance chase leash; collision separation remains authoritative. A subsequent direct command or Stop cancels pending arrival/hold state. Defence-only selections offer force attack, hold fire and clear target; mixed selections apply each option to compatible entities only.

Menu and submenu labels render at 7 px in the 48 px round buttons. When a rendered line box would cross the button's inner circle, the label steps down in 0.5 px increments to a 5 px minimum, once per menu open; a single word that still does not fit may wrap mid-word. Only the map action menu is restyled; other radial menus keep their label size.

The automation submenu lists owned registry policies with `variant: unit` and `scope: perUnit`, provided a programmable unit is selected. The registry's unit variant applies to every programmable unit type; it has no additional type selector. Production, global, defence and foreign policies are excluded. Each selected programmable unit moves first, then binds the chosen automation individually when its image center enters the destination tile. No unit position or occupancy is rewritten by arrival processing.

All API coordinates are world pixels, matching ordinary movement commands. The existing `window.remoteControlApi` exposes:

- `openMapActionMenu({x,y})`
- `forceAttackAt({x,y})`
- `defendHoldAt({x,y})`
- `applyAutomationOnArrival({policyId,x,y})`
- `listApplicableAutomations()` returning `{policyId,name}[]`
- `setLongPressDuration(ms)`
- `holdFire()` and `clearTarget()` for the open menu's location

UI and API issue the same `map-action` network command with selected entity IDs. The host revalidates ownership, coordinates, policy and defence readiness, applies existing movement/attack handlers, and snapshots arrival/hold state. The enclosed handler calls suppress duplicate movement/attack broadcasts. Remote clients wait for authoritative state.

## Validation

- `npm run lint:fix:changed`
- `npm run lint`
- `npm run test:unit`
- `npm exec playwright test tests/e2e/longPressMapActionMenu.test.js --project=chromium --workers=1 --reporter=line`

Sandbox results: `npm run lint:fix:changed` and `npm run lint` pass; `npm run test:unit` passes all 5,043 tests in 279 files.

The E2E suite covers the 1000 ms default, label fit for all three options and a long automation name, desktop hold/short click/movement, consumed release, force attack, movement and hold, automation binding after real movement, settings, browser API and touch/two-finger gestures. In this sandbox it cannot execute: Vite cannot bind localhost (`listen EPERM: operation not permitted 127.0.0.1:5173`). Browser execution remains outstanding; DOM integration tests cover capture-phase suppression, cancellation, API/network dispatch and storage independently.

## Performance acceptance — outstanding

The simulation calls one arrival helper per unit per tick. Unordered units return on one property read; pending orders perform center-based tile checks. A held unit uses existing in-range attack targeting at the 150 ms policy cadence, preparing and reusing the existing sensor scope so refusal/run share one target query. At 320 units and 75 updates/s this is 24,000 inexpensive idle checks/s or, with every unit holding, at most about 2,134 existing targeting evaluations/s. No per-tick state rebuilding, ID lookup scans or new arrays/maps/sets are introduced in the new arrival/hold checks. Movement and combat add boolean guards. Event-time selection filtering and network command validation may allocate; they are outside simulation/render entity loops. The progress cue occupies a fixed 28 CSS pixel square (56 backing pixels at DPR 2), independent of map size and entity count.

The qualifying-hardware 75 FPS gate is **not certified**. Localhost execution is prohibited here and no qualifying display/GPU is available. Before acceptance, run the protocol in `performance_improvement.md` on the base branch and this branch at identical backend/DPR/settings, including cold traversal, repeated full-map scrolling, 320 selected layered units, moving/holding/firing entities and procedural water. Record presented FPS, frame p95/p99/max and missed 13.333 ms deadlines, update/render CPU time, GPU timing where available, memory and GC. Retain full visual quality and prepare imagery before gameplay. Hardware measurement and the E2E suite remain required outside this sandbox.
