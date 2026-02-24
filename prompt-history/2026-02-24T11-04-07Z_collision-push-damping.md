# Prompt History
- UTC: 2026-02-24T11:04:07Z
- LLM: codex

## Prompt
currently units when moving on the ground get pushed away by physics engine when coming too close to a wall. This push is currently implemented so that the push is very strong. Ensure it is depending on the speed of the moving unit and add some damping to it. Also ensure that the push is only applied when the unit is already more than 25% into the obstacle NOT just when it barely it the wall! Ensure to not use the occupancy tile of the unit itself but the real non transparent part of the bounding box. Determine all units bounding boxes based on the non transparent pixels before the game starts and cache it. Also write a script that can do this so it can be done when the game is build before to have that work shifted out of each running game instance to be done at "build" time. so the game engine can pick up the bounding box results when from a JSON file on load if the file is present.
