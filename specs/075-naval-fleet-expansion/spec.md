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
- Each of the four twin-barrel turrets can retain and fire on a different legal target simultaneously.
- The ship hull and each turret are independently selectable. Commands to a selected turret set only that turret's target; commands to the selected hull assign the same target to all four turrets.
- Turret origins rotate with the hull, fire two ballistic shells per salvo, and keep independent target, direction, cooldown, enabled, and selection state.
- Falling below 80%, 60%, 40%, and 20% hull HP disables one deterministic-random remaining turret at each threshold and spawns an explosion at that turret. Disabled turrets cannot be selected or fired and render a persistent destroyed marker.
- Repairing the hull above those thresholds re-enables turrets in reverse destruction order until all four are operational above 80% HP.
- Four-turret targets, damage order, enabled state, and selected-turret commands persist through save/load, replay, and multiplayer state/command synchronization.
- The battleship map presentation is layered from a turretless hull with four visible empty wells, four independently rotated turret housings, and two independently rendered barrels per turret. Each complete turret housing/barrel assembly renders at 70% of its prior size. Outer mounts render before their inner counterparts so overlapping inner turrets sit visually on top and read as higher-mounted. Destroyed mounts omit both turret and barrels so the corresponding well remains exposed.
- Each barrel recoils independently and emits its own muzzle flash. The two barrels in a turret fire 300 ms apart, consecutive turrets begin 1 second apart, and a hull-issued broadside begins a new cycle no sooner than 8 seconds after the preceding cycle began.
- A hull-issued target makes the battleship turn the nearer side toward that target before firing. Each mount refuses shots whose line crosses the central control-tower exclusion cone, and selection visualization distinguishes its available firing arc from the blocked tower arc.
- A move command or live remote-control helm input temporarily owns the hull without clearing any marked battleship target. While underway, every turret keeps tracking its assigned target and only fires when its current hull-relative line is in range, aimed, and outside the control-tower exclusion cone. Automatic side-on alignment resumes once the helm has no path or remote input to follow.
- The S stop command is a hard cease-fire for a selected battleship: it clears the hull target, all four turret target locks, and every pending barrel/turret salvo so no delayed shot can escape after the command.
- Battleship heavy-gun range is 150% of its original value.
- Battleship turret hydration is a one-time migration step: subsequent simulation ticks preserve the battery object, turret objects, recoil arrays, and muzzle-flash arrays by identity instead of generating garbage every frame.
- All active battleships share one reusable per-frame target index, and target-free ships skip target indexing/resolution entirely; turret tracking must not perform nested linear unit/building scans.
- The selected battleship range indicator is boundary-only. It performs no full-range translucent fill or dashed full-circle rasterization and is culled when its perimeter lies completely outside the viewport.

## Naval target and sinking rules

- Surface ships can attack enemy land units and buildings whenever their normal weapon range and line-of-fire rules permit.
- Submarines can attack naval units and enemy partly-water buildings such as the Shipyard, but no wholly land-based unit or building.
- Every sinking naval wreck selects exactly one deterministic-random initial descent side—front, back, left, or right—with equal 25% probability—and animates the hull disappearing from that side.

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
- Under the focused six-times CPU-throttled browser benchmark, one selected layered battleship must retain at least 80% of the same scene's baseline FPS; the benchmark command is `PERF_BATTLESHIP_RENDER=1 PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/battleshipPerformance.test.js --project=chromium --reporter=line`.
- The entire required unit test command (`npm run test:unit`) passes, and changed-file lint (`npm run lint:fix:changed`) completes without errors.

## Implemented command model

- Select one or more friendly ground vehicles and click a Hovercraft/Vehicle Ferry, or select the transport and click a ground vehicle. The transport moves to the closest navigable coast while queued vehicles move to shoreline rendezvous tiles; loading completes automatically in range. Click a valid land destination with the loaded transport selected to approach the nearest coast, disembark, and send its cargo onward to that destination.
- Direct clicks on friendly transports, cargo, or carriers resolve valid boarding/recovery commands before ordinary friendly-unit selection or guard behavior. Guard assignment for an unmodified friendly target remains available through an AGF box around that target rather than taking precedence over a direct click.
- Clicking a valid land destination with a loaded Hovercraft/Vehicle Ferry sends the ship to the nearest water approach, places cargo on free shoreline tiles using center-based occupancy, and then orders every unloaded unit to move to the originally clicked land tile.
- Hovering either side of a valid vehicle/transport boarding interaction displays the move-into cursor. A selected transport's bottom HUD loading bar reports its occupied capacity and shows a type-count cargo manifest on hover.
- Select an airborne F22/F35/Apache and click a friendly Aircraft Carrier to recover it; select a parked aircraft and click a destination or enemy to launch it. Hovering a carrier shows move-into while enough weighted deck capacity remains and move-blocked when full. Approaching aircraft reserve their deck capacity immediately.
- Ship bow wakes originate six pixels beyond the calculated hull endpoint. Submerged submarines emit no wakes and clear any of their still-active wake particles.
- Select the Naval Mine Layer and force-attack a water tile to deploy a mine. Targeting an occupied water-mine tile switches the same ship into safe clearing mode.
- Select the Battleship hull to assign all four turrets, or click one of its four turret rings to select and retarget only that mount.
- Order a Submarine against an enemy ship to begin its timed surfacing sequence and torpedo attack. It automatically submerges after disengaging; nearby enemy Destroyers automatically release delayed depth charges against detected submerged contacts.

## Verification record

- Added focused naval, cursor, and HUD renderer coverage for balance ratios, bidirectional shoreline transport orders, cargo manifests, weighted F22/F35/Apache carrier reservations, independent battery targets, surfacing/torpedo gating, wake placement/suppression, depth charges, and naval mines.
- Added four-turret battleship coverage for independent mount selection/targeting/firing, hull-wide target assignment, deterministic-random threshold destruction, turret-local explosion effects, reverse repair restoration, save serialization, and multiplayer command payloads.
- Added layered-battleship coverage for per-barrel/per-turret salvo timing, the 8-second global reload, broadside hull alignment, tower-blocked arcs, 50%-expanded range, saved transient salvo state, surface fire against land buildings, submarine Shipyard targeting, and four equal directional sinking modes.
- Added mobile-engagement regression coverage proving move orders retain battleship fire control, remote helm input overrides automatic hull alignment, blocked aft mounts stay out of a forward salvo, and S clears all four targets plus pending barrels across local, replay, and multiplayer stop paths.
- Added battleship performance contracts for stable hot-loop turret identity, viewport-culled boundary-only range rendering, and a live selected-layer benchmark. The final run held the normal 60 FPS cap (59.65 baseline versus 60.14 selected) and retained 80.7% under 6× CPU throttling (27.51 baseline versus 22.20 selected), clearing the 80% regression budget.
- The 2026-07-26 70%-scale/inner-overlap turret follow-up retained 94.1% under the same 6× CPU-throttled benchmark (28.19 baseline versus 26.53 selected), clearing the 80% regression budget without adding draw calls or per-frame allocations.
- Runtime visual QA confirmed the generated hull, housing, and barrel layers align at all four wells, hull/turret selection renders the expected free/blocked arcs, individual turret selection is unambiguous, and the browser console remains clear.
- `npm run lint:fix:changed`: pass.
- `npm run test:unit`: 152 files and 3,810 tests passed.
- `npx vite build`: pass (existing bundle-size/dynamic-import warnings only).
