# Replay Map Consistency

**UTC Timestamp:** 2026-03-24T20:10:33Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> when loading a replay from an export (but this might happen also on any replay) it seems that the map is not completely correctly regenerated or interferes with the previously loaded map or the current map settings. When loading a replay (like also when loading a save game) ensure that the entire map settings are also loaded from the replay. I noticed that at least the position and count of the ore field did not match the original replay map settings after having the replay exported and re-imported. Try to find other issues regarding the map consistency that might not yet have been covered in the replay json files and fix them all!

## Summary of Changes

- Added full map-setting persistence to saved game/replay baselines, including map seed, width, height, ore-field count, and player count.
- Added a canonical static tile snapshot for saved/replayed maps so ore tiles and seed crystals restore exactly instead of partially rebuilding from current map settings.
- Updated the load path to restore that static map snapshot before re-placing buildings and to derive dimensions from legacy saved tile grids when older saves/replays are missing explicit map settings.
- Added unit coverage for the new map-setting/tile-state serialization and restoration behavior.