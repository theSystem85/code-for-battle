# Six-Ship Naval Fleet Expansion

## Scope

Add six Shipyard-produced naval units and integrate them with production, prerequisites, player and AI commands, water pathfinding, selection/HUD, combat, service logistics, save/load, multiplayer/replay state, cheats, rendering, fog-of-war, destruction, and unit tests.

## Shared naval requirements

- Every new ship is classified as naval, spawns from a Shipyard water launch tile, follows open-water pathfinding, accepts water-only rally points, uses rotated strict top-down map art, renders wakes while moving, and uses naval sinking destruction.
- New build buttons use generated sidebar art in `public/images/sidebar`; map sprites live in `public/images/map/units`.
- The built-in image generation mode, reference treatment, and exact composed prompt set are recorded in `asset-prompts.md`.
- Production values and prerequisites are exposed through the existing unit/building configuration paths and included in AI/remote-control/exported tech-tree data.
- Save/load, replay, multiplayer hashing/state sync, cheats, selection, minimap, shadow-of-war, HUD, sounds, combat eligibility, veterancy, crew, fuel, ammunition, and repair/refill systems preserve each unit's special state.
- All transported units are removed from normal map collision/targeting/rendering while embarked and restored only onto valid terrain when unloaded. Destroying a loaded transport destroys its cargo.

## Hovercraft

- Fast, lightly armored amphibious vehicle transport with capacity for four land vehicles.
- Loads friendly vehicles by command at shoreline-accessible range and unloads them onto valid unoccupied land near a selected coast destination.
- Uses water pathing while afloat; it does not act as a combat ship.

## Vehicle Ferry

- Slower and more heavily armored than the Hovercraft, with capacity for ten land vehicles.
- Uses the same explicit load/unload lifecycle and safe shoreline placement rules.

## Aircraft Carrier

- Large naval airbase with a realistic visual length ratio to the existing Destroyer (approximately 2.4× its rendered hull length).
- Deck capacity is shared as four slots: each F22 uses one slot and each F35 uses two slots, allowing up to four F22 or two F35 (and valid mixed combinations within four slots).
- F22 aircraft use serialized deck takeoff/landing phases analogous to the Airstrip runway lifecycle, but with carrier-local rotating deck points and motion matched to the carrier footprint.
- F35 uses carrier deck VTOL landing/takeoff behavior.
- Parked aircraft refill fuel and ammunition from carrier stores; the carrier never repairs aircraft HP.
- Carrier stores refill through existing friendly naval/Shipyard supply sources and are represented in HUD/tooltips.

## Naval Mine Layer

- Deploys water mines on water tiles and safely clears water mines while in sweep mode.
- Water mines reuse owner/arming/chain-reaction concepts from land mines but are separate entities with a larger center-distance trigger radius and larger radial damage radius.
- Water mines only trigger from naval units, block friendly naval routing once armed, and never affect land units solely because their blast overlaps coast terrain.
- Deployment, clearing, ammo payload, area command planning, persistence, rendering, and AI behavior parallel the existing land Mine Layer/Sweeper flow where applicable.

## Battleship

- Heavy armored combat ship with four long-range heavy-gun mounts: two fore and two aft.
- Fore and aft batteries can retain and fire on different legal targets simultaneously.
- The ship body and each battery are independently selectable; commands to a selected battery set only that battery's target, while commands to the selected hull set both batteries.
- Gun origins rotate with the hull, fire broad ballistic shells, use independent cooldown/ammo state, and remain constrained by each battery's firing arc.

## Submarine and Destroyer depth charges

- The Submarine only attacks naval units with torpedoes and must complete a gradual surfacing/reveal transition before it can fire.
- A surfaced Submarine is normally visible and targetable. A submerged Submarine moves invisibly to enemies, is untargetable by normal weapons, and renders at 30% opacity only to its owner.
- Enemy units gain close-range contact detection of a submerged Submarine; detection allows only Destroyers to attack it using newly implemented depth charges.
- Depth charges use a short delayed underwater-area detonation and cannot target normal surfaced ships as their special anti-submarine attack.
- Surfacing is visually the reverse of naval sinking: a slow clip/opacity reveal. Submerging uses the inverse transition and clears invalid target locks.
- Detection, visibility, attackability, transition progress, torpedoes, and depth-charge state are deterministic and persisted/synchronized.

## Balancing and verification targets

- Transport speed/armor/capacity relationships match their descriptions; carrier/battleship are expensive capital ships; mine layer and submarine are specialist vessels.
- Carrier scale and deck transforms remain correct for every heading.
- The entire required unit test command (`npm run test:unit`) passes, and changed-file lint (`npm run lint:fix:changed`) completes without errors.

## Implemented command model

- Select a Hovercraft or Vehicle Ferry and click a friendly land vehicle to load it; click an empty coastal land destination to unload all cargo onto nearby valid tiles.
- Select an airborne F22/F35 and click a friendly Aircraft Carrier to recover it; select a parked aircraft and click a destination or enemy to launch it. Approaching aircraft reserve their weighted deck capacity immediately.
- Select the Naval Mine Layer and force-attack a water tile to deploy a mine. Targeting an occupied water-mine tile switches the same ship into safe clearing mode.
- Select the Battleship hull to assign both batteries, or click its fore/aft hull region to select and retarget only that battery.
- Order a Submarine against an enemy ship to begin its timed surfacing sequence and torpedo attack. It automatically submerges after disengaging; nearby enemy Destroyers automatically release delayed depth charges against detected submerged contacts.

## Verification record

- Added `tests/unit/navalFleetSystem.test.js` with focused coverage for balance ratios, shoreline transport orders, weighted carrier reservations, independent battery targets, surfacing/torpedo gating, depth charges, and naval mines.
- `npm run lint:fix:changed`: pass.
- `npm run test:unit`: 150 files and 3,758 tests passed.
- `npm run build`: pass (existing bundle-size/dynamic-import warnings only).
