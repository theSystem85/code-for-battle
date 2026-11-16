# Fire engine and fire department artwork prompts (2026-11-16)

Four images, replacing the authored concept art. References passed to the generator: existing project sprites (`recovery_tank.webp`, `ambulance.webp`, `vehicle_workshop.webp`, `hospital.webp` and their sidebar photos).

| asset | takes | kept | notes |
| --- | --- | --- | --- |
| `public/images/map/units/fire_engine.webp` (192x192 RGBA, q95) | 2 | take 2 | Take 1 had a concept-art-like cab with no windshield; take 2 has glass, grille, headlights and light bar. Both are strict top-down, south-facing, but long and narrow (about 1:2.4), so the sprite is about 11x28 logical px. |
| `public/images/map/buildings/fire_department.webp` (384x384 RGBA, q85) | 1 | take 1 | Isometric-like 3D station with four red bay doors, concrete apron with yellow parking-bay lines, hose tower; same style as `vehicle_workshop.webp`. |
| `public/images/sidebar/fire_engine.webp` (256x256, q85) | 1 | take 1 | Elevated three-quarter desert photo, horizon at about 42% height. |
| `public/images/sidebar/fire_department.webp` (256x256, q85) | 1 | take 1 | Elevated aerial desert photo with a parked engine, horizon at about 25% height. |

Processing: background removed by an edge flood fill on the near-flat generator background colour (Python/SciPy), soft edge alpha with background un-mixing, green despill, bbox crop, premultiplied-alpha Lanczos downscale with a mild unsharp mask (radius 0.8, 55%), centred in a square canvas (engine 176 px tall in 192; building 376 px wide in 384).

## Prompts (abridged)

- Engine map take 2: "compact military crash-tender fire truck in strictly top-down orthographic 90-degree overhead view ... faces straight DOWN (south) ... glossy fire-engine red, white stripes, blue light bar, roof water cannon turret ... flat solid chroma-key green background".
- Department map: "Fire Department station in the same isometric-like 3D render style as the reference vehicle workshop and hospital sprites ... four wide red roll-up garage doors ... concrete apron with painted yellow parking-bay lines ... 3x3 footprint ... flat chroma-key green background".
- Sidebar engine: "photorealistic build-button image of a modern red fire engine ... elevated three-quarter front view ... desert horizon in the second quarter from the top".
- Sidebar department: "photorealistic build-button image of a modern fire department station in a desert base ... elevated three-quarter aerial view ... horizon in the second quarter from the top".
