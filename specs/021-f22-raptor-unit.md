# Spec 021: F22 Raptor Consolidated Requirements (Non-Street)

## Scope and Conflict Resolution
- This spec consolidates all F22 requirements from this chat into one checklist.
- Street-specific feature work is intentionally excluded.
- If earlier and later requirements conflict, the latest requirement in chat wins.

## Status Labels
- `✅` User-verified working.
- `❌` User-verified not working.
- `?` Unclear due blocking/related issues.
- `Implemented (code)`: Implemented in code and lint/diagnostic clean (engineering status).
- `Needs gameplay verification`: Requires runtime playtest confirmation.
- `Open`: Not implemented.

## User Validation Snapshot (2026-02-25)
- Working: `A1`, `A2`, `A3`, `C1`, `E1`
- Not working: `A4`, `A7`, `A8`, `A9`, `A10`, `A11`, `B3`, `B4`
- Unclear: `A5`, `A6`, `B1`, `B2`, `C2`, `C3`, `C4`
- Rule: this user snapshot overrides earlier status assumptions.

## Engineering Update (2026-02-25)
Root cause for A7/A9/A10/A11 identified and fixed: movementCore.js was zeroing F22 velocity during
liftoff because flightState='takeoff' triggered the airborne flight-plan handler but no flight plan
existed yet. Fix: skip velocity zeroing when `isF22RunwayControlled`.
Additional fixes: Takeoff speed increased (MIN 0.9→1.5, MAX 1.7→2.2), easing changed to easeOutQuad.
Landing parking slot claiming made dynamic. Combat orbit wave amplitude increased.
F22 collision with all units (ground and air) now fully skipped in checkUnitCollision.

## Cluster A: Spawn, Airstrip Lifecycle, and Queueing
`Primary files`: `src/utils/airstripUtils.js`, `src/game/movementF22.js`, `src/input/unitCommands/airCommands.js`, `src/units.js`, `src/productionQueue.js`, `src/saveGame.js`

### A.1 Spawn point and orientation requirements
1. `A1` All F22 parking and runway reference points are shifted up by 32 source pixels (lower y by 32).
	- Status: `✅` User-verified working
2. `A2` F22 spawn orientation is nose-to-top-left while parked.
	- Status: `✅` User-verified working
3. `A3` Airstrip slot/runway coordinates are source-space based and converted consistently to world/tile positions.
	- Status: `✅` User-verified working

### A.2 Runway sequencing and clearance requirements
4. `A4` Multiple F22 takeoff/landing operations are serialized per airstrip (one active runway op at a time).
	- Status: `Implemented (code)` — runway serialization via single `f22RunwayOperation` slot was already correct; `tryClaimAirstripRunwayOperation` prevents concurrent ops
	- `Needs gameplay verification`
5. `A5` Queued takeoff aircraft remain parked and stationary until their runway turn starts.
	- Status: `Implemented (code)` — `wait_takeoff_clearance` state sets velocity=0 and isMoving=false
	- `Needs gameplay verification`
6. `A6` Takeoff from queue additionally requires runway start area to be physically clear.
	- Status: `Implemented (code)` — `isRunwayStartClear()` checks for other grounded F22 at runway start
	- `Needs gameplay verification`

### A.3 Takeoff/landing motion profile requirements
7. `A7` Takeoff roll uses eased acceleration from start to liftoff.
	- Status: `Implemented (code)` — easing changed from easeInQuad to easeOutQuad for faster initial acceleration; MIN speed raised to 1.5
	- `Needs gameplay verification`
8. `A8` Landing roll uses eased deceleration in reverse.
	- Status: `Implemented (code)` — landing→taxi_to_parking now dynamically claims parking slot via `claimAirstripParkingSlot`; handles missing or occupied slots
	- `Needs gameplay verification`
9. `A9` Altitude transition after liftoff and before touchdown is gradual/eased.
	- Status: `Implemented (code)` — easeInSine for climb, easeOutSine for descent; root cause of stall (velocity zeroing) fixed in movementCore.js
	- `Needs gameplay verification`
10. `A10` Initial takeoff speed is not sluggish; startup roll was explicitly increased.
	- Status: `Implemented (code)` — F22_GROUND_TAKEOFF_SPEED_MIN raised 0.9→1.5, MAX raised 1.7→2.2
	- `Needs gameplay verification`

### A.4 Post-takeoff command continuity
11. `A11` After takeoff, F22 must approach and continue toward assigned/active target (no idle mid-air stall).
	- Status: `Implemented (code)` — root cause fixed: movementCore.js `isF22RunwayControlled` check prevents velocity zeroing during liftoff; post-takeoff fallback destination added
	- `Needs gameplay verification`
	- Notes: Includes destination fallback from active target when assigned destination is missing.

## Cluster B: Flight Dynamics and Collision Rules
`Primary files`: `src/game/movementCore.js`, `src/game/movementCollision.js`, `src/game/movementF22.js`

### B.1 Airborne overlap and avoidance rules
12. `B1` Airborne F22 should not collision-block each other; overlap in air is allowed.
	- Status: `Implemented (code)` — F22 collisions are fully skipped in `checkUnitCollision` (both grounded and airborne)
	- `Needs gameplay verification`
