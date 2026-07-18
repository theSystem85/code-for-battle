# Prompt History

- UTC Timestamp: 2026-07-18T14:32:41Z
- Processed by: codex

## Prompt

1.1) add new building to the game using this asset (/images/map/buildings/shipyard_map.webp) so that user can build a ship yard on the edge of water and land so that the water part of the image (analyse the image for that) is connected to water on the map. implement all required features of that building so that it seamlessly integrates the game logic and balancing and also its visuals. ship yard requires radar station and weapon factory

1.2) In the image there is also a ship displayed. it is a destroyer. I want you to also implement a destroyer unit that looks like the one on the image. make a plan of what you need to do to implement the yard and the destroyer. You can come up with all the logic and stats, the behaviour yourself. Make it realistic and look like it was done for other units in the game but the destroyer unit will be the first water unit of the game. other water units will be implemented later so make sure to build the groundwork for other water units so code parts can be reused later for that. also make some wave animation behind the ship when it is moving. Destroyer can fire gun at other ships but also at ground units and it can fire missles at airborne targets.

2) Before you start write a skill file into the repo that contains a checklist of what needs to be done to build a new unit in general and another skill file that describes how to build a ship unit in particular. Here are some things you need to keep in mind but not limited to this list when building new units (cheat integration, repairability, fuel, health (depletion and refill), ammo (depletion and refill), HUD on selection, path planning (different for air units from water units and from ground units!) weapon range, reload time, firepower, sound, rotation animation, speed of movement, collision detection, crew, tech tree, cost, destroy animation (for ships I want some fancy animation where ship breaks in two pieces after an explosion and each one sinks down to the water).
