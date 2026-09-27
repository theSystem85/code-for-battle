# 080 - Loading Screen

## Context
- Date: 2026-09-21
- Prompt source: add a polished loading screen for initial boot and map/game reload flows, matching the existing military/tech UI.
- LLM: Cursor Cloud Agent using Grok 4.7

## Requirements
1. Show a loading screen during the first boot (storage, assets, map generation, command setup, saved-battle restore).
2. Show the same screen when the player restarts a battle, regenerates a map, loads a save or built-in mission, or loads a replay.
3. Use the existing sidebar/HUD language: Rajdhani, dark panel, cyan accent, green status text, square chrome.
4. Show a determinate percent while asset progress is knowable, and an indeterminate standby state for single blocking reloads.
5. Keep the screen readable, avoid flashing, honor `prefers-reduced-motion`, and remove it completely once loading finishes.
6. Keep direct `loadGame` / `resetGame` calls synchronous for existing callers such as benchmarks and unit tests. UI entry points paint the screen before that work.

## Behavior
- The overlay is in `index.html` and styled in `styles/base.css` so it is visible before JavaScript boots.
- `src/ui/loadingScreen.js` owns the session, progress, and teardown. A newer session cannot be hidden by an older one.
- Initial boot progress comes from `src/ui/bootProgress.js`. Phase weights are the cold-load durations below, normalized to the bar. The displayed value never decreases, phases without sub-progress creep toward their own end (`1 - e^(-t / (expected/3))`, capped under 100%), and the bar reaches 100% only when `finishAll()` runs after the first frame and, on WebGPU, the first device init.
- Prepared sprites report one step per manifest entry (300 entries). Tile textures report water plus each of the three sheets. Those two jobs run together; the asset phase follows whichever one has more estimated time left, which is the sprite pass on the measured loads. The sprite pass yields to a paint about every 80ms so the bar can update without a separate loading thread.
- `gameSetup.js` still emits the legacy texture 70% / building 20% / turret 10% blend for callers that listen to asset preload. That blend is not the boot bar.
- Map regeneration, restart, save/mission load, and replay load use `runWithLoadingScreen`, which yields two frames so the overlay paints before the synchronous rebuild.
- Those reloads stay on screen for at least 500ms so a fast rebuild still reads as a finished loading state, then fade out.

## Cold-load timing (2026-09-26)

Headless Chrome, cache disabled, local Vite, 1280×800. Times are `performance.now()` from `DOMContentLoaded`. The same machine measured the old bar and the reweighted bar.

The old bar mapped fourteen equal texture flags through `0.08 + assetFraction * 0.64`. Twelve of those flags are small unit images and finish in a few milliseconds, so the bar sat at 66% while prepared sprites (~1.9s) and tile sheets (~1.8s, in parallel) were still running. It touched 69% only for the last ~80ms, after tile textures finished and sprites had not.

| Phase | WebGL | WebGPU (auto) |
| --- | ---: | ---: |
| Storage | 46ms | 34–45ms |
| WebGPU adapter probe | skipped | 142–193ms |
| Prepared sprites (critical path) | 1914ms | 1946ms |
| Tile textures (parallel with sprites) | 1810ms | 1838ms |
| Map generation | 129ms | 118ms |
| Terrain prepare (overlaps the end of map generation) | 44ms | 40ms |
| Command UI | 14ms | 14ms |
| First frame, including WebGL shader compile | 398ms (shader 249ms) | 471ms (shader 320ms) |
| WebGPU device init after the probe (overlaps the first frame) | none | ~1860ms to first ready |

WebGL weights: storage 46, assets 2047, map 130, systems 15, present 400. WebGPU weights: storage 40, backend 140, assets 2050, map 120, systems 15, present 1860. A WebGL choice drops the backend phase and shortens present to 400ms.

After the change, a WebGL cold load climbed through the asset phase (about 9% → 74% across the sprite pass) instead of sitting at 66%. Sprite preparation stayed about 1.84s. A WebGPU cold load used the same asset climb, then advanced through adapter, device, and pipeline before the overlay reached 100%. This VM's WebGPU device request is software-backed and slower than a typical discrete GPU; the present phase still moves on those steps and on the asymptotic creep between them.

## Verification
- `npx vitest run tests/unit/bootProgress.test.js tests/unit/loadingScreen.test.js tests/unit/gameSetup.test.js`
- `npm run test:unit`
- Manual: refresh the game and confirm the screen covers boot, then disappears into a playable map. Restart from the sidebar, change a map setting, and load a mission or save; the screen returns for each and leaves no overlay.

## Performance
- The overlay is not on the simulation or render hot path. Hidden state disables its CSS animation and pointer events.
