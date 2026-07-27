# Naval, carrier, AI, and map settings follow-up

## Implemented in this pass
- Ferry/hovercraft cargo HUD tooltip lists each loaded unit type/count on its own line.
- Shipyards may be placed against north, south, west, or east shorelines when the water half of the footprint overlaps water and the land half overlaps land.
- Map settings expose a start-money input; new games apply the sanitized value to the human money pool and each construction yard budget.
- Non-submarine ship sprites render 50% larger, while submarines keep their previous stealth/readability size.
- F22 and F35 sprites render at 75% scale while landed on a carrier or Airstrip, interpolating to full size with altitude during landing and takeoff.
- Loaded ferries show move-into cursor feedback over valid land disembark targets.

## Implemented clustered continuation (2026-07-22)

### Cluster A — shoreline transport operations
- A transport that reaches its shoreline rendezvous must clear its navigation target and settle before alignment, preventing path recreation and rapid back-and-forth movement.
- During embark/disembark, the transport rotates with eased motion until its stern faces the shore; cargo transfer starts only after position, speed, and heading are within tolerance.
- Cargo remains visibly rendered while tweening between its shoreline slot and the stern/ramp. Cargo transfers sequentially, and both the ship and currently transferring unit reject movement commands until the operation finishes.
- Disembarked cargo receives the original clicked land destination only after its transfer animation completes and uses center-based tile assignment/occupancy.

### Cluster B — carrier deck operations
- Carrier landing, runway roll, deck taxi, launch taxi, and takeoff use eased interpolation with continuous stage endpoints.
- Fixed-wing aircraft taxi between the runway and assigned parking slot rather than snapping; carrier-relative points are recomputed throughout an operation so a moving/rotating deck does not create discontinuities.
- VTOL aircraft retain vertical recovery/launch behavior with eased altitude and position changes.

### Cluster C — naval motion and collision
- Ships ease into/out of translation and rotation, brake ahead of their final waypoint, and fully settle at the destination.
- Collision uses the existing spatial quadtree for neighbor discovery, then tests oriented hull/capsule footprints instead of a single generic unit radius.
- Naval shoreline collision samples the oriented hull footprint (bow, stern, and side extents), keeping the rendered image over water without scanning all map tiles or all units.
- Center-based `tileX`/`tileY` assignment remains mandatory, and a ship must never block against its own occupancy tile.

### Cluster D — enemy naval strategy and logistics
- Each AI party receives one persisted 50/50 `naval-first` or `air-first` advanced-force preference; building and unit prerequisites follow that ordering without blocking the alternate branch.
- Combat ships actively acquire reachable enemy ships/buildings and retaliate against valid attackers.
- Depleted/damaged/under-crewed ships seek an available supply ship when it has the needed cargo, otherwise they return to a Shipyard service area; after recovery they resume their saved combat target.
- AI supply ships avoid combat targeting, deploy to service needy fleet members, and return to a Shipyard when their relevant stores are depleted.

## Verification

- Transport regression coverage verifies alignment precedes transfer, cargo remains visible while moving on/off the ramp, unloading preserves center-based occupancy, and the ferry clears its movement target at the coast.
- Carrier regression coverage verifies fixed-wing launch taxi remains grounded, takeoff gains altitude smoothly, and destination handoff happens only after launch completion.
- Naval collision coverage verifies oriented parallel hull overlap and carrier bow/shore overlap through quadtree-backed candidate checks.
- AI coverage verifies persisted 50/50 preferences, both advanced-force sequences, active water attack routing, supply-ship deployment, depleted-ship recovery, and target resumption.

## 2026-07-23 rotation/wake correction

- Naval heading interpolation must use a signed shortest-angle delta and clamp at the target heading, preventing overshoot or endless one-direction rotation.
- When a ship has no remaining path, residual angular velocity must be cleared immediately so its rendered heading remains stable.
- A rotating ship emits expanding circular disturbance rings centered on its hull. Existing bow/stern V-wakes from that ship are removed when rotation starts, and no new V-wakes are emitted until rotation ends.
- Rotation rings persist only for their short lifetime and fade smoothly to transparent.

## 2026-07-23 modular AI, aircraft scale, and hull-aware boarding

- The classic enemy unit behavior entry point remains compatible, but implementation is divided into core dispatch, shared helpers, replay capture, naval, air, support, ground-decision, and ground-tactics modules. No resulting enemy behavior module may exceed 500 lines.
- Carrier parking slots use the opposite lateral side of the flight deck from the previous layout while retaining carrier-relative rotation and translation.
- A jet associated with a carrier or Airstrip renders at 75% of its normal size at zero altitude and interpolates continuously to 100% at maximum altitude. Landing shrinks and takeoff grows without an instantaneous scale transition.
- Boarding chooses a specific passable coastal land tile with an orthogonally adjacent water edge. Cargo receives ordinary land pathfinding destinations around that tile, while the transport navigates to the water-side center required by its rendered non-transparent hull length.
- The transport's desired center is calculated from the shoreline contact point plus half the rendered hull length along the outward shore normal. Transfer cannot begin until the exact stern point and shoreline contact coincide within tolerance and the bow faces away from land.
- After cargo reaches its assigned land slot, it becomes command-locked, rotates toward the stern/ramp, and only then begins the visible loading tween so the sprite never drifts sideways onto the ship.
- Transport and cargo tile coordinates remain center-based throughout fine alignment and transfer.

