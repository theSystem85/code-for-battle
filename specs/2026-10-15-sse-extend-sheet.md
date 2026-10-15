# Standalone Sprite Sheet Editor and extend-sheet workflow

## Feature contract

Version 0.55.0 adds `/sse` in development, preview and Netlify production. `sse.html` mirrors the existing modal markup and imports only `src/sseApp.js`, editor CSS, storage and the existing editor module. It never imports `main.js`, the game orchestrator, unit maps, texture-manager preload or map generation. Initial editor loading may fetch sheet indexes, the selected sheet/metadata and the animation preview background. The game modal remains available. Vite has an explicit multi-page input and pretty-route rewrite; Netlify redirects precede the SPA fallback. The service worker uses the precached editor document for SSE navigation fallback.

SSE-only styles live in `styles/spriteSheetEditor.css`, shared through `styles/overlays.css` and the standalone entry. The standalone document duplicates the existing modal DOM; future structural editor changes must update both documents. No HTML title attributes are introduced.

## Composition

The Extend sheet panel creates a session-local black static target or selects the current static sheet. Columns/rows, tile width, rectangular row height and interior border are configurable. Existing grid settings are respected. The target must have whole-cell image dimensions; changing grid settings requires target reselection to rebuild occupancy.

Source uploads and drops use `loadDroppedFiles(state, files, { source: true })`, sharing image classification with existing target/JSON drop handling. Source drops are explicitly scoped to the extend panel/source pane. Main-canvas drops keep existing behavior. Source and target remain separate, clearly labeled canvases.

Isolation is a four-connected flood-fill of pixels with alpha greater than zero and `max(r,g,b) > cutoff`, default 16, configurable 0–255. Only the clicked component is copied into a tight bounding box; holes/unconnected pixels stay transparent. Background, invalid coordinates and components below two pixels are rejected without target mutation. Repeating a component bounding box within the same source load is rejected. Touching shapes form one component; disconnected sprite details require separate clicks. No art generation, automatic enumeration, undo or LLM tagging is included.

Packing scans row-major over free axis-aligned cell rectangles. Cell pitch equals tile width/row height; borders are inset, not extra cell spacing. A sprite reserves `ceil((width + 2*border)/tileWidth)` by `ceil((height + 2*border)/rowHeight)` cells and is drawn at the region origin plus border. All reserved cells remain occupied even if some pixels are black. Existing target pixels above brightness 16, metadata occupancy and tagged cells reserve their cells. Growth adds whole rows; sprites wider than the target fail clearly. No scaling, rotation or art degradation is used for packing.

Each source/target is capped at 16 megapixels and 16,383 pixels per dimension. Composed targets have a session budget of eight targets and 32 megapixels total. Replacements/growth are checked before allocation. This bounds retained composition canvases to 128 MiB plus source canvas/pixels (up to 128 MiB), existing editor backing canvas and transient decoding/flood-fill/export buffers. Browser decoders may allocate before image dimensions are available. Heavy processing is event-driven and synchronous; large sources can briefly block the editor. Download before reloading: targets are session-local, not persisted image assets.

Download produces two files named from the target label: WebP at quality 0.85 and JSON. A missing WebP encoder is a visible error. The API also returns both Blobs. The JSON retains existing SSE schema, grid, tags and tiles, adding `extension.occupiedTiles` and `extension.imports` (bounding boxes, spans and placements). Drop the exported image and JSON together onto the target canvas to continue. LLM JSON tagging happens after download, outside SSE.

## Agent interface

`window.__SSE__` is installed by `initSseExtend` for standalone and in-game editors. UI actions call this same controller. Await mutations sequentially; coordinates are original source image pixels and zero-based.

- `getState()` returns mode (`extend`), targetSheetPath, sourceLoaded, tileSize, rowHeight, borderWidth, columns, rows, occupiedTiles (`column,row` strings), pendingSprites (0), importedSprites and status.
- `createBlankSheet({ columns=8, rows=4, tileSize=64, rowHeight=tileSize, borderWidth=1, name='extended-sheet' }={})` returns state.
- `selectTargetSheet(pathOrId?)` returns state, selecting the supplied path or adopting the current sheet.
- `loadSourceImage(File|Blob|ArrayBuffer|imageDataURL|blobURL)` returns state. Remote URL strings are rejected.
- `isolateAt({ x, y, cutoff? })` returns `{ ok: true, bbox: { x, y, width, height }, tileSpan: { columns, rows }, placedAt: { column, row } }`.
- `downloadExtendedSheet()` triggers image and JSON downloads and returns `{ imageBlob, metadataBlob, metadata }`.
- `on(event, handler)` passes event detail and returns unsubscribe; event names accept an optional `sse:` prefix.

Window CustomEvents: `sse:source-loaded` (`width,height`), `sse:isolated` and `sse:packed` (placement result), `sse:sheet-grown` (`previousRows,rows`), `sse:downloaded` (`name,metadata`), `sse:error` (`message`). API failures reject and report status/errors. The skill at `skills/extend-sprite-sheet/SKILL.md` documents the matching user/agent workflow and production entry.

## Validation and performance scope

No simulation tick, game render loop or selected-unit overlay is changed. New pixel scans, allocations and packing run only on explicit editor actions, once per image/import. Existing editor drawing remains event-driven; source display adds one static canvas. No game FPS certification is claimed or needed for a game hot-path change in this task. Qualifying-hardware FPS checks remain unperformed in this dependency-free sandbox.

Reproducible operator commands:

```sh
npm ci
npm run lint:fix:changed
npm run lint
npm run test:unit
npm run test:e2e -- tests/e2e/sseExtend.test.js tests/e2e/spriteSheetEditorDrop.test.js --project=chromium
npm run build
npm run preview
# Open /sse and /sse/ on the preview server; confirm editor-only requests.
```

Unit coverage: distinct synthetic components, bounding box/transparent holes, cutoff boundary, invalid clicks, rectangular/bordered spans, occupancy, row growth, size rejection and offline editor shell selection. E2E coverage: dedicated route with no game canvas/loading screen or heavy unit requests; create target through UI; drop synthetic source with two ungridded blobs; isolate through UI and API; verify shared occupancy/growth/events; verify two downloads and JSON contents.

Sandbox results: version generation succeeded; All seven new helper test cases passed under a dependency-free Node assert adapter; this does not replace Vitest. A static traversal of the standalone entry covered 19 JS modules and found no game entry/orchestrator/texture manager/unit-image/map-generator imports. Supplemental style/no-undef checks passed for all 11 changed JS files using the system runner and the repository’s explicit style rules. `npm run test:unit` could not start (`vitest: not found`). `npm run test:e2e -- tests/e2e/sseExtend.test.js tests/e2e/spriteSheetEditorDrop.test.js --project=chromium` could not start (`playwright: not found`). `npm run lint` found only system ESLint 6.4.0, which cannot load the repository's flat config. `npm_config_offline=true npm run lint:fix:changed` could not resolve the required ESLint from cache. The build command could not start Vite (`vite: not found`); its incidental generated commit-info change was removed. Skill validation could not run because Python PyYAML is absent; frontmatter was inspected manually. Dependencies were not installed because networking is disabled. Supplemental system-linter formatting and Node syntax/helper checks do not replace the operator checks above; live UI, build and browser verification remain outstanding.
