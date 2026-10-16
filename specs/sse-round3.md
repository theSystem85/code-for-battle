# SSE round 3: bounded sprite placement

The standalone and in-game editors share the extend controller. Repository image assets remain read-only; export downloads new WebP and JSON. Lossless remains the default. Exported imports retain tags, per-sprite anchor, source size ratio, reserved span and relative fitted render rectangle. Export sprite pixel rectangles describe the actual fitted image, including after compaction.

The Anchor selector defaults to center and offers top-left, top-right, bottom-left, bottom-right, center and stretch. It sets the default and updates a selected sprite. Contain preserves aspect and never exceeds the requested scaled source dimensions or reserved inner area. Stretch fills the exact reserved area, including borders. Drawing clips to the reserved area as a final safeguard.

Source-to-target size ratio is a finite number in [0.05, 4], default 1. Both isolate and extract all calculate spans from rounded-up scaled source dimensions plus borders. Changes affect future imports. Retained source rasters have a 32-megapixel session budget, in addition to existing target budgets; they are keyed by target path and sprite ID.

Right-click and touch long-press open a resize dialog on an imported sprite. Any positive integer span smaller in at least one dimension, and no larger in either dimension, is accepted. Shrink keeps the top-left tile, contains original source pixels, blackens and releases old cells, and unions all prior cell/sprite tags into the remaining cells and sprite metadata. Stretch switches to center on shrink to preserve aspect. Reopened files use their current fitted raster as the best available source.

Creating a target or explicitly selecting one clears source isolated/mask mappings and redraws the source. Normal dropdown loads notify the controller after successful loading. A source sprite can then be imported again. Source overlays remain on the same canvas/transform as the source image.

All added UI operations use the documented window.__SSE__ methods and sse:* events in skills/extend-sprite-sheet/SKILL.md. Validation fails before editing occupancy. Context menus support Close and Escape. No HTML title attributes, top-level await or repository writes are added.

## Verification

- `npm run lint:fix:changed`: passed.
- `npm run lint`: passed.
- `npm run test:unit`: passed, 283 files and 5,043 tests, including both controller regressions (46.25 seconds).
- `npm run build`: passed. Generated prebuild commit metadata restored.
- `npx playwright test tests/e2e/sseExtend.test.js --project=chromium --reporter=list`: blocked because the configured development server cannot bind a port in this sandbox. A direct `npm run dev -- --host 127.0.0.1` confirms `listen EPERM` on port 5173.
- Controller canvas fixtures now cover both prototype contexts (parser-created canvases) and own instance contexts (the shared setup's document.createElement canvases). All behavioral assertions are retained.
- Live browser verification and qualifying-hardware performance measurements remain outstanding.

## Rendering scope and performance

Packing/redrawing runs on user actions, not simulation ticks or entity frames. Source overlays use the same transformed canvas; initial source display contains the full source. The existing animation preview draws one sprite per animation frame on a 128×128 backing canvas (DPR 1); at 75/120/144 Hz this is one sprite × DPR 1 × two scalar bounds per frame (150/240/288 bounds per second). Scalar containment now bounds both dimensions, without allocating helper objects or building variants in its frame loop. No game update/render code changes. Qualifying reference hardware and a live browser are unavailable here: 75 presented FPS, frame-time percentiles, GPU and memory measurements cannot be certified. The qualifying-hardware performance check remains outstanding; no fidelity/settings reduction is used.
