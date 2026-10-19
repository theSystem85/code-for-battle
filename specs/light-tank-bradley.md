# Light Tank (M2 Bradley-style IFV)

## Goal
A cheap, fast, lightly armored tracked combat vehicle with a rapid-fire 25 mm autocannon, available from the first Vehicle Factory. It fills the gap between unarmed utility vehicles and Tank V1: good for early raids, scouting and harassing light targets, weak against main battle tanks.

## Stats (unit type `lightTank`)
| Property | Light Tank | Tank V1 (reference) |
| --- | --- | --- |
| Cost | $700 | $1000 |
| Health | 70 | 100 |
| Armor | 0.8 (damage is divided by armor, so +25% damage taken) | none (1) |
| Speed | 0.46 (~1.4x) | 0.33 |
| Hull / turret rotation | 1.3x / 1.5x | 1x / 1x |
| Weapon | 25 mm autocannon, 6 damage, 3000 ms reload, projectile speed 16 | 20 damage, 4000 ms |
| Spread | ~1 degree (Tank V2 accuracy) | ~2 degrees |
| Ammo | 150 rounds | 42 |
| Fuel | 1500 tank, 350 consumption | 1900 / 450 |
| Crew | driver, commander, gunner, loader | same |

Sustained DPS is 2/s against 5/s for Tank V1. Each direct M2 hit makes one 1% crew-casualty roll, independent of the number of surviving crew. A successful roll selects one living member; one shot never kills multiple crew. Other weapons retain their existing casualty rules.

## Production and tech
- Built in the Vehicle Factory; unlocked together with Tank V1 as soon as the player owns a Vehicle Factory (milestone, save/load force-unlock, AI API tech tree).
- Uses the factory garage roll-out animation and rally logic like every vehicle-factory unit.

## AI
- Enemy AI builds it in the normal and high-budget mixes (about 20% and 8% of combat picks), spawns it from vehicle factories, and treats it as a ground combat unit for attack groups, base defense, retreat/repair, and logistics (recovery tank ratio).
- LLM digest role: `fast-raider`.

## Rendering
- Layered hull/turret/barrel sprites (`public/images/map/units/lightTank_{wagon,turret,barrel}.webp`) rendered by the tank image renderer with runtime rotation caching (64 steps) and @1x/@2x/@3x prepared variants chosen by device pixel ratio.
- Prepared target: 0.88 tiles on the long axis (smaller than the 1-tile main battle tanks).
- Map sprite: solid desert tan paint, no camouflage, boxy Bradley turret with TOW launcher on the left; turret length about 43% of the hull length, pivot at the turret-ring centre.
- Leaves track marks; uses tank wreck rendering; desert-camo build button `public/images/sidebar/light_tank.webp`.
- Firing reuses the tank shot sound at a lower volume (0.3).
