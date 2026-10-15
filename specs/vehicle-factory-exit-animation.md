# Vehicle factory exit animation

All vehicle-factory production uses the shared spawn path, including AI and authoritative multiplayer production. Aircraft and naval production retain their existing paths. Existing factory artwork and prepared variants are reused.

A vehicle starts fully behind the garage facade, facing southwest (135 degrees). Its serializable `factoryExit` state stores factory identity, coordinates, pending rally point/delivery, phase, elapsed game milliseconds, and duration. The deterministic simulation advances a 1200 ms smoothstep drive; pause stops advancement and game speed follows the simulation clock. No RNG is consumed. Center-based tile coordinates are maintained throughout.

The preferred destination is (factory.x - 1, factory.y + 3). An impassable or occupied destination holds the vehicle inside. Off-map destinations use an in-bounds outside edge tile. Following vehicles reserve distinct destinations farther along the diagonal. Vehicles at the same garage stagger by approximately 500 ms; later vehicles wait behind an earlier waiting vehicle. Destroying, removing, or selling the factory immediately completes the exit. At completion, ground occupancy is applied once, pending rally/AI movement is recalculated from the outside tile, and automated build-delivery orders resume.

Exiting vehicles cannot be selected or commanded, acquire/fire at targets, receive direct or splash damage, collide, or contribute pathfinding occupancy. Selection, control groups, mouse target picking, command handlers, policies, combat, defence targeting, spatial indexing, and utility automation honor this state. Save files and authoritative snapshots carry it; state hashing includes exit progress.

The shared 2D entity overlay, used with 2D, WebGL and WebGPU terrain backends, renders exiting vehicles before buildings. A prepared dark interior fills the transparent parallelogram on idle and active factories. An alpha-derived, sheared factory shadow is clipped to the exiting unit bounds and fades with progress. Small analytic dust/exhaust puffs and a warm early headlight accent require no random numbers or particle allocations. Garage doors are not animated.

## Preparation and cost

Two factory-sized RGBA surfaces and a 16-pixel glow are created before sprite publication and replaced with each prepared DPR generation. Their bytes are charged to the sprite registry budget, and disposal clears backing storage. At TILE_SIZE 32 and DPR 3, the three surfaces total 672,768 bytes. No resizing or mask generation occurs in the draw loop.

At 500 units and 60 simulation steps per second, the fast no-exit scan performs at most 30,000 property checks per second. With exits active, a reused factory index, gate-leader map and numeric occupancy set are rebuilt once per tick (O(buildings + units)); no per-exiting-unit entity scans occur. The renderer reuses partition/visibility arrays. Effects cover a maximum factory/unit-sized region; DPR 3 multiplies raster area by nine, not the simulation work. No range-sized or viewport-sized blend is introduced.

## Verification

- `npm run test:unit`
- `npm test`
- `npm run lint:fix:changed`
- `npm run lint`
- Opt-in visual capture: `FACTORY_EXIT_CAPTURE=1 FACTORY_EXIT_SHOTS_DIR=output/factory-exit-shots npm run test:e2e -- tests/e2e/factoryExitCapture.test.js --project=chromium --reporter=line`

Capture runs production completion for a player tank, manually advances the actual simulation between paused captures, and writes WebP quality 85 factory crops at 0, 250, 500, 750, 1000 ms and completion, at DPR 1 and 3. No production debug hook is installed; the existing regression scenario helper is reused.

### Outstanding acceptance

Chromium is not installed in the offline sandbox, so capture and live visual verification have not run. No qualifying reference hardware, high-refresh presentation, or GPU timing is available. The 75 FPS gate is **outstanding**, not certified by unit tests or headless/software results. Before acceptance, run the protocol in `performance_improvement.md` against the base and this revision, at unchanged settings: cold traversal, repeated full-map scrolling, selected layered units, simultaneous factory exits, firing, movement and procedural water at realistic entity counts. Record FPS, p95/p99/max frame times, missed 13.333 ms deadlines, CPU update/render timings, backend/DPR, GPU timings where available, and memory/GC evidence. Do not mark this feature's acceptance complete until the qualifying run meets that gate.

### Sandbox results (2026-10-15)

- `npm run lint:fix:changed`: passed.
- `npm run lint`: passed with no reported issues.
- `npm run test:unit`: 268 files, 4,948 tests passed.
- `npm test`: 270 files, 5,034 tests passed (unit and integration).
- `npx playwright test tests/e2e/factoryExitCapture.test.js --list`: both DPR scenarios discovered. Capture was not executed because the Chromium executable is absent.
- `git diff --check`: passed.

Dependencies were installed from the local npm cache with `npm ci --offline --ignore-scripts`; no network download was used. No commit or push was made.
