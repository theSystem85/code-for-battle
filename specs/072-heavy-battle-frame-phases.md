# Heavy-battle frame phases

Status: instrumentation and scenario landed. Optimization follows the measured phase breakdown.

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

## Acceptance

- The same seed, unit count, and duration produce the same spawn tiles and attack pairs.
- The widget phase text updates at most once per second.
- Phase samples live in preallocated rings. Snapshot sorting happens on read, not per frame.
- WebGL remains the fallback when WebGPU cannot initialize.
