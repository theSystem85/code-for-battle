# Fire system

Fire engines are unarmed ground supply vehicles produced at a Vehicle Factory after a Fire Department is built. Departments unlock after Vehicle Workshop, occupy 3×3 tiles, cost 2500, consume 20 power, have 300 HP and host four engines per owner. Engines cost 900, have 60 HP and carry 1000 water. Alive and queued engines consume capacity; spawn rechecks living capacity. Existing engines can be reassigned after department destruction.

Fire is an independent `fire` tile tag plus a compact active record, on building ground footprints or trees/woods. Tank, rocket and artillery projectile/splash hits roll ignition with probability 0.08 + 0.52 × missing-health fraction. Each burning tile deals FIRE_DAMAGE_PER_SECOND (default 2). Every five seconds without active suppression, neighbours roll FIRE_SPREAD_PROBABILITY (default 0.2). New fires wait their own five seconds. Building embers can cross one nonflammable tile to a distinct building downwind using WIND_DIRECTION shared with smoke. Street and concrete wall tiles are not flammable. Neutral cities use their normal destruction pipeline.

Engines spray the closest fire within four tiles automatically; their loader must be alive. Water drains at 40/s; three total seconds of spray extinguishes one tile. Partial suppression persists, but spread resumes when spraying stops. Empty engines route to an accessible adjacent tile of their assigned department; adjacent friendly assigned engines refill 200/s. Remote fire input controls spraying during manual operation. Ordinary move commands position trucks for spraying. Selected engines show a blue water gauge. CFBL load sensing reports water absolute/relative. Standard cheats discover types from unit/building definitions.

Save/replay baselines preserve active fire timers, water and station association. Host snapshots also publish active hose targets. Simulation-only updates use deterministic gameRandom and milliseconds. Schema 7 migrates older state without mutation. New art is prepared before play at the existing 1×/2×/3× densities.

## Performance audit and acceptance

Simulation frequency is 60 Hz. Work scales with B + U + 4F + 81E (buildings, units, active fires, engines); map cells are never scanned for fire updates. Reusable station maps are cleared in place and spray coordinates reuse objects. Render work is two small flame paths per visible fire plus one short hose path per visible spraying engine, with viewport and fog culling. At DPR 3 a flame covers at most roughly 32×32×9 backing pixels; there are no full-range alpha fills, gradients or gameplay image resizes.

Hardware acceptance remains pending: no verified hardware GPU in this environment. Patrick must verify ≥75 FPS and p95/p99 frame times on dev with extensive forest fires, four engines per department, selected engines, fast scrolling and DPR 3. No software GPU benchmark certifies this requirement.

## Outstanding acceptance

- Download and audition generated ElevenLabs assets; integrate bounded positional fire/hose loops and crew voices after download. Proxy currently returns HTTP 403. Connector SFX results report one second and loop false despite requested parameters, so do not claim finished loop assets.
- Replace concept sidebar/map art with reviewed production artwork; distinct elevated sidebar camera remains outstanding.
- Browser multiplayer/replay/save round-trip and full manual usability acceptance; automated verification results are recorded in the task change note.
- Feedback-driven revisions to defaults, targeting and artwork after player testing.

## Review plan

| Area | Manual check | Expected result |
|---|---|---|
| Tech tree | Build Workshop, Fire Department, then queue five engines | Department unlocks after Workshop; exactly four engines can be queued/hosted per department; vehicles leave the Vehicle Factory |
| Fire damage | Hit a building with tank/artillery/rockets, then leave it burning | Ignition becomes more likely as health falls; each burning footprint tile deals configured damage |
| Wind | Burn a building separated from another by one clear tile; reverse smoke wind | Spread can cross the gap downwind, with the same base wind used by smoke |
| Water | Move an engine near burning tiles and inspect its blue gauge | Hose appears, water drains, tiles extinguish; empty truck returns and refills at its assigned department |
| Capacity | Destroy a department and build another | Surviving engines seek an available friendly home without assigning more than four per station |
| Automation | Inspect CFBL load and build-type options | Fire Engine load reports water; engine and department are available as build types after prerequisites |
| Persistence | Save/load during a fire, replay the same sequence, and connect a client | Timers, fire tags, water and station associations are retained; remote state follows the host |
| Remote input | Drive a selected engine and hold/release fire | Fire input controls the hose during manual movement |

Automated browser coverage E00262 passes with system Chromium: cheat-spawned engine consumes water, damages stop when the fire is extinguished, fire records restore to matching tile tags, the department card exists, and prepared engine art becomes available. This is functional coverage, not hardware performance certification. Unit coverage also includes wind direction, capacity, suppression, refill and immutable migration. Full-suite results are recorded in the task change note.

Save/replay configuration also retains the shared smoke wind vector. Fire-engine repath throttles are saved so restoring a baseline does not reset autonomous routing timing. A real saveGame/loadGame regression verifies these fields alongside water, department ID, per-tile timers and fire tags. The final full unit sweep passed 361 files / 5,726 tests; the subsequent focused persistence/network/fire suite passed 105 tests.

Publication follow-up: four-player replay E00097 runs through recording/playback but reported 98.51% final state overlap against its unchanged 99% acceptance threshold. Investigate the building, achievedMilestones and AI budget differences before claiming replay acceptance. See docs/fire-system-handoff.md.
