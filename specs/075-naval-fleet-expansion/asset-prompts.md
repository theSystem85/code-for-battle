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

## 2026-07-25 battleship correction prompts

The correction used built-in image generation in precise-object-edit mode. The existing battleship map image was the map edit target. The existing battleship sidebar image was the sidebar edit target, and the corrected map source was a supporting turret-layout reference.

### Corrected map prompt

> Use case: precise-object-edit. Asset type: top-down RTS map unit sprite source. Image 1 is the edit target and exact style, silhouette, materials, lighting, scale, and perspective reference. Change only the battleship's main gun configuration. The finished ship must have exactly four main turrets total: exactly two turrets on the forward/bow half and exactly two turrets on the rear/stern half. Every one of the four turrets must have exactly two clearly separated gun barrels, never three. Use a perfectly flat solid #00ff00 chroma-key background for local background removal. Preserve the existing realistic, weathered gray naval RTS sprite style, strict vertical top-down orthographic perspective, centered south-facing ship, full hull silhouette, proportions, padding, deck equipment, shading, wear, palette, and camera angle. The four mounts must be visually distinct enough to click separately. No additional main turrets, ocean, wake, scene elements, shadow, text, watermark, cropping, triple-barrel turret, or angled/isometric perspective.

The accepted source was alpha-matted with border auto-key sampling, soft matte, thresholds 12/80, and despill, then resized and encoded as 256×256 WebP with alpha quality 100 and image quality 90.

### Corrected sidebar prompt

> Use case: precise-object-edit. Asset type: RTS sidebar production/build image. Image 1 is the edit target and exact cinematic ocean style, lighting, framing, ship identity, and elevated three-quarter perspective reference. Image 2 is the authoritative battleship turret-layout reference: exactly four main mounts, each with exactly two barrels. Replace only the main-gun arrangement in Image 1 so this same battleship visibly carries exactly four main turrets total: exactly two on the forward/bow section and exactly two on the aft/stern section. Every turret must have exactly two clearly visible gun barrels. Preserve Image 1's cool gray open ocean, cloudy daylight, horizon, subtle wake, cinematic atmosphere, full-vessel framing, square crop, scale, high three-quarter viewpoint, hull, superstructure, radar/masts, deck material, palette, lighting, and identity. Make all four mounts unambiguous. No triple-barrel turret, fifth turret, hidden mount, changed camera/weather, extra ship, text, insignia, UI, border, or watermark.

The accepted source was resized and encoded as 512×512 WebP at image quality 90.

## 2026-07-25 layered battleship map assets

Generation mode: built-in `imagegen`, using the corrected four-turret battleship map sprite as the exact visual reference. Each accepted output was generated on a flat chroma-green background, alpha-matted using border auto-key sampling with a soft 12/80 threshold, 0.5 px feathering, and despill, then encoded as WebP with alpha quality 100 and image quality 90. The hull remains 256×256; the trimmed turret housing is 127×128; the trimmed single barrel is 20×128.

### Turretless hull prompt

> Use case: precise-object-edit. Create a production-ready strict orthographic top-down RTS map sprite source. The attached image is the exact battleship edit target and authoritative reference for hull silhouette, deck geometry, center control tower, materials, weathering, cool gray palette, south-facing orientation, lighting, scale, padding, and camera. Remove all four main turrets and all eight gun barrels only. In their exact former positions, reveal exactly four clean, dark, circular armored turret wells/socket holes integrated into the deck: exactly two forward of the central control tower and exactly two aft. Keep every other part of the battleship unchanged. Center the complete vessel on a perfectly flat uniform vivid #00ff00 chroma-key background, with generous unchanged margin. No ocean, wake, external shadow, extra objects, text, watermark, cropping, remaining turret, remaining barrel, or perspective change.

### Turret-housing prompt

> Use case: reference-guided isolated game asset. Create exactly one battleship main-turret HOUSING sprite matching the attached battleship's strict top-down realistic weathered gray naval RTS style, material, lighting, and detail. The housing is viewed in exact orthographic top-down view, centered, with its front/muzzle side pointing due south. It must contain the armored rotating turret body and two subtle barrel mounting sockets, but absolutely no gun barrels or protruding guns. Show no hull, deck, ship, water, wake, shadow, text, insignia, border, extra object, or second turret. Preserve a compact circular/rounded armored base appropriate to fit one of the attached ship's four turret wells. Use a perfectly flat uniform vivid #00ff00 chroma-key background with generous margin. Square composition, production-ready isolated sprite.

### Single-barrel prompt

> Use case: reference-guided isolated game asset. Create exactly one single heavy battleship main-gun BARREL sprite matching the attached battleship's strict top-down realistic weathered gray naval RTS style, material, scale language, and lighting. Exact orthographic top-down view. The barrel points due south: its breech/mount connector is centered near the upper part and its long cylindrical muzzle extends downward. Include only one individual metal gun barrel and its compact breech connector, suitable for placing twice into the sockets of a separate turret housing. Absolutely no second barrel, no turret housing, no circular turret base, no hull, deck, ship, water, wake, shadow, text, insignia, border, or extra object. Use a perfectly flat uniform vivid #00ff00 chroma-key background with generous margin. Square composition, production-ready isolated sprite.