## 2026-07-23 carrier strike and direct naval control follow-up

### Map settings layout
- The start-money input shares a dedicated row with the SSE biome selector. Each control occupies 50% of the available row width and remains usable when the sidebar narrows.

### Carrier recovery and launch choreography
- An F35 reserves an empty deck slot before recovery, flies level to that exact carrier-relative parking coordinate, and only then begins vertical descent. Its touchdown coordinate and final parked coordinate are identical.
- An F22 may enter final carrier approach only after reaching the fourteen-tile astern staging point while the carrier has no route or meaningful linear speed. It descends on the inbound leg, reaches deck-entry altitude at the rear runway threshold, rolls forward to touchdown, and turns while taxiing to parking instead of sliding sideways.
- Fixed-wing launches taxi with normal heading changes to the extreme rear runway threshold, remain grounded throughout taxi, and then accelerate along the full carrier runway while altitude and render scale increase continuously.
- Carrier-relative parking, runway, and approach points are recomputed throughout each operation so a valid stationary-deck operation has no stage-boundary teleport.

### Direct naval control and shoreline response
- Every naval unit accepts forward/reverse on Up/Down and eased left/right steering with retained angular inertia. Releasing movement input decelerates through the normal movement system rather than stopping instantaneously.
- Space fires the forward weapon on armed ships; unarmed transports/support ships remain fully steerable without fabricating weapons.
- After rotation, an oriented hull that intersects land is moved to the nearest clear-water position by a bounded local search. The expensive search only runs after a cheap hull-overlap probe reports a shoreline intersection, and center-based tile coordinates are updated after correction.

### Carrier strike missions
- An attack command never moves or turns an Aircraft Carrier. It stores one or more marked targets and launches every serviced deck aircraft against the active target.
- Carrier aircraft retain their originating carrier identifier after launch. Empty aircraft return to that carrier rather than an Airstrip, rearm on deck, relaunch automatically, and repeat until every stored target is destroyed.
- Shift/Alt-appended carrier targets extend the carrier mission target list without routing the carrier itself into the ordinary attack queue.

## 2026-07-27 F22 carrier mission and naval control correction

- F22 rocket damage is approximately 50% higher than the prior F22 damage while preserving the existing projectile and splash behavior.
- A carrier-deck F22 launched by an ordinary move command is not enrolled in a carrier strike mission. After takeoff it flies to the commanded tile and continuously circles that location until a later command replaces the assignment.
- A carrier attack command enrolls and launches every living carrier aircraft with usable ammunition, including a partially loaded F22. An aircraft returns to its originating carrier when its assigned mission target is destroyed or its ammunition is exhausted. Aircraft returning empty must complete rearming before automatic relaunch.
- Fixed-wing carrier recovery first establishes an approach point fourteen tiles astern. The F22 then descends continuously on the inbound leg and reaches deck-entry altitude at the rear runway threshold before beginning its landing roll.
- Direct-control naval throttle uses the same top-speed cap as autonomous naval path movement, with the same health speed modifier, for all ship classes.

### Acceptance coverage

- Unit coverage verifies F22 damage, ordinary carrier launch/orbit persistence, partial-ammunition strike launch, destroyed-target and empty-ammunition recovery, long astern descent geometry, and direct-control naval speed parity.
- Since carrier and remote-control state update once per simulation tick, the implementation may add scalar state and arithmetic only; it must not add per-frame collections or entity scans.

### Performance verification

- Focused opt-in command: `PERF_CARRIER_NAVAL=1 PERF_CARRIER_NAVAL_DURATION_MS=4000 npx playwright test tests/e2e/carrierNavalControlPerformance.test.js --project=chromium --reporter=line`
- Scenario: 12 stationary carriers, 48 simultaneous F22 recovery approaches, and direct-control updates for all eight ship classes at device pixel ratio 1.
- Unchanged `HEAD` baseline: 60.24 FPS, 0.074 ms average carrier/naval workload, 0.143 ms average game update, 3.514 ms average render, 0 MB heap delta.
- Implemented result: 60.10 FPS, 0.080 ms average carrier/naval workload, 0.134 ms average game update, 3.968 ms average render, 0 MB heap delta.
- FPS changed by -0.25%, while focused workload remained under 0.1 ms on average and measured heap showed no growth. The result is within the 20% regression gate and the fixed 50 FPS budget.

## 2026-07-23 carrier collision and bow-stop correction

- Aircraft and Aircraft Carriers do not generate collision blocking, collision response, or avoidance forces against one another. This applies while aircraft are flying, landing, taxiing, or parked on deck; ordinary aircraft-to-aircraft and ship-to-ship collision behavior remains unchanged.
- An Aircraft Carrier's final waypoint is reached when the forward tip of its oriented rendered hull enters the waypoint tolerance, rather than when the carrier sprite center reaches it.
- On bow-tip arrival, the carrier clears its path and movement target, zeroes linear and angular velocity, preserves its current heading, and cannot resume autonomous rotation without a new movement command.
