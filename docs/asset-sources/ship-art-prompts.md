# Ship art overhaul: Grok Imagine prompts

Sources (1280x720 JPEG, flat blue background, ship horizontal, bow pointing right), generated with Grok Imagine and processed by `ship-build-assets.py`:

| Source | Used for |
| --- | --- |
| `ship-destroyer-source.jpg` | `destroyer_map.webp` |
| `ship-battleship-hull-source.jpg` | `battleship_map.webp` (empty barbette rings) |
| `ship-battleship-turret-barrel-source.jpg` | `battleship_turret.webp`, `battleship_barrel.webp` |
| `ship-aircraft-carrier-source.jpg` | `aircraft_carrier_map.webp` (mirrored so the island is on the port side) |

The original prompt text lived in the preparation agent's transcript, which was not readable when the assets were integrated. The prompts below are reconstructed from that brief and from the generated images and are the template to use for future ships.

Shared style: "Top-down orthographic view, straight down, of a modern naval warship for a real-time strategy game map sprite. Photorealistic, crisp detail, neutral daylight, soft contact shadows only, no water, no wake, no text, no logos. The ship lies horizontally, centred, filling most of the frame width, bow (pointed end) to the right. Plain flat saturated blue background (#0078ff) for chroma keying."

- **Destroyer:** "...an Arleigh-Burke-like guided missile destroyer in naval grey: helicopter deck with landing circle at the stern, two vertical launch cell blocks, a compact superstructure with radar mast, and a single 5-inch gun turret on the foredeck near the bow."
- **Battleship hull:** "...a Bismarck-class battleship hull in naval grey with a teak wooden main deck and the central superstructure with one funnel. The main gun turrets are removed: show four empty circular barbette rings on the centreline, two forward and two aft of the superstructure, symmetric, nothing inside the rings."
- **Battleship turret and barrel:** "...on the left, a single Bismarck-class twin main gun turret seen from above, grey armour plates, front facing down with two gun ports along the front edge; on the right, one separate long gun barrel, vertical, muzzle at the bottom."
- **Aircraft carrier:** "...a Nimitz/Ford-like aircraft carrier in naval grey with an empty flight deck (no aircraft), angled landing deck markings, catapult tracks and the island superstructure on the lower edge of the deck."

Map sprites use one plain paint scheme, no camouflage.
