# Spec 090: Full base test save

## Summary
A locked builtin save named **Full Base Test** sits beside Mission 01 in the Save Games list. It is for testing a finished base. Loading it does not overwrite the player's own saves, and the row has no delete button, same as Mission 01.

## How to load
1. Open the sidebar **Save Games** tab.
2. Choose **Full Base Test**. It has the green **MISSION** badge and no delete or export button.
3. The camera centers on the local construction yard, same as other builtin missions.

Mission 01 stays the first builtin row. Full Base Test uses an earlier timestamp so it sorts after Mission 01 (Fordline). Its id is `Full_Base_Test` and its storage key is `builtin:Full_Base_Test`.

## Starting state
- Map is 100×100. The southern band from row 72 down is open water. A rock patch sits in the southeast, and ore is on land beside the player's refinery.
- Local player is `player1`. The enemy is `player2`.
- The player owns one finished building of every type in `buildingData`, including the shipyard, airstrip, helipad, and one street tile and concrete wall.
- Extra power plants are added until `updatePowerSupply` would report a non-negative player supply, and one fewer plant would leave the base short. The construction yard's factory bonus is included. The current data set needs 5 power plants and finishes at +185 supply.
- The shipyard sits on the south coast. Its south-shore footprint tiles and the launch row directly south of it are water. The airstrip is on land.
- The player owns one of every unit in `UNIT_PROPERTIES` except the shared `base` entry. `tank_v1` is the standard tank. Land units stand on open land. The Apache is parked on the helipad. The F22 and F35 are parked on separate airstrip spots. Naval units are in the southern water, clear of the shipyard footprint.
- The enemy owns one construction yard and nothing else. Its factory budget is 0.
- Sidebar production is already unlocked for every building type and every playable unit type, including the `tank` alias and `tank-v3`.
- Milestones that this starting base would already satisfy are marked achieved, so loading the save does not replay those videos.
- The player starts with 80000 credits.

## Source of truth
`scripts/generateFullBaseTest.js` reads `buildingData` and `UNIT_PROPERTIES` and writes `src/missions/mission_full_base_test.js`. `src/missions/index.js` registers that save after Mission 01. `scripts/generateMission01.js` keeps the same index so regenerating Mission 01 does not drop the test save.

`tests/unit/missions/fullBaseTest.test.js` checks the roster, power surplus, shoreline, enemy contents, and that footprints do not overlap.

## Performance
This change adds a static builtin save. It does not alter the simulation tick, render loop, or per-entity drawing. The 75 FPS gate is unchanged and was not remeasured in this headless session. The qualifying-hardware check remains outstanding.
