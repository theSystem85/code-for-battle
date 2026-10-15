---
name: extend-sprite-sheet
description: Create or extend Code for Battle decorative and map sprite sheets from ungridded black-background source images using the Sprite Sheet Editor UI or its matching browser API.
---

# Extend a sprite sheet

Use this path for decorative map assets, including universal and biome decorations. Open **https://code-for-battle.netlify.app/sse** after deployment, or run `npm run dev` and open `/sse` locally. This dedicated page runs the editor without game boot. Existing in-game users can also open Map Settings → Sprite Sheet Editor.

1. Expand **Extend sheet / Import sprites**. Create a blank black target with columns, rows, tile width, row height and border, or select an existing static sheet and choose **Use current sheet as target**. Target dimensions must be whole grid cells. The main canvas always shows the target. Download important work before reloading; composed targets are session-local.
2. Upload the ungridded black-background source using **Source image**, or drop it on the extend panel/source pane. Dropping on the main target canvas retains the existing sheet/JSON import behavior.
3. Click once on each sprite in the separate **Source** pane. Adjust the near-black cutoff (default 16, range 0–255) if needed. Connected non-black pixels are isolated; disconnected pieces need separate clicks. Transparent/background clicks, single-pixel noise and duplicate imports are rejected. The same operation is available through the API below.
4. SSE packs into the first free grid region, reserves every covered cell and grows downward by whole rows when needed. Border is inside the cell pitch. Oversized sprites require a target with more columns. Do not implement separate packing outside SSE: user and agent must use the same flow.
5. Choose **Download target WebP + JSON**. Allow multiple browser downloads. WebP uses quality 0.85; JSON retains SSE grid/tags plus `extension.occupiedTiles` and `extension.imports`. Reopen an exported image and its JSON together using the existing target drop path to continue editing.
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

- `getState()` returns `{ mode: 'extend', targetSheetPath, sourceLoaded, tileSize, rowHeight, borderWidth, columns, rows, occupiedTiles, pendingSprites, importedSprites, status }`. `occupiedTiles` contains `"column,row"` strings; `pendingSprites` is zero because packing is immediate. Grid fields can be absent until a target is selected.
- `createBlankSheet(options = {})`: defaults are 8 columns, 4 rows, tile size 64, row height equal to tile size, border 1, name `extended-sheet`. Returns state; use `targetSheetPath` to reselect local targets.
- `selectTargetSheet(path?)`: accepts the dropdown path/local ID, or uses the active sheet if omitted. Returns state. Static sheets only. Detects occupancy from existing non-black pixels, metadata and tagged cells.
- `loadSourceImage(input)`: accepts File, Blob, ArrayBuffer, image data URL or blob URL; returns state. Coordinates refer to original source pixels, independent of CSS scaling. Loading a new source resets duplicate tracking.
- `isolateAt({ x, y, cutoff? })`: cutoff defaults to the UI input. Returns `{ ok: true, bbox: { x, y, width, height }, tileSpan: { columns, rows }, placedAt: { column, row } }`. Coordinates and cells are zero-based.
- `downloadExtendedSheet()`: triggers both browser downloads and returns `{ imageBlob, metadataBlob, metadata }`; image is WebP 0.85. A browser without WebP encoding rejects instead of silently exporting another format.
- `on(event, handler)`: subscribes to detail objects; returns an unsubscribe function. Accepts names with or without `sse:`.

Window CustomEvents: `sse:source-loaded` (`{ width, height }`); `sse:isolated` and `sse:packed` (placement result); `sse:sheet-grown` (`{ previousRows, rows }`); `sse:downloaded` (`{ name, metadata }`); `sse:error` (`{ message }`). Events fire after the state is updated. Listen directly with `window.addEventListener` or use `sse.on`.

Limits: 16 megapixels per image, maximum dimension 16,383 pixels; up to eight composed targets totaling 32 megapixels per editor session. No automatic component enumeration or undo; retain the original source and download results regularly. Touching foreground shapes form one component.
