# Loaded-save pathfinding and aircraft targeting regression

## Summary

Loading the supplied four-player saves must not develop a main-thread CPU collapse. Empty Apaches must return to their own available helipad without causing ground logistics or repeated route-search work. Rockets and other anti-air-capable weapons must aim, home, collide, and detonate at the visible airborne sprite position rather than the aircraft's ground shadow.

## Requirements

1. A failed automatic harvester ore route releases its reservation and all harvester update branches honor the same randomized 3–5 second retry deadline.
2. Stuck-harvester recovery tests at most eight ranked ore candidates per recovery decision rather than every ore tile on the map.
3. AI naval route failures record their decision timestamp before pathfinding and test at most two ranked water destinations per decision.
4. AI support managers operate only on the current AI party when invoked from that party's update, so a four-player update does not repeat every global support scan for every party.
5. Ammunition trucks keep an active resupply assignment, throttle combat-group follow routes, and never auto-route toward Apache/F22/F35 aircraft; those aircraft use their helipad/airstrip service state machines.
6. Empty Apache helipad discovery honors `autoHelipadRetryAt` even when no pad was available during the previous attempt. Strategic air targeting must not replace the service route while rocket ammo is empty.
7. Apache save data includes flight state, altitude, pad assignment, flight plan, and automatic return state. Legacy saves that omitted those fields restore an Apache as grounded only when its center is actually on a friendly helipad; otherwise it restores airborne at normal altitude.
8. Apache, F22, F35, Rocket Tank, Destroyer, and Rocket Turret aim paths use the allocation-free `getAircraftAltitudeLift` helper for airborne targets. Apache volleys must use this visible target point too.
9. The focused opt-in browser regression remains in `tests/e2e/savegameAirCombatPerformance.test.js` and loads `2026-08-28_18-37-40-820Z_issue.json`. It must retain at least 80% of the initial FPS and keep average update CPU below 20 ms once live verification is authorized.
10. A player-issued Apache attack order is combat intent, not a manual-flight override. It must begin firing as soon as range and cadence allow, retain the selected target, and refresh its allocation-free combat destination every tick as that target moves. Recent joystick/direct-flight input may still temporarily suppress automatic combat movement.

## Hot-loop analysis

- Harvester logic runs once per simulation tick. The issue save has 19 harvesters, or about 1,140 harvester visits/second at 60 simulation ticks. A failed route formerly re-entered through multiple branches and produced full-map A* work every tick; the new deadline check is constant-time and performs no allocation.
- AI logic runs every third simulation frame for up to four parties. Party-scoped support managers avoid repeating global scans four times, while failed naval and logistics routes retain a timestamp even when no route exists.
- Aircraft altitude correction runs in projectile/combat hot paths once per relevant aim, homing, or collision calculation. It is a constant-time type/number check and creates no arrays, maps, sets, or frame-sized drawing work.
- Apache combat runs once per living Apache per simulation tick. Distinguishing direct-flight control from an explicit attack order adds only constant-time scalar/boolean checks; pursuit reuses the existing `flightPlan` object after initial creation and does not add pathfinding or collection scans.

## Reproduction evidence

- Original save baseline: approximately 58 FPS immediately after load.
- Delayed failure: approximately 0.2–8 FPS, with update work taking hundreds of milliseconds to multiple seconds and `findPath` dominating CPU.
- Call-site tracing found 18,814 failed `findNewOreTarget` route attempts in the pathological interval, plus hundreds of repeated naval and ammunition-truck follow searches. The direct issue save contains 19 harvesters, four destroyers, seven ammunition trucks, and two enemy Apaches with zero rockets, matching those trigger paths.
- An intermediate build, before the final cross-branch harvester deadline fix, still measured about 8.19 FPS with average update CPU around 113 ms and a 370 ms maximum. This is not treated as a passing result.

## Verification

- Focused unit suites cover failed-route throttling, bounded candidate searches, Apache retry behavior, aircraft-visible volley coordinates, aircraft exclusion from ground ammo logistics, Apache save serialization, legacy Apache airborne restoration, and the F22 safe-path heap.
- Apache combat regression coverage also verifies that a recent explicit player attack command starts a volley and that moving the same target refreshes the combat flight destination without losing target identity.
- Required full verification: `npm run test:unit` and `npm run lint:fix:changed`.
- Playwright was not run after the final changes because the user explicitly requested to perform live gameplay verification themselves. The exact opt-in command, when authorized, is `PERF_SAVEGAME_AIR_COMBAT=1 npx playwright test tests/e2e/savegameAirCombatPerformance.test.js --project=chromium --reporter=line`.
