# Clear map traces on restart (2026-10-17)

User prompt:
> new bugfix: ensure the traces on the map get removed when game gets restarted

Implemented by Grok Bot directly on its box (no Codex). Track marks now clear on every whole-map replacement (restart, new map, load, multiplayer map sync); restart and new map also clear explosions, smoke, dust and mines. Saved decals, mines and smoke still load from savegames. Version 0.59.0 because PR #753 takes 0.58.0.
