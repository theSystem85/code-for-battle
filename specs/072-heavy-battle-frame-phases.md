# Heavy-battle frame phases

Status: profiled, then the measured CPU hotspots (movement and combat scans) were reduced. GPU instancing was not added because unit and effect draw time was under 1 ms on the measured machine.

## What this measures

A scripted late-game battle on a seeded map:

- four players
- hundreds of ground units, front ranks already in weapon range and rear ranks pathing in
- projectiles from live combat, looping explosion sprites, seeded smoke and dust
- fog of war enabled
- camera sweeps the battle at 600 logical px/s for a fixed duration after a warmup

The performance widget shows a one-second average and p95 for sim, movement, combat, pathfinding, AI, fog, terrain, units/buildings, effects, UI, and minimap. GPU pass time stays on the existing GPU row. Numbers are CPU-side unless the browser exposes a WebGPU timestamp query.

Movement, combat, pathfinding, AI, and fog are subsets of sim. Units includes bases and overlays. Do not add those subsets to sim.

## Run it

Headless diagnostic (does not certify 75 presented FPS):

```bash
HEAVY_BATTLE_PROFILE=1 \
HEAVY_BATTLE_BACKEND=webgpu \
HEAVY_BATTLE_MAP_SIZE=96 \
HEAVY_BATTLE_UNITS=240 \
HEAVY_BATTLE_WARMUP_MS=2000 \
HEAVY_BATTLE_DURATION_MS=5000 \
HEAVY_BATTLE_OUT=artifacts/heavy-battle-webgpu.json \
npx playwright test tests/e2e/heavyBattleProfile.test.js --project=chromium --reporter=line
```

Force the WebGL fallback with `HEAVY_BATTLE_BACKEND=webgl`.

On a Mac, in Chrome:

```text
http://localhost:5173/?seed=11&size=128&players=4&heavyBattle=1&battleUnits=320&benchmarkDurationMs=8000&heavyBattleWarmupMs=3000&framePhases=1
```

Turn on the performance widget if it is hidden. Compare the phase rows, renderer row, draw calls, and GPU time. The battle keeps running after the JSON result is stored on `window.__heavyBattleResult`.

## Measured on this VM

Same command, `HEAVY_BATTLE_BACKEND=webgpu`. Playwright Chromium 145.0.7632.6, Linux VM, viewport 1280×720, DPR 1. The browser had no WebGPU adapter, so the active backend was WebGL, water-only, 8 terrain draw calls, `gpuMilliseconds: null`. Seed 11, map 96, 240 requested units, 2s warmup, 5s measure. End counts matched: 239 units, 9 bullets, 94 smoke, 80 dust, 12 explosions, 4 buildings.

| Metric | Before | After |
| --- | --- | --- |
| Frames in the window | 86 | 184 |
| FPS | 17.06 | 36.7 |
| Frame avg / p95 / max ms | 58.63 / 73.8 / 121.6 | 27.25 / 36.1 / 45.0 |
| Sim avg / p95 ms | 39.02 / 53.2 | 9.05 / 13.3 |
| Movement avg / p95 ms | 18.25 / 24.3 | 5.15 / 8.2 |
| Combat avg / p95 ms | 13.94 / 17.8 | 0.81 / 1.4 |
| AI avg / p95 ms | 4.4 / 7.5 | 2.01 / 4.6 |
| Fog avg ms | 0.60 | 0.26 |
| Terrain avg ms | 0.33 | 0.25 |
| Units avg ms | 0.89 | 0.87 |
| Effects avg ms | 0.41 | 0.39 |
| Minimap avg / p95 ms | 1.54 / 3.9 | 2.19 / 4.4 |
| Terrain draw calls | 8 | 8 |
| GPU pass | not available | not available |

Movement and combat were the costs the profile supported. Friendly-tile and clear-shot checks now scan an owner index rebuilt once per pass. A blocked shot looks for a sidestep at most every 300 ms of simulation time, without cloning the unit. Tank engine pan and gain update at 10 Hz. AI was not rewritten; its average fell in the same run. Minimap average rose. Neither of those is a 75 FPS certification. A display or browser limited below 75 Hz, or this headless software path, cannot certify presented FPS. Repeat the Mac URL on Apple Silicon Chrome to fill the WebGPU and GPU-timestamp rows.

## Acceptance

- The same seed, unit count, and duration produce the same spawn tiles and attack pairs.
- The widget phase text updates at most once per second.
- Phase samples live in preallocated rings. Snapshot sorting happens on read, not per frame.
- WebGL remains the fallback when WebGPU cannot initialize.
- Clear-shot sidesteps use simulation time, so peers that share that clock take the same search. The owner index is rebuilt from the live unit list and does not change occupancy (center tile, self excluded).
