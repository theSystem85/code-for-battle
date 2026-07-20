# Naval Fleet Asset Generation Prompts

Generation mode: built-in `imagegen`. The existing Destroyer map/sidebar art was supplied as the visual reference. Map outputs were chroma-keyed, alpha-matted, despilled, and converted to 256×256 WebP; sidebar outputs were converted to 512×512 WebP.

## Exact map prompt set

Each map prompt was the following shared prompt plus its unit clause:

> Create one strict orthographic top-down RTS map sprite of the specified modern naval unit, centered and fully visible with generous margin, bow pointing due south, no perspective or horizon, no wake, no water, no shadow outside the hull, no text, no border, and no extra objects. Match the attached Destroyer sprite's realistic military materials, lighting, detail density, and game-art language. Use a perfectly flat, uniform vivid chroma-green background (#00ff00) for clean removal. Square composition.

- Hovercraft: `A compact military vehicle hovercraft with a broad bow loading ramp, visible air cushion skirt, and an open deck sized for four vehicles; agile and lightly armored.`
- Vehicle Ferry: `A rugged military vehicle ferry with a wide reinforced roll-on/roll-off deck and ramps, visibly larger and heavier than the hovercraft, sized for ten vehicles.`
- Aircraft Carrier: `A modern fleet aircraft carrier with a long unobstructed flight deck, runway markings, island superstructure, elevators, and defensive details; visually 2.4 times the attached Destroyer's hull length.`
- Naval Mine Layer: `A modern naval mine-layer and mine-countermeasure ship with aft mine rails, deck cranes, sweep gear, sonar equipment, and a compact military hull.`
- Battleship: `A modernized battleship with four distinct heavy twin-gun mounts grouped as two fore and two aft, armored superstructure, radar, and missile-defense details.`
- Submarine: `A modern attack submarine surfaced for identification, with streamlined dark hull, sail, control planes, subtle torpedo-door details, and no weapons firing.`

## Exact sidebar prompt set

Each sidebar prompt was the following shared prompt plus its unit clause:

> Create a square photorealistic RTS production-button image of the specified modern naval unit at sea. Show the complete vessel in an elevated three-quarter view, bow clearly readable, with realistic scale, military materials, calm-to-moderate ocean, subtle wake, daylight, and the horizon around the second quarter from the top. Match the attached Destroyer sidebar art's cinematic realism, contrast, framing, and cool naval palette. No text, insignia, UI, border, people, or extra focal vessels.

- Hovercraft: `Fast lightly armored military hovercraft carrying four representative vehicles on its open deck.`
- Vehicle Ferry: `Large armored military roll-on/roll-off ferry carrying ten representative vehicles with reinforced ramps and deck structure.`
- Aircraft Carrier: `Modern fleet aircraft carrier with a populated but orderly deck showing representative F22 and F35 aircraft and realistic capital-ship proportions.`
- Naval Mine Layer: `Modern mine-layer/mine-countermeasure vessel with visible aft mine rails, sweep gear, cranes, and sonar equipment.`
- Battleship: `Modernized battleship prominently showing two heavy fore mounts and two heavy aft mounts, with imposing armor and radar systems.`
- Submarine: `Modern attack submarine running surfaced through the ocean, with a dark streamlined hull and prominent sail.`
