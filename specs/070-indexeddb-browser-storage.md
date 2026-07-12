# IndexedDB Browser Storage Migration

## Goal

Runtime game persistence must use IndexedDB instead of direct Web Storage calls.

## Requirements

- The game must expose a shared browser storage module backed by IndexedDB.
- Runtime modules must not call `localStorage` or `sessionStorage` directly.
- The storage module must keep an in-memory cache so existing synchronous settings, save-list, and replay-list flows can read values without blocking the render/UI path.
- Writes must update the in-memory cache immediately and flush to IndexedDB asynchronously.
- Existing Web Storage data must be migrated into the IndexedDB cache during startup so older saves, replays, settings, aliases, and sprite-sheet metadata remain visible after upgrade.
- Environments without IndexedDB, including headless unit tests, may use an in-memory fallback.
- Save/replay list rendering must enumerate IndexedDB keys by prefix (`rts_save_`, `rts_replay_`) rather than iterating Web Storage.
- User-facing storage copy should refer to browser storage or IndexedDB, not Local Storage.

## Migrated Data

- Save slots and last-game resume flags.
- Replay payloads.
- Map generation, terrain, speed, SOT, edge-scroll, HUD, graphics, audio, radar, and mobile sidebar preferences.
- Tutorial state.
- Multiplayer alias and host alias state.
- Keybinding overrides.
- LLM settings.
- Player build-pattern learning history.
- Sprite-sheet editor/runtime metadata and selected sheets.

## Notes

- The compatibility migration reads legacy Web Storage only through the shared storage module.
- IndexedDB remains the authoritative browser storage path in normal runtime browsers.
