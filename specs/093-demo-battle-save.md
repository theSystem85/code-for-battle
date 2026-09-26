# 093 — Demo battle save

## Save

`demo` is a locked builtin save, listed with the missions. Storage key: `builtin:demo`.

- Module: `src/missions/mission_demo.js` (`demoSave`)
- Registry: `src/missions/index.js` keeps `Mission_01` first, then `Full_Base_Test`, then `demo`
- Copy: `missions.demo.label` and `missions.demo.description` in `src/missions/locales/en.json` and `de.json`
- No intro video. Loading it does not pause for a briefing.

English label: Demo. German label: Demo.

## Generator

```bash
node --import ./scripts/demoSaveRegister.js scripts/generateDemoSave.js
```

`scripts/generateDemoSave.js` calls `generateMap` for seeds `demo-battle-1` through `demo-battle-10` with mixed biomes, shores, a center lake, and raised water and rock. It keeps a central site, clears streets, then paints the camera window: a snowy rock plateau with a cliff face, grass on the west and sand on the east, a side rock cluster, and a coast deep enough to read as open water. Two finished bases sit on the flanks. Land vehicles fight on the open ground, Apache / F22 / F35 stay airborne over the battle, and ships fight on the water. `scripts/demoSaveRegister.js` stubs `src/main.js` so the generator can import map generation without booting the browser shell.

The chosen site is stored on the mission as `seed`, `orientation`, and `focus`. `focus` is the battle center in tiles. The screenshot script frames that tile. There is no infantry type in the game.

Unit tile positions use the center formula `Math.floor((x + TILE_SIZE / 2) / TILE_SIZE)`.

## Screenshots

`scripts/captureLandingScreenshots.mjs` loads `builtin:demo`, waits for projectiles, and writes the landing images in `public/images/docs/`. See [Marketing landing page](090-marketing-landing-page.md).

## Performance

The generator and the marketing page do not change the simulation or render hot path. This environment cannot certify 75 presented FPS.
