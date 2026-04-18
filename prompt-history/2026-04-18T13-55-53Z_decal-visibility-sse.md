# Combat Decal Visibility and SSE Sheet Follow-up

**UTC Timestamp:** 2026-04-18T13:55:53Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> check the last commit to and prompt `when a unit fires at a tile or at a unit on that tile then permanently blend an impact decal on top of that tile (tagged in sprite sheets with "impact"). When a unit explodes on a tile then blend a "crater" tagged sprite on it. When a building explodes then on all tiles of that building blend "debris" tagged sprite on it. Ensure to save and load those decals also in the save games. choose the decals pseudo randomly when spawned based on the map seed. ensure each tile only has one decals. old decals can be replaced by new different random decals when event creating the decals repeats. ore is always rendered on top of decals when a tile has both ore and a decal.` to get the context for the current issue which is this to ensure to add debris_craters_tracks.webp to the SSE so it can be selected and edited. currently the decals from tank impacts are barely visible on the map tiles: ensure the black blending method is correct. Also the debris at the tiles of a destroyed building are barely visible (fix that)

## Summary of Changes

- Checked the latest combat decal commit and verified the owning code paths for decal spawning, rendering, save/load, and SSE sheet registration.
- Added `images/map/sprite_sheets/debris_craters_tracks.webp` to the default and indexed SSE static-sheet lists so the combat decal sheet is selectable/editable in the Sprite Sheet Editor and available by default in integrated runtime sheet selection.
- Extended sprite-sheet black-key processing to support per-sheet threshold tuning instead of only one global near-black cutoff.
- Tuned the bundled combat decal sheet metadata with lower black-key thresholds so dark `impact`, `crater`, and `debris` artwork stays visible on terrain while the black background is still removed.
- Normalized SSE metadata loading and re-serialization so existing localStorage overrides for the combat decal sheet also inherit the tuned black-key defaults instead of falling back to the old faint rendering.
- Added a regression unit test proving that sheet-specific black-key thresholds preserve dark decal pixels that the default thresholds would otherwise make fully transparent.
