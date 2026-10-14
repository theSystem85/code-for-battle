# Bug: Apache helipad touchdown claims

- [x] **Keep settled helipad occupancy stable**
  Distinguish an unstarted touchdown timer from completed settling and compute Apache touchdown tiles from the image center.
  Spec: none

Main diagnosis: individual-order reservation checks and the occupied-pad blocked cursor already exist. A separate real landing defect prevents a stable occupancy claim: zero represented both an unstarted and completed settling countdown, so the timer restarted after every completed touchdown and cleared `landedHelipadId`/`landedUnitId` again. A coupled real movement/service test reproduces this on main and passes after the fix. A second defect unconditionally reset each aircraft’s timer when iterating a different, distant pad, so a two-pad map could never complete the first landing. Scope settling and refueling cleanup to the active pad ID, reset it on takeoff/departure, use `null` for an unstarted timer and retain zero for completed settling. Correct the existing top-left touchdown tile assignments to center-based coordinates. Existing movement collision checks exclude self occupancy; no new blocking checks are introduced.

Regression: `tests/e2e/apacheHelipadOccupancyRegression.test.js`. Issue the actual individual landing commands sequentially. Require the first pad claim to persist across simulation ticks before hovering its footprint with the second Apache selected, assert the blocked canvas cursor, then require a distinct alternate pad and persistent occupancy for both. Use logical-canvas coordinate conversion for the pointer and explicit airborne initialization; failures report flight/landing flags, actual positions, plans, settling state, speed and both pad occupants.

Additional coverage: `tests/unit/regressionRuntime.test.js` runs actual Apache movement, global pathfinding and helipad service for sixty simulated seconds, with two pads and sequential landings; the first claim must persist throughout the second approach.

Hot-path audit: countdown arithmetic occurs only for nearby landing/landed aircraft in the existing pad/unit traversal. At 75 updates/sec and 200 aircraft, at most 15,000 checks/sec per pad; changing the sentinel and center arithmetic adds no scans or allocations. DPR has no effect on this CPU work (multiplier 1); rendering is unchanged.

- [ ] Human Chromium validation: `npm run test:e2e:regressions`.
- [ ] Qualifying-hardware before/after 75 FPS acceptance under `performance_improvement.md`; browsers and hardware benchmarking are prohibited/unavailable here. No performance certification is claimed.

Round 2 validation is recorded in `2026-10-14-vitest-playwright-runner-separation.md`.
