# Rocket Turret vs Apache Damage Tuning

## Summary
- Rocket turret rockets must destroy an airborne Apache in exactly three direct hits.
- The damage adjustment must be scoped to rocket turret anti-air rockets versus Apache helicopters only.
- Rocket tank, Apache, and other anti-air interactions must remain unchanged.

## Requirements
1. When a `rocketTurret` rocket explosion damages an airborne `apache`, the explosion applies an Apache-specific bonus multiplier so each direct hit deals at least 14 damage against the Apache's 40 HP pool.
2. Three direct `rocketTurret` rocket hits are sufficient to destroy an airborne Apache.
3. The Apache-only damage bonus does not apply to `rocketTank` rockets or non-Apache targets.
4. Coverage includes:
   - a unit test for the projectile/explosion damage multiplier path, and
   - a Playwright E2E scenario that proves a rocket turret with only three rockets can still kill an Apache.

5. Airborne Apache explosion damage uses the same centered impact distance as grounded Apache hits, so a direct rocket impact deals the same damage in both states.
6. Rocket Turret aim, homing, collision, and proximity detonation use the visible sprite center for every supported airborne aircraft (`apache`, `f22Raptor`, and `f35`), including the aircraft's altitude lift, rather than its ground coordinate.
7. The altitude targeting calculation is allocation-free in the per-projectile update path. It performs constant-time type checks for each active homing rocket and does not add unit-array scans or per-frame collections.
8. The opt-in live benchmark exercises 120 simultaneous Rocket Turret rockets against a mixed airborne fleet. Run it with `PERF_ROCKET_TURRET_AIR=1 npx playwright test tests/e2e/rocketTurretApacheBurst.test.js --project=chromium --grep "120 homing" --reporter=line`; the active scene must retain at least 80% of the same-run baseline FPS while recording update/render timing and heap delta.

## 2026-07-31 Performance verification

- Hot-path frequency: altitude correction runs once at each relevant aim/homing/collision calculation per active projectile per simulation tick. The representative worst case is 120 rockets, so the added work is at most 120 constant-time helper calls at each affected projectile stage per tick; it does not scale with device pixel ratio because no pixels are drawn by the helper.
- Baseline result: unavailable in this container because Playwright Chromium was absent and `npx playwright install chromium` was rejected by the browser CDN with HTTP 403 before the benchmark could launch.
- Fixed result: unavailable for the same environment limitation. The reproducible opt-in benchmark remains in the suite and enforces no more than a 20% same-scene FPS loss while reporting CPU timing and heap delta.
