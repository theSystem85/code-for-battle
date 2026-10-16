---
name: extend-sprite-sheet
description: Create or extend Code for Battle decorative and map sprite sheets from ungridded black-background source images using the Sprite Sheet Editor UI or its matching browser API.
---

# Extend a sprite sheet

Use this path for decorative map assets, including universal and biome decorations. Open **https://code-for-battle.netlify.app/sse** after deployment, or run `npm run dev` and open `/sse` locally. This dedicated page runs the editor without game boot. Existing in-game users can also open Map Settings → Sprite Sheet Editor.

1. Expand **Extend sheet / Import sprites**. Choose **New sheet** with a name, tile size, columns and rows to create a blank black target, or select an existing static sheet and choose **Use current sheet as target**. Target dimensions must be whole grid cells. The main canvas always shows the target. Download important work before reloading; composed targets are session-local.
2. Upload the ungridded black-background source using **Source image**, or drop it on the extend panel/source pane. Dropping on the main target canvas retains the existing sheet/JSON import behavior.
3. Choose **Extract all** to detect connected foreground components, bridge one-pixel gaps and ignore single-pixel noise, or click once on each sprite in the separate **Source** pane. Adjust the near-black cutoff (default 16, range 0–255) if needed. Connected non-black pixels are isolated; click isolation keeps disconnected pieces separate. All loaded sources are processed in source order; already imported sprites are skipped independently per sheet. Extracted pixels show a light segmentation mask and their actual contour in source coordinates, aligned under zoom and pan. Transparent/background clicks and single-pixel noise are rejected. Clicking an imported source sprite removes it; click again to reimport. The same operation is available through the API below.
4. Choose an **Anchor** (default center) and **Source-to-target size ratio** (default 1, range 0.05–4) before extracting. The ratio determines tile spans; contain preserves aspect and fits inside reserved tiles. Stretch fills the full reserved area exactly. Anchor changes apply to the selected sprite as well as the default for future imports. SSE packs into the first free grid region, reserves every covered cell and grows downward by whole rows when needed. Border is inside the cell pitch. Oversized sprites require a target with more columns. Do not implement separate packing outside SSE: user and agent must use the same flow.
5. Click a placed target sprite to select its covered cells, then choose **Remove sprite** or press Delete (outside text controls). Use **Select tiles to clear** and **Clear tiles** for arbitrary cells. Choose **Compact** to repack imported sprites in current reading order into the first free tile regions; existing non-imported content stays reserved. Tags and sprite positions move with the pixels.
6. Right-click or long-press an imported target sprite to open **Resize sprite**. Enter columns/rows and choose **Resize**, or use **Shrink**/**Grow** to change both dimensions by one (minimum one). Growth rejects occupied tiles and horizontal edges; downward sheet growth is allowed. The top-left tile stays fixed, released cells become free and black, and tags from all prior cells merge into the remaining cells and sprite metadata. Shrinking a stretched sprite switches it to center to preserve aspect.
7. Choose **Export**. Allow multiple browser downloads. WebP defaults to exact lossless encoding; uncheck **Lossless** to enable the quality slider (0–100%, default 85%). JSON includes name, compression, grid and sprite rectangles in tile/pixel coordinates along with SSE tags, `extension.occupiedTiles` and `extension.imports`. Reopen an exported image and its JSON together using the existing target drop path to continue editing.
8. **After downloading**, perform any LLM JSON tagging as a separate task on the downloaded sheet. Art generation and LLM tagging implementation are outside SSE scope. New repository bitmap assets must remain WebP at quality 0.85.

## Browser API

Wait for `window.__SSE__`. Methods are the same controller used by the buttons, uploads and source clicks. Mutations return promises; await each call sequentially. Failures reject with an Error and update the UI/status event.

```js
const sse = window.__SSE__
await sse.newSheet({ cols: 8, rows: 4, tileSize: 64, name: 'biome-decorations' })
// Alternatively: await sse.selectTargetSheet(pathFromSheetDropdown)
await sse.loadSourceImage(sourceDataURL)
await sse.setAnchor('center')
await sse.setSizeRatio(1)
const placements = await sse.extractAll({ cutoff: 16, minArea: 2, gap: 1 })
// Alternatively: await sse.isolateAt({ x: 42, y: 87, cutoff: 16 })
if (placements.length) await sse.removeSprite(placements[0].id)
await sse.clearTiles([{ col: 7, row: 3 }])
await sse.compact()
const state = sse.getState()
const { imageBlob, metadataBlob, metadata } = await sse.exportSheet()
```

- `setAnchor(anchor)`: sets the default placement anchor and updates the selector. Valid values: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center`, `stretch`. Emits `anchor-changed` with `{ anchor }`. The UI selector also calls `setSpriteAnchor` when a sprite is selected.
- `setSpriteAnchor(id, anchor)`: redraws the placed sprite in its current reserved tiles, persists `anchor` and its relative pixel `renderRect`, preserves tags, and emits `sprite-anchor-changed` with `{ id, anchor }`.
- `resizeSprite(id, { columns, rows })`: positive integer spans within the sheet width and free tiles. Preserves top-left placement and tags; redraws retained original pixels to fit the reserved area with aspect preserved. Downward sheet growth emits `sheet-grown`; successful edits emit `sprite-resized` and `sprite-selected`. Stretch switches to center.
- `shrinkSprite(id)` / `growSprite(id)`: same controllers as **Shrink**/**Grow**. Subtract/add one from each span dimension (shrink minimum one); share resize events and validation. Failures emit `error` and leave placement unchanged.
- `openSpriteMenu(id, { x = 0, y = 0 } = {})` / `closeSpriteMenu()`: same controllers as right-click, touch long-press, Close and Escape. Coordinates are viewport CSS pixels. Emit `sprite-menu-opened` (`{ id }`) / `sprite-menu-closed` (`{}`). Call `resizeSprite` to apply.
- `setSizeRatio(n)`: finite number from 0.05 through 4, default 1 (source pixels to target pixels). Used by both isolation and extract all for future placements; emits `size-ratio-changed` with `{ sizeRatio }`. `getState()` includes `anchor` and `sizeRatio`; placement records retain their individual values.
- `targetChanged()`: editor integration hook after a successful sheet load. Clears source duplicate mappings and redraws overlays when the active path changes; emits `target-changed` with `{ path }`. New-sheet creation and explicit target selection also reset mappings, so a source sprite can be imported into each target again. `selectTargetSheet` emits `target-selected` with `{ path }`.
- `extractAll({ sourceId, cutoff = UI cutoff, minArea = 2, gap = 1 } = {})`: processes every loaded source in insertion order, or only the specified sourceId. Detects sprites against black, with 8-connected neighborhoods and configurable bridging (gap 0–2 pixels). Copies original pixels only and ignores components below minArea. Skips previously extracted pixels, packs immediately and returns placement records with stable `id` fields. Emits the usual `isolated`, `packed`, `sheet-grown` events plus `extracted-all` with `{ sprites }`. Touching shapes and pieces within the gap distance merge; adjust options for tightly spaced artwork.
- `selectSprite(id)`: same controller as clicking a target sprite; outlines covered tiles and emits `sprite-selected` with `{ id }`.
- `removeSprite(id)`: same controller as **Remove sprite** and Delete. Clears all covered cells and removes occupancy, tags and import metadata. Emits `tiles-cleared`, then `sprite-removed` with `{ id }`. Removed source regions can be extracted again.
- `compact()`: same controller as **Compact**. Sorts by current row then column and places each sprite in the first free region scanning across then down. Preserves full tile spans, pixels, tags and IDs; existing non-imported tiles stay fixed. Returns updated placements and emits `compacted` with `{ sprites }`. Keeps the sheet's current row count unless growth is necessary.
- `getState().sprites` exposes placement records with IDs; `selectedSpriteId` identifies the selected sprite.
- `newSheet({ name, tileSize, cols, rows })`: same controller as **New sheet**. Defaults: `extended-sheet`, 64, 18, 18. Square cells, no border; returns state and emits `sheet-created`.
- `exportSheet({ lossless = true, quality = 85 } = {})`: same controller as **Export**. Downloads new WebP and JSON files, returns `{ webpBlob, json }` plus legacy `{ imageBlob, metadataBlob, metadata }` aliases. Never overwrites repository files. Lossless uses a local VP8L encoder; quality is a percentage and only applies to lossy encoding. Emits `downloaded`.
- `clearTiles([{ col, row }, ...])`: fills complete target cells black and removes their tags, occupancy and intersecting imported sprite records. Rejects invalid cells before mutation. Same controller as **Clear tiles**; emits `tiles-cleared` with `{ tiles }`. Enable **Select tiles to clear** to click, shift-click or drag a rectangular selection; outlined cells and the selection count show what will clear.
- `setClearMode(enabled)`: toggles selection mode and emits `clear-mode-changed` with `{ enabled }`.
- `selectTiles(cells, { append = false } = {})`: validates and updates the same outlined tile selection as click/shift-click/drag; emits `selection-changed` with `{ tiles }`.
- `setExportOptions({ lossless = true, quality = 85 })`: updates the checkbox, quality control and label through the UI setter; emits `export-options-changed` with the compression options. Pass options explicitly to `exportSheet` when exporting through the API; calling it without options always defaults to lossless.
- `setViewport({ pane = 'target', sourceId, x, y, scale })`: sets pan in CSS pixels and zoom (0.1–8) through the gesture transform controller, emits `viewport-changed` with `{ pane, x, y, scale }`. Pane is `target` or `source`; an explicit `sourceId` controls that source independently and is included in the event. Without it, source navigation moves the entire strip.
- `setSplitRatio(ratio)`: resizes target/source panes using the same setter as pointer/touch dragging or arrow keys on the separator. Clamped to 0.15–0.85, persisted as `sse.splitRatio`, emits `split-changed` with `{ ratio }`.
- Both panes support wheel panning, ctrl+wheel cursor-anchored zoom and pointer-based two-finger pan/pinch. The sheet info panel reports compression from metadata or WebP bytes; unavailable encoder quality is shown as unknown.
- `getState()` returns `{ mode: 'extend', anchor, sizeRatio, targetSheetPath, sourceLoaded, tileSize, rowHeight, borderWidth, columns, rows, occupiedTiles, pendingSprites, importedSprites, sprites, selectedSpriteId, status }`. `occupiedTiles` contains `"column,row"` strings; `pendingSprites` is zero because packing is immediate. Grid fields can be absent until a target is selected.
- `createBlankSheet(options = {})`: defaults are 18 columns, 18 rows, tile size 64, row height equal to tile size, border 1, name `extended-sheet`. Returns state; use `targetSheetPath` to reselect local targets.
- `selectTargetSheet(path?)`: accepts the dropdown path/local ID, or uses the active sheet if omitted. Returns state. Static sheets only. Detects occupancy from existing non-black pixels, metadata and tagged cells.
- `loadSourceImage(input)`: accepts File, Blob, ArrayBuffer, image data URL or blob URL; returns state. Coordinates refer to original source pixels, independent of CSS scaling. Loading a new source resets duplicate tracking.
- `isolateAt({ x, y, cutoff? })`: cutoff defaults to the UI input. Returns `{ id, ok: true, bbox: { x, y, width, height }, tileSpan: { columns, rows }, placedAt: { column, row } }`. Coordinates and cells are zero-based.
- `downloadExtendedSheet()`: triggers both browser downloads and returns `{ imageBlob, metadataBlob, metadata }`; image defaults to lossless WebP. Lossy export rejects when browser WebP encoding is unavailable; lossless export uses the local encoder.
- `on(event, handler)`: subscribes to detail objects; returns an unsubscribe function. Accepts names with or without `sse:`.

