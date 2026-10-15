# SSE sidebar, export and viewport

The standalone `/sse` editor creates named black target sheets with square grid cells using `newSheet({name,tileSize,cols,rows})`. Existing rectangular-grid API compatibility remains available through `createBlankSheet`.

Export downloads a new WebP and JSON pair, never writes existing repository assets, and defaults to genuine lossless VP8L encoding. Optional lossy quality is a percentage. The pure export module owns option validation, lossless encoding, compression inspection and metadata construction. Metadata includes grid, name, compression, tile tags, tile and pixel sprite rectangles, and extension occupancy/imports. Legacy export API aliases remain supported.

Clear mode supports click, shift-click and rectangle drag selection, with boundary markers and a count. Clearing fills whole selected cells black, removes tags/occupancy and invalidates intersecting sprite placements. All input coordinates are validated before mutation.

Wheel deltas pan each pane. Ctrl+wheel and two-touch pointer pinch zoom about the input centre; two-touch movement pans. The horizontal separator accepts pointer/touch dragging and keyboard arrows, retaining its bounded ratio in localStorage. The sidebar imports game styles and uses shared input, button, slider and section classes. Sheet information is portalled outside the sidebar stacking context, bounded to the viewport, and includes compression (unknown when not determinable).

All new primary actions share controllers with `window.__SSE__` and dispatch matching events documented in the skill.

## Verification

- `npm run lint:fix:changed`
- `npm run lint`
- `npm run test:unit`
- `npm run build`
- `npm run test:e2e -- tests/e2e/sseExtend.test.js --project=chromium --reporter=line`

No game simulation/render hot paths change. SSE transforms run on input events, once per wheel/pointer sample per pane, independent of game entity count and DPR. Selection draws only DOM cell boundaries on selection changes; no bitmap resize or new animation loop. Lossless encoding runs only on export with the existing 16-megapixel limit. This sandbox cannot certify 75 presented FPS on reference hardware; live qualifying-hardware verification remains outstanding. Browser E2E execution is blocked here by `listen EPERM` when Vite binds localhost; retain the spec for an environment permitting a local server.

Results in this sandbox: changed-file lint fixes and full lint pass; production Vite/PWA build passes at package version 0.55.0. The full unit suite passes 280 files / 5,034 tests, including exact RGBA WebP round-trip, export metadata/default options, complete-cell clearing and metadata removal, wheel/pinch anchoring, and persisted touch/keyboard divider resizing. E2E coverage was extended for the new-sheet/export controls, downloaded lossless image dimensions, clearing pixels/import records, information visibility and wheel panning; execution could not start because binding `127.0.0.1:5173` is denied by this sandbox.
