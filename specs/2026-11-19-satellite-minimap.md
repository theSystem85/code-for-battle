# Satellite minimap

- The expanded sidebar offers a Satellite toggle. The minimap starts in Normal mode and remembers the selected mode across map loads in the current tab.
- Satellite mode shows a snapshot of the entire map's terrain, decorations, and resource graphics at load time. Fog of war, radar outages, milestone videos, colored unit and building markers, the camera outline, and map navigation follow the same rules in both modes.
- New and regenerated maps, restored saves and replays, and synchronized multiplayer maps each get a new snapshot. The loading screen reports “Rendering satellite minimap” as its final work step. During startup with automatic save recovery, only the map presented to the player needs a snapshot.
- The snapshot uses a single canvas rasterized at minimap resolution, capped at 1,024 pixels per side (4 MiB of pixel data). Repeated toggles and viewport changes reuse the same image. Satellite mode blits that image once per minimap update, at most once per rendered frame on desktop and four times per second on mobile during gameplay. Marker work depends on entity count as before.

## Verification

- Run `npm run test:unit` for the minimap layer coverage.
- Run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- tests/e2e/satelliteMinimap.test.js --project=chromium` for loading, toggle visibility, cache reuse, and regeneration.
- Qualifying hardware performance acceptance is pending. This environment has no verified hardware GPU.
