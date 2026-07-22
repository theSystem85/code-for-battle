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
- Deck capacity is shared as four slots: each F22 uses one slot and each F35 or Apache uses two slots, allowing up to four F22 or two F35/Apache aircraft (and valid mixed combinations within four slots).
- F22 aircraft use serialized deck takeoff/landing phases analogous to the Airstrip runway lifecycle, but with carrier-local rotating deck points and motion matched to the carrier footprint.
- F35 and Apache use carrier deck VTOL landing/takeoff behavior.
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

- Select one or more friendly ground vehicles and click a Hovercraft/Vehicle Ferry, or select the transport and click a ground vehicle. The transport moves to the closest navigable coast while queued vehicles move to shoreline rendezvous tiles; loading completes automatically in range. Click a valid land destination with the loaded transport selected to approach the nearest coast, disembark, and send its cargo onward to that destination.
- Direct clicks on friendly transports, cargo, or carriers resolve valid boarding/recovery commands before ordinary friendly-unit selection or guard behavior. Guard assignment for an unmodified friendly target remains available through an AGF box around that target rather than taking precedence over a direct click.
- Clicking a valid land destination with a loaded Hovercraft/Vehicle Ferry sends the ship to the nearest water approach, places cargo on free shoreline tiles using center-based occupancy, and then orders every unloaded unit to move to the originally clicked land tile.
- Hovering either side of a valid vehicle/transport boarding interaction displays the move-into cursor. A selected transport's bottom HUD loading bar reports its occupied capacity and shows a type-count cargo manifest on hover.
- Select an airborne F22/F35/Apache and click a friendly Aircraft Carrier to recover it; select a parked aircraft and click a destination or enemy to launch it. Hovering a carrier shows move-into while enough weighted deck capacity remains and move-blocked when full. Approaching aircraft reserve their deck capacity immediately.
- Ship bow wakes originate six pixels beyond the calculated hull endpoint. Submerged submarines emit no wakes and clear any of their still-active wake particles.
- Select the Naval Mine Layer and force-attack a water tile to deploy a mine. Targeting an occupied water-mine tile switches the same ship into safe clearing mode.
- Select the Battleship hull to assign both batteries, or click its fore/aft hull region to select and retarget only that battery.
- Order a Submarine against an enemy ship to begin its timed surfacing sequence and torpedo attack. It automatically submerges after disengaging; nearby enemy Destroyers automatically release delayed depth charges against detected submerged contacts.

## Verification record

- Added focused naval, cursor, and HUD renderer coverage for balance ratios, bidirectional shoreline transport orders, cargo manifests, weighted F22/F35/Apache carrier reservations, independent battery targets, surfacing/torpedo gating, wake placement/suppression, depth charges, and naval mines.
- `npm run lint:fix:changed`: pass.
- `npm run test:unit`: 150 files and 3,767 tests passed.
- `npx vite build`: pass (existing bundle-size/dynamic-import warnings only).
