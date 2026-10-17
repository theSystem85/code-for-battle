# Destructible city buildings and cluster settings

## Findings

Ordinary structures store `health`/`maxHealth` in `gameState.buildings`. Direct projectiles use `checkBuildingCollision` in `bulletSystem.js`; `logic.js::triggerExplosion` applies splash damage using distance to the closest point of the whole structure rectangle, weapon multipliers and caps. `buildingSystem.js` removes dead buildings, clears their map footprint, stamps debris with `setBuildingDebrisDecals`, and plays the prepared destruction animation and explosion sound. Units, buildings, explosions and sparse map decals travel through host snapshots in `network/stateSync.js`. Static tiles are explicitly serialized in `saveGame.js`.

Previously, map decorations were prepared layout cells with sprite tags and optional impassable occupancy; they had no health or damage/destruction lifecycle. The default combat decal catalog loads `debris_craters_tracks.webp` independently of optional selections and accepts `debris`, `impact` and `crater`. No city-specific debris art is necessary.

## Behavior

- `dtv3_city`, `dtv3_shore` and `dtv3_ground_detail` are optional, available only when image and metadata exist. `index.json` lists defaults only, so remains unchanged. Explicit empty custom selections retain default-mode parity.
- City anchors own a neutral structure object shared by every footprint cell. Configurable durability is 150 HP for one tile, 250 for two, 400 for four; other footprints use 100 HP per tile (reduced tenfold in 0.61.0 so cities fall to ordinary fire).
- Cities remain outside player structure/auto-target/production/victory lists, so units never auto-acquire them. Since 0.61.0 a living city is a valid target for a normal attack click: hovering it with combat units selected shows the attack cursor (with the usual in-range/out-of-range variants) and a standard click issues a non-forced attack, no force-attack modifier needed. City ids (`city-x,y`) resolve from the anchor tile for multiplayer commands (`targetType: 'city'`), replays (`kind: 'city'`) and saved unit targets. Projectile collisions and attack-ground splash damage can damage them. Splash uses the existing structure rectangle calculation, howitzer multiplier, damage rings, building multiplier and caps.
- Impact and crater decals only land on passable tiles (0.61.0): `isDecalBlockedTile` rejects water, rock, seed crystals, blocking buildings, living city buildings and impassable decorations at creation and at draw time. Destruction debris is exempt.
- Only damaged, surviving cities show a small solid health bar. Dead cities return no intact decorative sprite. Destruction stamps existing grouped `debris` decals, invalidates the affected terrain surface, triggers the existing destruction animation, and uses the explosion sound.
- Match existing destroyed-structure convention: free the static occupancy contribution across the footprint. Preserve unit/wreck occupancy contributions and independent map building references. Clear shared path caches. Unit tile calculations remain center-based; city positions are structure footprint tile coordinates, not unit positions.
- Anchor tile `cityBuilding` records include HP and tombstones in save/load. Host snapshots carry city records and the same optional sheet selections. Clients cannot apply local city damage; host records update persistent objects in place. Existing explosion and decal snapshots carry visual effects.

## Generation and settings

| Setting | Default | Range |
| --- | --- | --- |
| citySeeds | 2 | 0–8 |
| cityClusterSize | 8 | 3–20 |
| ruinSeeds | 3 | 0–10 |
| ruinClusterSize | 7 | 3–20 |

Counts specify requested centers; small/constrained maps can fit fewer. Zero disables the category. Radii are tiles. A shared normalizer clamps integers and handles invalid/missing values consistently. City placement uses seed-derived, biome-matching land centers and a loose three-tile anchor grid; two-tile buildings have one-tile streets. Since 0.61.0 those streets are real: `buildCityStreetLattice` reserves every row and column at grid offset 2 within `radius + 1` of each city center before any decoration is placed, so no building, prop or ground detail can sit on them. After placement, `planCityStreets` keeps the lattice only inside each cluster's building bounding box (expanded by one tile), then joins every street component to the generated road network with a cheapest path (cost 1 per free tile, 4 through another decoration; never through city buildings, water, rock, structures or seed crystals). Decorations a connector crosses are dropped. `prepareCityBuildings` stamps the result as ordinary `street` tiles flagged `cityStreet` (rendered and pathed like any street) and reverts flagged tiles a newer layout no longer wants. Layout preparation treats flagged streets as the land they replaced, so rebuilding the layout on a stamped map gives the same streets (idempotent). The flag is saved and restored with the tile. Whole footprints reject overlaps, water, roads and their buffer, starts/bases, ore buffers and narrow passages. The normal preparation spacing index reserves occupied footprints. City-to-city spacing allows dense streets without the six-tile identical-prop restriction. Other decoration categories retain their spacing rules.

Floating-label sidebar number inputs match existing `.sidebar-input` markup without title attributes. Settings persist through the existing storage facade, accept matching URL query parameters, regenerate maps on change, survive saves, and join host map-generation settings.

## Preparation and performance acceptance

Layout grouping and the city tile index are prepared once per map/configuration, with cache hits preserving object identity. Direct projectile city lookups are O(1), rather than scanning buildings per projectile. Splash visits structures only on explosion events. Rendering adds one living-state check per decorative tile lookup and at most two small rectangle fills per damaged visible city per frame. At 100 damaged cities and 75 Hz this is at most 15,000 small fills/second, with pixel area scaling by DPR squared; no range-sized alpha fills or new sprite resizing are introduced. Health bar iteration also visits intact cities; a map can request eight radius-20 clusters, so this must be included in qualifying-hardware measurements.

The existing prepared decoration imagery and combat decal catalogs remain responsible for final-size imagery and bounded terrain caches. No new assets or lazy resized variants are added.

Validation commands:

```sh
npm run test:unit
npm run lint:fix:changed
npm run lint
npx playwright test tests/e2e/destructibleCityBuildings.test.js tests/e2e/emptyCustomSheets.test.js --project=chromium --reporter=line
```

Browser verification is outstanding: this sandbox rejects Vite binding `127.0.0.1:5173` with `listen EPERM`. Consequently no live before/after FPS, p95/p99/max, missed deadlines, update/render CPU, GPU timing, actual browser backend/DPR or memory/GC measurements can be reported. The 75 FPS gate is **not certified**. Before acceptance, run the protocol in `performance_improvement.md` on qualifying hardware with unchanged settings/visual quality: cold traversal, repeated full-map scrolling, layered selected units, firing, movement, procedural water and realistic entities, including eight radius-20 cities under simultaneous fire. Record all required metrics; do not lower fidelity or the 13.333 ms deadline.

## Recorded sandbox results

- `npm run test:unit`: 281 files passed, 5,057 tests passed (47.28 s).
- `npm run lint:fix:changed` and `npm run lint`: passed.
- `npx vite build`: passed, including the PWA service worker.
- Browser command above: blocked before tests because Vite cannot bind its local socket (`EPERM`); no browser assertions or FPS measurements ran.
- `node scripts/benchmark-decoration-layout.mjs`: five preparation samples per mode/size. Synthetic `city-max` requests eight radius-20 cities and ten radius-20 ruin clusters. On 128×128 land, 791 cities: first 345.51 ms, median 270.59 ms, max 345.51 ms. On 256×256 land, 973 cities: first 490.94 ms, median 417.61 ms, max 490.94 ms. These are preparation CPU times, not gameplay frame times. Heap deltas were +28,240 and −38,849,344 bytes respectively; automatic GC makes these allocation observations unsuitable as retained-memory estimates. This synthetic probe does not replace live before/after rendering benchmarks or hardware certification.
