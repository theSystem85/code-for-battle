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
- Asset progress is aggregated from tile/unit textures (70%), building images (20%), and turret images (10%), then mapped into the boot bar.
- Map regeneration, restart, save/mission load, and replay load use `runWithLoadingScreen`, which yields two frames so the overlay paints before the synchronous rebuild.
- Those reloads stay on screen for at least 500ms so a fast rebuild still reads as a finished loading state, then fade out.

## Verification
- `npx vitest run tests/unit/loadingScreen.test.js tests/unit/gameSetup.test.js`
- `npm run test:unit`
- Manual: refresh the game and confirm the screen covers boot, then disappears into a playable map. Restart from the sidebar, change a map setting, and load a mission or save; the screen returns for each and leaves no overlay.

## Performance
- The overlay is not on the simulation or render hot path. Hidden state disables its CSS animation and pointer events.
