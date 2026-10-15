# Ground track marks

Tracked (tank-like) units leave tread marks on off-road ground.

## Behaviour
- Tracked types: `tank`, `tank_v1`, `tank-v2`, `tank-v3`, `rocketTank`, `howitzer`, `recoveryTank`, `harvester`, `mineLayer`, `mineSweeper`. Wheeled support vehicles (tanker truck, ammunition truck, ambulance) are excluded.
- Surfaces come from tile data: `land` tiles use `tile.biome` (grass, soil, sand, snow); `rock`, `water` and off-map produce nothing.
- Streets: no marks, except a dirt carry-over when a unit drives from off-road onto a street. It starts at full strength and decays linearly over 2.5 tiles (ramp marks).
- Two tread lines are offset by the half track gauge from the unit centre, using the heading at each segment end so curves stay smooth. Segments are emitted every 6 px of travel; collinear travel (heading change < 0.035 rad, same surface/chunk, < 28 px) is merged into one segment. Turning in place (≥ 0.2 rad without moving) emits a pivot record drawn as scuffed arcs.
- Look: low-opacity darker imprint on grass/soil, darker sand indentation with a light rim, deeper grey-blue snow ruts with a white rim; thin cleat dashes across each tread.

## Settings (Settings → Runtime Config → Graphics, persisted in local storage)
- Track marks (default on). Turning it off clears all marks and releases every chunk canvas.
- Fade track marks out over time (default off).
- Track fade delay, 5–300 s (default 60 s). After the delay, marks fade over 8 s and are then removed.

## Storage and memory
- One FIFO ring buffer of typed arrays, capacity 16,384 segments (`TRACK_MARK_CAPACITY`), 50 bytes per slot, ~0.8 MB in total. When full, the oldest 256 marks are evicted in one batch. Ring order equals birth order, so expiry with fading on is O(expired).
- Rendering bakes marks into per-chunk offscreen canvases (8×8 tiles plus 24 px overflow pad) at min(DPR, 2). New marks are appended to an existing bake. Chunks that lost marks or whose fade step changed are rebaked, at most 2 per frame, in one ring pass; fading chunks rebake at most once per second. Only visible chunks are drawn.
- Chunk canvases are released when their chunk has no marks left, on toggle-off, on map change, and least-recently-drawn first once all canvases exceed 48 MB (`TRACK_CANVAS_BYTE_BUDGET`). Visible chunks are never evicted, so the budget can be exceeded only by the current viewport.
- Measured at the cap (16,254 marks spread over a 96×96 map, DPR 1): 124 chunk canvases = 45.8 MB, plus 0.8 MB of typed arrays.

## Determinism
Purely visual and client-local. It uses simulation time (`gameState.simulationTime`), so it pauses with the game, uses no RNG, and is not part of `gameState` or savegames. After loading a savegame or switching maps, marks start out empty.

## Performance (headless Chromium, software GL, box CPU; not qualifying hardware)
Commands: `node /workspace/track-marks-shots/perf.mjs` against `npx vite --port 5191`.
- Emitter: 0.011–0.02 ms per tick with 100 tanks.
- Steady render at cap: 0.33 ms per frame (blit of visible chunks).
- Rebake: about 1.2 ms per chunk at the cap in software rendering, capped at 2 chunks per frame.
- 100 tank-v2 moving, frame time p50/p95: off 16.1/33.9 and 23.9/41.3 ms, on 25.3/42.8 and 23.3/39.0 ms. Headless software rendering is dominated by pathfinding and unit rendering, and the noise between runs exceeds the difference.
- The 75 FPS gate on qualifying hardware is still outstanding.
