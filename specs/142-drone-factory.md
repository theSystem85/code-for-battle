# Spec 142: Drone Factory

The Drone Factory is an advanced logistics building. It uses the existing [map sprite](../public/images/map/buildings/drone_factory_map.webp) and [sidebar card](../public/images/sidebar/drone_factory_sidebar.webp). The build card appears after buying **Autonomous Systems** and requires an owned, living Technology Research Center for queuing and placement. Normal construction prerequisites and placement rules still apply.

| Footprint | Cost | Power draw | HP | Armor | Limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3×3 | $4,500 | 80 | 425 | 2 | 1 per player |

At one Construction Yard and normal power, the standard cost-based construction timer is 3.375 simulation seconds. Repair and sale follow standard building rules.

At placement, the factory adds a 1.25× assembly speed multiplier for the owner's new Harvester, Ambulance, Fire Engine, Tanker Truck, Ammunition Truck, and Recovery Tank jobs. Vehicles continue to use their existing producers and spawn rules. The multiplier is fixed at the start of each job. Sale or destruction removes the bonus for subsequent jobs. An already placed factory continues working if the Technology Research Center is lost.

The blueprint stays researched if its center is lost. The build card remains visible and disabled until the center is rebuilt. A paid structure ready for placement waits for the prerequisite to return. The scripted opponent does not buy research perks or build this tier automatically. Building a new drone unit is a separate feature.
