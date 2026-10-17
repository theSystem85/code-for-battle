# SSE isolation, extract all, removal and compaction

The standalone /sse editor provides matching UI and window.__SSE__ controller actions.

- Source isolation draws a light mask only on extracted foreground pixels and a bright pixel contour including holes. It is composited onto the original-sized source canvas on extraction/removal, inheriting exactly its existing CSS pan/zoom transform. It never changes source detection pixels or target export pixels.
- Pure detectSprites uses an inclusive black cutoff (default 16), transparent-pixel exclusion, eight-connected neighborhoods, a configurable gap radius (default one missing pixel, range 0–2), and minArea (default 2). Each component is copied with its interior: only background pixels connected to the component's bounding-box edge stay transparent, and every pixel the silhouette encloses (black windows, dark outlines, shadows) is copied with its original RGBA. Click isolation (`isolateComponent`) uses the same rule and reports the enclosed count as `holes`. Enumeration is source reading order. Previously extracted regions are skipped.
- Extract all packs each detected component through click isolation's shared packing controller and emits the same per-sprite events, followed by extracted-all.
- Imports have stable IDs, returned by isolateAt/extractAll and getState().sprites. Clicking a target placement or selectSprite(id) selects its covered cells. Remove sprite, Delete outside editable controls, and removeSprite(id) share the controller and clear every covered tile, occupancy, tags and metadata.
- Pure compactSprites sorts current placements by row then column and packs tile spans into first-free regions scanning left-to-right then down. compact() copies full tile pixels and relocates tags/rectangles, preserves IDs and reserves preexisting non-imported content. Target dimensions remain unchanged unless more rows are needed.
- Actions export only through downloads; repository sheets are never overwritten. Export remains lossless by default.

## Validation

Run npm run test:unit, npm run lint:fix:changed, npm run lint, npm run build, and npx playwright test tests/e2e/sseExtend.test.js --project=chromium --reporter=line.

Detection and packing are covered with synthetic pixels and mixed rectangular tile spans. Controller unit coverage verifies selection, full-span removal, Delete, tags/rectangle relocation and stable IDs. Browser coverage verifies UI/API parity, source segmentation, target pixels, removal, compaction, metadata and Delete.

All new processing runs on explicit editor actions. No simulation, animation-frame, entity rendering or gameplay hot paths change; no gameplay FPS certification is claimed.

## Results in this sandbox

- Offline dependency installation succeeded with npm ci --offline --ignore-scripts.
- Full unit suite: 282 files, 5037 tests passed.
- npm run lint:fix:changed and npm run lint passed.
- npm run build passed at unchanged version 0.55.0.
- SSE E2E execution was attempted but blocked before browser tests: the sandbox rejects listening on 127.0.0.1:5173 with EPERM. The extended browser test must run in an environment that permits a local development server.
- Runtime cutting from the final sheet never strips interior pixels: when sheet metadata with tile rects is available, the black key (`applyEdgeConnectedBlackKey`) only removes near-black pixels flood-connected to the image border, to pixels outside tile rects, or to tile edges (seams between tiles of the same `group_N` are not seeds). Decoration cutouts (`floodBorderBackground`) key only border-connected ground background. Sheets without tile metadata (explosions, animations) keep the legacy global key.
