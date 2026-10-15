---
name: extend-sprite-sheet
description: Create or extend Code for Battle decorative and map sprite sheets from ungridded black-background source images using the Sprite Sheet Editor UI or its matching browser API.
---

# Extend a sprite sheet

Use this path for decorative map assets, including universal and biome decorations. Open **https://code-for-battle.netlify.app/sse** after deployment, or run `npm run dev` and open `/sse` locally. This dedicated page runs the editor without game boot. Existing in-game users can also open Map Settings → Sprite Sheet Editor.

1. Expand **Extend sheet / Import sprites**. Choose **New sheet** with a name, tile size, columns and rows to create a blank black target, or select an existing static sheet and choose **Use current sheet as target**. Target dimensions must be whole grid cells. The main canvas always shows the target. Download important work before reloading; composed targets are session-local.
2. Upload the ungridded black-background source using **Source image**, or drop it on the extend panel/source pane. Dropping on the main target canvas retains the existing sheet/JSON import behavior.
3. Click once on each sprite in the separate **Source** pane. Adjust the near-black cutoff (default 16, range 0–255) if needed. Connected non-black pixels are isolated; disconnected pieces need separate clicks. Transparent/background clicks, single-pixel noise and duplicate imports are rejected. The same operation is available through the API below.
4. SSE packs into the first free grid region, reserves every covered cell and grows downward by whole rows when needed. Border is inside the cell pitch. Oversized sprites require a target with more columns. Do not implement separate packing outside SSE: user and agent must use the same flow.
5. Choose **Export**. Allow multiple browser downloads. WebP defaults to exact lossless encoding; uncheck **Lossless** to enable the quality slider (0–100%, default 85%). JSON includes name, compression, grid and sprite rectangles in tile/pixel coordinates along with SSE tags, `extension.occupiedTiles` and `extension.imports`. Reopen an exported image and its JSON together using the existing target drop path to continue editing.
6. **After downloading**, perform any LLM JSON tagging as a separate task on the downloaded sheet. Art generation and LLM tagging implementation are outside SSE scope. New repository bitmap assets must remain WebP at quality 0.85.

## Browser API

Wait for `window.__SSE__`. Methods are the same controller used by the buttons, uploads and source clicks. Mutations return promises; await each call sequentially. Failures reject with an Error and update the UI/status event.

```js
const sse = window.__SSE__
await sse.createBlankSheet({ columns: 8, rows: 4, tileSize: 64, rowHeight: 64, borderWidth: 1, name: 'biome-decorations' })
// Alternatively: await sse.selectTargetSheet(pathFromSheetDropdown)
await sse.loadSourceImage(sourceDataURL)
const placement = await sse.isolateAt({ x: 42, y: 87, cutoff: 16 })
const state = sse.getState()
const { imageBlob, metadataBlob, metadata } = await sse.downloadExtendedSheet()
```

- `newSheet({ name, tileSize, cols, rows })`: same controller as **New sheet**. Defaults: `extended-sheet`, 64, 8, 4. Square cells, no border; returns state and emits `sheet-created`.
- `exportSheet({ lossless = true, quality = 85 } = {})`: same controller as **Export**. Downloads new WebP and JSON files, returns `{ webpBlob, json }` plus legacy `{ imageBlob, metadataBlob, metadata }` aliases. Never overwrites repository files. Lossless uses a local VP8L encoder; quality is a percentage and only applies to lossy encoding. Emits `downloaded`.
- `clearTiles([{ col, row }, ...])`: fills complete target cells black and removes their tags, occupancy and intersecting imported sprite records. Rejects invalid cells before mutation. Same controller as **Clear tiles**; emits `tiles-cleared` with `{ tiles }`. Enable **Select tiles to clear** to click, shift-click or drag a rectangular selection; outlined cells and the selection count show what will clear.
- `setClearMode(enabled)`: toggles selection mode and emits `clear-mode-changed` with `{ enabled }`.
- `selectTiles(cells, { append = false } = {})`: validates and updates the same outlined tile selection as click/shift-click/drag; emits `selection-changed` with `{ tiles }`.
- `setExportOptions({ lossless = true, quality = 85 })`: updates the checkbox, quality control and label through the UI setter; emits `export-options-changed` with the compression options. Pass options explicitly to `exportSheet` when exporting through the API; calling it without options always defaults to lossless.
- `setViewport({ pane = 'target', x, y, scale })`: sets pan in CSS pixels and zoom (0.1–8) through the gesture transform controller, emits `viewport-changed` with `{ pane, x, y, scale }`. Pane is `target` or `source`.
- `setSplitRatio(ratio)`: resizes target/source panes using the same setter as pointer/touch dragging or arrow keys on the separator. Clamped to 0.15–0.85, persisted as `sse.splitRatio`, emits `split-changed` with `{ ratio }`.
- Both panes support wheel panning, ctrl+wheel cursor-anchored zoom and pointer-based two-finger pan/pinch. The sheet info panel reports compression from metadata or WebP bytes; unavailable encoder quality is shown as unknown.
- `getState()` returns `{ mode: 'extend', targetSheetPath, sourceLoaded, tileSize, rowHeight, borderWidth, columns, rows, occupiedTiles, pendingSprites, importedSprites, status }`. `occupiedTiles` contains `"column,row"` strings; `pendingSprites` is zero because packing is immediate. Grid fields can be absent until a target is selected.
- `createBlankSheet(options = {})`: defaults are 8 columns, 4 rows, tile size 64, row height equal to tile size, border 1, name `extended-sheet`. Returns state; use `targetSheetPath` to reselect local targets.
- `selectTargetSheet(path?)`: accepts the dropdown path/local ID, or uses the active sheet if omitted. Returns state. Static sheets only. Detects occupancy from existing non-black pixels, metadata and tagged cells.
- `loadSourceImage(input)`: accepts File, Blob, ArrayBuffer, image data URL or blob URL; returns state. Coordinates refer to original source pixels, independent of CSS scaling. Loading a new source resets duplicate tracking.
- `isolateAt({ x, y, cutoff? })`: cutoff defaults to the UI input. Returns `{ ok: true, bbox: { x, y, width, height }, tileSpan: { columns, rows }, placedAt: { column, row } }`. Coordinates and cells are zero-based.
- `downloadExtendedSheet()`: triggers both browser downloads and returns `{ imageBlob, metadataBlob, metadata }`; image defaults to lossless WebP. Lossy export rejects when browser WebP encoding is unavailable; lossless export uses the local encoder.
- `on(event, handler)`: subscribes to detail objects; returns an unsubscribe function. Accepts names with or without `sse:`.

Window CustomEvents: `sse:source-loaded` (`{ width, height }`); `sse:isolated` and `sse:packed` (placement result); `sse:sheet-grown` (`{ previousRows, rows }`); `sse:downloaded` (`{ name, metadata }`); `sse:error` (`{ message }`). Events fire after the state is updated. Listen directly with `window.addEventListener` or use `sse.on`.

Limits: 16 megapixels per image, maximum dimension 16,383 pixels; up to eight composed targets totaling 32 megapixels per editor session. No automatic component enumeration or undo; retain the original source and download results regularly. Touching foreground shapes form one component.
