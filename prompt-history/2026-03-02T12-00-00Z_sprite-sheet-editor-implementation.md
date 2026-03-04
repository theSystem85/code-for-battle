# Prompt History Entry
- UTC Timestamp: 2026-03-02T12:00:00Z
- Processed By: copilot

## Prompt
Add new feature for map editor and integration:
1) add new button in sidebar under "Map Settings" that opens a new "Sprite Sheet Editor" modal called SSE.
1.1) in SSE on the left side you can enter tile size in pixels (default 64) that will be used to segment the image into tiles
1.2) tile grid border width (default 1px) to ensure the border itself will not be rendered into the game tiles itself
1.3) input filed to add new tags (to tag specific tiles)
1.4) list of available tags sorted by the active tags on top. the list by default contains these tags (passable, decorative, impassable, intersection, grass, soil, snow, sand, concrete, street). The tag list is a radio group where 1 active tag can be selected. That selected tag can then be used to mark the tiles on the tile view of the modal to mark each tile with the active tag (or unmark if the tile was already marked (toggle))
1.5) the modal has a close button in the top right and its styling is consistent with existing modals.
2) The tile view (TW):
2.1) in the sidebar there is a dorpdown where all available sprite sheets can be seletecd (public/map/sprite_sheets). The folder cannot be changed. When new sheet (support webp format) is selected it is loaded immediately. previous changes on the old sprite sheet json will be stored.
2.2) the view will show the grid based on the sidebar inputs (show red border of the tiles as overlay that can be toggled on/off regarding its visibility)
2.3) the user can now click or draw (click + drag) on all the tiles to tag them with the currently active tag. A red 33% opacity overlay will be put on the drawn tiles. Also a small tag label will be visible on the tiles top left corner. All applied tags stack there from top to bottom (visibility of these tag labels can be toggled on/off in the sidebar)
3) on the bottom of the sidebar there is a button labeled "Apply tags" that yields the generation or update of a json file that describes how the sprite sheet is segmented and which tags are applied on which tiles.
4) add a new checkbox to the map settings that when checked will cause to switch from the current tile rendering mode with separate files for each tile to this new integrated sprite sheet based tile rendering mode.
5) Ensure the tiles marked "passable, impassable, decorative" are treated in the same way they are currently treated during map generation.
6) ensure the resulting map generation will always yield 64x64y sized map tiles regardless of the size of the input tiles so the tiles might be down scaled to match the 64x64y requirement (if upscaling would be required warn the user about image quality loss).
7) make sure current cacheing mechanics for map rendering can also apply for the new method. Ensure the current rendering performance will not be worse!
