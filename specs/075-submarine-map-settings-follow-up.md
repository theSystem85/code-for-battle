# 075 - Submarine targeting and map settings follow-up

- Defense buildings must never acquire, track, queue-promote, or fire at submarines while their `depthState` is not `surfaced`.
- Submarines may target enemy yards, specifically Construction Yards and Shipyards, in addition to naval units.
- Submarine torpedoes fired at yards must use strict target collision so they do not damage unrelated buildings along the path.
- Map width and height labels in Map Settings must include the current real-world size in kilometers, using 10 meters per tile (100 tiles = 1 km).
- Map Settings must show a minimum estimated save-memory footprint for the current dimensions below the dimension inputs, explicitly excluding units and decals.
