# Vehicle factory exit animation

All vehicle-factory production uses the shared spawn path, including AI and authoritative multiplayer production. Aircraft and naval production retain their existing paths. Existing factory artwork and prepared variants are reused.

A vehicle starts fully behind the garage facade, facing southwest (135 degrees). Its serializable `factoryExit` state stores factory identity, coordinates, pending rally point/delivery, phase, elapsed game milliseconds, and duration. The deterministic simulation advances a distance-scaled smoothstep drive (about 3087 ms for the default exit); pause stops advancement and game speed follows the simulation clock. No RNG is consumed. Center-based tile coordinates are maintained throughout.

The preferred destination is (factory.x, factory.y + 3), the first outside tile beside the door. The crawl speed is preserved from the previous 3800 ms, 3.25-tile exit. A handoff tile must have a free, passable neighbour outside the building footprint; diagonal moves require clear corner tiles. An impassable or occupied destination holds the vehicle inside. Off-map destinations use an in-bounds outside edge tile. Following vehicles reserve their active destination tiles and choose nearby free outside tiles rather than extending the animation along a fixed diagonal. Vehicles at the same garage stagger by 40% of the default exit duration; later vehicles wait behind an earlier waiting vehicle. Destroying, removing, or selling the factory immediately completes the exit. At completion, ground occupancy is applied once, pending rally/AI movement is recalculated from the outside tile, and automated build-delivery orders resume.

Exiting vehicles cannot be selected or commanded, acquire/fire at targets, receive direct or splash damage, collide, or contribute pathfinding occupancy. Selection, control groups, mouse target picking, command handlers, policies, combat, defence targeting, spatial indexing, and utility automation honor this state. Save files and authoritative snapshots carry it; state hashing includes exit progress.

The shared 2D entity overlay, used with 2D, WebGL and WebGPU terrain backends, renders exiting vehicles before buildings. The door uses the original artwork with no added dark interior or sheared shadow overlay. Small analytic dust/exhaust puffs and a warm early headlight accent require no random numbers or particle allocations. Garage doors are not animated.

## Preparation and cost

Only a 16-pixel glow is created before sprite publication and replaced with each prepared DPR generation. Its bytes are charged to the sprite registry budget, and disposal clears backing storage. At TILE_SIZE 32 and DPR 3, the glow surface totals 9,216 bytes. No resizing or mask generation occurs in the draw loop.

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

### 2026-10-19 handoff and shading revision

Hot-path review before implementation: `updateFactoryExits` runs once per simulation tick; the renderer runs once per presented frame. With 500 units at 60 simulation steps/s, the existing scans remain O(units + buildings), around 30,000 unit visits/s per scan. Destination reservations reuse the existing `claimed` set. Navigation checks run only for waiting departures, with at most eight neighbours per candidate; 20 departures checking their default tile add at most 9,600 neighbour checks/s. Moving departures do not repeat those checks. No new per-frame collection or entity scan was introduced. Crew selection runs only on an actual projectile impact, with the surviving-member array allocated only on the 1% successful M2 roll.

The removed door and shadow surfaces save 663,552 prepared bytes at DPR 3. Removing the interior loop eliminates one full factory-sized draw per visible factory per rendered frame; removing the unit shadow eliminates its clip and draw. At 100 visible factories and 75 FPS, this removes 7,500 factory overlay draws/s, each covering up to 82,944 backing pixels at DPR 3. Dust, headlights, body occlusion and normal source artwork remain.

Reproducible behavior coverage: `tests/e2e/factoryExitHandoff.test.js` produces an M2 through the production queue at DPR 1 and 3, checks the last animation millisecond, verifies the first outside tile is unblocked, and verifies real pathfinding resumes toward the rally point. It also verifies that neither removed overlay is present in the prepared registry.

Sandbox browser command (system Chromium, with a temporary Playwright configuration selecting `/usr/bin/chromium` and `--no-sandbox`):

```sh
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/factoryExitHandoff.test.js --config=/tmp/factory-check.playwright.config.mjs --workers=1
```

Result: both DPR cases passed in 30.1 seconds. `npm run lint` passed with all test IDs unique. This is behavior validation; no qualifying before/after live performance run or GPU timings are available, and the 75 FPS hardware acceptance remains outstanding. Run the existing `performance_improvement.md` protocol on qualifying hardware before certifying performance.

Final verification: the full `npm run test:unit` run passed 5,308 tests and hit four sandbox `spawnSync git EPERM` failures in the unrelated release-script suite. Re-running `npx vitest run tests/unit/releaseScript.test.js` with the user's standing Vitest authorization passed all five tests in that file, resolving all four blocked cases (5,312 unique unit tests verified in total). `npm run test:integration` passed all 86 tests. Both DPR browser cases, `npm run lint:fix:changed`, `npm run lint` and `git diff --check` passed.
