# Dynamic danger and retreat fire

## Summary

Retreating squads keep shooting at attackers that are still in weapon range while they move away. Attack planning uses the stationary defence map plus a coarse dynamic map of enemy vehicles. Threats already in range are fought before the next base building.

## Dynamic map

`src/game/dynamicDangerZoneMap.js` keeps one coarse grid per party (4 tiles per cell). A cell stores the offence per second of enemy mobile units that can reach it. That offence comes from the same estimator as squad combat: current health scales it, and a missing gunner or loader contributes nothing.

Updates are incremental. A unit is restamped only when it changes coarse cell, health bucket, type, or crew. The refresh runs at most once every 5 seconds, and only when the previous frame still had CPU headroom. It does not rebuild the grid every frame.

The danger-zone key cycles, and starts off: static map for each party, then the dynamic layer for each party, then off.

## Planning

The breach search minimises the highest combined danger on the path. The firepower check includes the breach defences and enemy vehicles that can shoot that path. If the squad would lose, it does not start the assault.

If an enemy unit or defence building is already in range, that threat is the squad target before the construction yard, vehicle factory, or later buildings. If the exchange is losing, the squad retreats toward a sampled tile with lower combined danger, closer to its own base when the danger is equal, and still fires at threats inside weapon range.

## Gaps

The retreat search samples a few tiles. It is not a full danger-weighted path for every step. The dynamic grid is coarse, so a unit can move inside one cell without a restamp. No hardware GPU was available for the 75 FPS check.
