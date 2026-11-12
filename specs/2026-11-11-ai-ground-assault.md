# AI ground assault

## Summary

Every AI player attacks every opponent (human or AI) with squads instead of trickling single vehicles into a base. The planner reuses `generateDangerZoneMapForPlayer` to choose the weakest stationary-defence corridor to that opponent's construction yard, destroys only the defences that cover that corridor, then the construction yard, the vehicle factory, the remaining defences, and the remaining buildings.

## Squads

A complete squad is the production target:

- 3 core tanks (`tank` / `tank_v1`, `tank-v2`, `tank-v3`)
- 2 light tanks
- 1 rocket tank
- 1 howitzer
- 1 ambulance
- 1 recovery tank
- exactly 1 ammunition truck

Production fills that template before starting another squad. Economy, air, and naval production keep their existing priority. Combat vehicles spawn from the vehicle factory, including howitzers and recovery tanks.

Squads share a target and a move order. Wounded vehicles (under 80% health) take a tile farther back along the approach so healthier vehicles stay in front. Idle ambulances, recovery tanks, and ammunition trucks follow that rear tile; an active heal, tow, or resupply is left alone.

## Who may attack a base

- One ground vehicle attacks buildings only when that opponent has no ground defence and no air defence.
- Two or more ready vehicles attack only when their combined firepower and health beat the buildings that will shoot them.
- One `apache`, `f22Raptor`, or `f35` may attack a base that has no anti-air. That permission is `maySoloAirStrikeBase`. Existing air targeting already refuses nearby rocket turrets and rocket tanks, and it is unchanged.

Air defence here is a rocket turret, rocket tank, or destroyer. Ground defence is any building in `PLAYER_DEFENSE_BUILDINGS`.

## Retreat

`estimateEngagementOutcome` compares offence per second and remaining health. A vehicle missing its gunner or loader has no offence and does not add staying power, so it is an easy target on either side. The squad retreats together when the enemy would win. It does not retreat from a crippled enemy; it focuses that enemy instead.

## Performance

`updateGroundAssaultStrategy` runs at most once every 5 seconds per AI player, and only when `globalThis.__cfbFrameHeadroomMs` is unknown or at least 2ms (the same foreground-slack signal the sprite pipeline uses). Between those passes, each combat unit only reads its existing order. Path updates stay on the existing 5 second decision interval.

## Known gaps

- The danger search picks the gate and the minimum set of defences. Units then path to that gate with the normal pathfinder, which does not itself add danger to every step.
- The logic is plain functions in `src/ai/groundAssaultStrategy.js` so it can move into the automation state machine later. It is not an automation yet.
- No hardware GPU was available, so the 75 FPS check is still Patrick's on `dev`.
