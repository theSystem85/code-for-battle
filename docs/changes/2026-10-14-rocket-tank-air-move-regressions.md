# Bug: Rocket tank airborne aiming

- [x] **Aim rocket launchers with their hull at airborne targets**
  Match rocket firing eligibility to hull steering and altitude-adjusted target coordinates while retaining existing airborne detonation and move-order cancellation.
  Spec: none

Main diagnosis: a real firing bug exists. Rocket tanks have no gunner; movement makes their unused turret follow their hull. Combat steers the hull at the elevated aircraft sprite, but firing previously required the turret to face the ground position. A nearby hovering Apache therefore never received rockets. The real movement/combat/projectile regression fails on main and damages the airborne Apache with the fix. Existing ballistic rocket logic already supports airborne detonation/damage; normal movement commands already clear target, burst and remote rocket destination.

Regression: `tests/e2e/rocketTankAirAndMoveRegression.test.js`. Keep a non-dodging enemy Apache airborne with full ammunition and locked strategic orders, require airborne damage, then issue the actual movement command and observe fourteen simulation seconds (longer than the twelve-second rocket cooldown). Require movement, no target, no burst and unchanged ammunition/shot time. Diagnostics include altitude, ammunition, heading, turret, target and burst state. The old empty-ammo setup could invoke automatic helipad resupply if the Apache acquired a target.

Additional coverage: rocket hull/air/building alignment in `tests/unit/combatHelpers.test.js`; actual rocket launch and airborne damage in `tests/unit/regressionRuntime.test.js`.

Hot-path audit: aiming checks run at most a few times per active shooter per update, approximately 30,000 checks/sec for 200 firing units at 75 updates/sec. The hull branch reuses existing angle calculations and adds an altitude subtraction; no new scans, helper objects or allocations. CPU work is independent of DPR (multiplier 1); rendering is unchanged.

- [ ] Human Chromium validation: `npm run test:e2e:regressions`.
- [ ] Qualifying-hardware before/after 75 FPS acceptance under `performance_improvement.md`; browsers and hardware benchmarking are prohibited/unavailable here. No performance certification is claimed.

Round 2 validation is recorded in `2026-10-14-vitest-playwright-runner-separation.md`.