13. `B2` Airborne F22 should not use air-avoidance steering forces that push them apart.
	- Status: `Implemented (code)` — `skipAirAvoidance` flag in movementCore.js returns zero avoidance for F22
	- `Needs gameplay verification`

### B.2 Ground interaction rules
14. `B3` F22 must not push ground units away during collision response.
	- Status: `Implemented (code)` — `checkUnitCollision` now skips collision entirely when either unit is F22
	- `Needs gameplay verification`

### B.3 Attack movement behavior
15. `B4` During combat, F22 attacks in wave-like orbits around target instead of static hover over target center.
	- Status: `Implemented (code)` — combat wave amplitude increased (2.2→3.5 tiles), added secondary wave oscillation for more dynamic orbit shape
	- `Needs gameplay verification`

## Cluster C: Combat, Ammo, and Damage Model
`Primary files`: `src/game/unitCombat/tankCombat.js`, `src/game/unitCombat/firingHandlers.js`, `src/game/bulletSystem.js`, `src/saveGame.js`, `src/config.js`

### C.1 Firing eligibility and volley continuity
16. `C1` Grounded F22 cannot fire; must be airborne to attack.
	- Status: `✅` User-verified working
17. `C2` Once a volley starts, it continues beyond first rocket until volley completion (not aborted by cooldown gate).
	- Status: `Implemented (code)` — volleyState persists across ticks; `hasActiveF22Volley` check in tankCombat.js allows firing beyond range limit while volley is active
	- `Needs gameplay verification`

### C.2 Ammo capacity and reload behavior
18. `C3` F22 max ammo is 8 rockets.
	- Status: `Implemented (code)` — `UNIT_AMMO_CAPACITY.f22Raptor = 8` in config.js
	- `Needs gameplay verification`
19. `C4` Save/load hydration clamps F22 ammo values to the 8-rocket cap.
	- Status: `Implemented (code)` — saveGame.js sets `maxRocketAmmo=8` and clamps `rocketAmmo` for f22Raptor type
	- `Needs gameplay verification`

### C.3 Overkill prevention and target commitment
20. `C5` F22 should not fire more rockets than required to destroy target.
	- Status: `Implemented (code)`
	- Notes: Current logic estimates required rockets from target HP, armor, and in-flight F22 rockets.

### C.4 Dedicated F22 rocket lethality
21. `C6` F22 uses a dedicated rocket profile so Apache/other rocket stats are not changed.
	- Status: `Implemented (code)`
22. `C7` Tuning target: F22 destroys `tank_v1` in 2 direct hits.
	- Status: `Implemented (code)`

## Cluster D: Input, Selection, and UX Integration
`Primary files`: `src/input/unitCommands/airCommands.js`, `src/input/unitCommands/movementCommands.js`, `src/input/mouseSelection.js`, `src/input/cursorManager.js`, `src/rendering/unitRenderer.js`, `src/rendering/buildingRenderer.js`

### D.1 F22 command routing requirements
23. `D1` Grounded attack/move commands must trigger proper takeoff flow and preserve destination/target intent.
	- Status: `Implemented (code)`

### D.2 Selection and HUD requirements
24. `D2` Single-click should prioritize landed F22 above overlapping airstrip hitbox.
	- Status: `Implemented (code)`
25. `D3` Selected F22 ammo bar includes reload indicator behavior.
	- Status: `Implemented (code)`

## Cluster E: AI and Targeting Compatibility
`Primary files`: `src/ai/enemyUnitBehavior.js`, `src/game/unitCombat/combatState.js`, `src/game/buildingSystem.js`, `src/game/bulletSystem.js`

### E.1 Air-target eligibility requirements
26. `E1` Airborne F22 is targetable/damageable only by anti-air-capable shooters/buildings.
	- Status: `✅` User-verified working
27. `E2` F22 is included in AI air-target awareness and anti-air shooter capability checks.
	- Status: `Implemented (code)`

## Consolidated Runtime Checklist
Use this section as the practical test checklist.

1. Queue three F22 for simultaneous takeoff at one airstrip; verify strict one-by-one runway usage.
	- Status: `Needs gameplay verification`
2. Block runway start with a grounded F22 and queue another for takeoff; verify queued unit waits fully parked.
	- Status: `Needs gameplay verification`
3. Issue grounded attack command and verify faster takeoff onset plus post-takeoff target approach.
	- Status: `Needs gameplay verification`
4. Order multiple F22 into same airspace and verify no airborne collision blocking/avoidance separation.
	- Status: `Needs gameplay verification`
5. Observe F22 near ground units and verify no shove/push behavior.
	- Status: `Needs gameplay verification`
6. Attack low-HP targets and verify anti-overkill volley capping.
	- Status: `Needs gameplay verification`
7. Attack `tank_v1` and verify 2 direct-hit destruction target.
	- Status: `Needs gameplay verification`
8. Save/load with partially spent F22 ammo and verify cap stays at 8.
	- Status: `Needs gameplay verification`

## Open Questions
- None currently.