Window CustomEvents: `sse:source-loaded` (`{ width, height }`); `sse:isolated` and `sse:packed` (placement result); `sse:sheet-grown` (`{ previousRows, rows }`); `sse:downloaded` (`{ name, metadata }`); `sse:error` (`{ message }`). Events fire after the state is updated. Listen directly with `window.addEventListener` or use `sse.on`.

Existing repository sheets are read-only assets: edits compose session-local images/metadata; Export only downloads new files. No repository write endpoint is used.

Limits: 32 megapixels of retained sprite source rasters; 16 megapixels per image, maximum dimension 16,383 pixels; up to eight composed targets totaling 32 megapixels per editor session. No undo; retain the original source and download results regularly. Touching foreground shapes form one component.

## Round 4 API additions

- `addSourceImage(input)`: accepts the same inputs as `loadSourceImage`, appends a source, returns `sourceId`, and emits `source-loaded` with `{ sourceId, width, height }`. The styled **New source image** chooser and source/panel drops append each image sequentially. Sources have a shared 32 megapixel budget.
- `loadSourceImage(input)`: replaces all sources after successful decoding and validation; returns state for compatibility. Existing target sprites retain their raster sources.
- `getState().sources`: array of `{ sourceId, width, height }`. Source IDs are session-local; placements expose `sourceId`.
- `isolateAt({ sourceId, x, y, cutoff? })`: original pixels per source; defaults to last added source. Retains duplicate rejection. `extractAll` accepts the same optional source ID.
- `toggleSourceSprite({ sourceId, x, y, cutoff? })`: same path as source clicks. Defaults to last added source. Returns a placement on import, or `{ removed: true, id }` on removal. Import emits `isolated`/`packed`; removal emits `tiles-cleared`/`sprite-removed`. Removal clears tags and segmentation marker.
- `toggleTag({ col, row, tag })`: same path and `tag-toggled` event as tile painting; toggles every reserved cell of an imported sprite and persists sprite tags. Event includes `{ col, row, tag, tiles }`.
- `chooseSourceImages()`: opens the hidden multiple file input, emits `source-chooser-opened`. Browser activation requirements apply.
- `setExtendOpen(open)`: same path as the accordion toggle; emits `extend-toggled` with `{ open }`.

New-sheet defaults are 18×18 with a live pixel dimension label. Narrow layouts stack the scrollable sidebar above target/source panes.

- `setNewSheetOptions({ columns?, rows?, tileSize?, name? })`: updates new-sheet inputs and the live dimensions, sharing the input controller. Returns/emits `{ width, height }` via `new-sheet-options-changed`. Grid validation occurs when creating the sheet.
