# 047 - Sprite Sheet Editor and Integrated Tile Rendering

## Summary
Add a new Sprite Sheet Editor (SSE) modal in Map Settings that allows tile segmentation and per-tile tag authoring on sprite sheets, then apply this metadata to an optional integrated sprite-sheet rendering mode used by both map editor and gameplay.

## Goals
- Add `Sprite Sheet Editor` button under Map Settings.
- Add SSE modal with existing modal styling conventions.
- Support per-sheet controls:
  - tile size (default `64`)
  - border width (default `1`)
  - add tags
  - one active tag radio selection
  - zoom controls: in, out, 100%, snap-to-canvas
  - grid visibility toggle
  - label visibility toggle
  - red tag overlay visibility toggle
- Support click and click-drag tile tagging on sheet canvas.
- Persist per-sheet metadata across sheet switches.
- Add `Apply tags` action that updates runtime metadata and exports JSON.
- Add `Apply current tag to all tiles` action.
- SSE runs fullscreen by default and does not expose maximize/non-fullscreen modes.
- Remove the top bar; place close action in sidebar bottom action row (left of apply).
- Remove canvas scrollbars and use right-click + drag panning with inertia (map-like navigation).
- Fit sprite sheet to canvas by default (`snap-to-canvas`) when opening/loading sheet.
- Use edge-to-edge layout with no extra gutters between sidebar and canvas; sidebar visual style follows main game sidebar.
- Red tile overlay highlights only tiles tagged with the currently selected active tag.
- Tag labels (when enabled) remain visible for all tagged tiles regardless of active tag selection.
- Applying tags immediately commits generated JSON into game runtime memory/state for next map regenerate/reload usage.
- Map Settings includes SSE biome selector (`soil`, `sand`, `grass`, `snow`) that defines preferred tag family for integrated land fill rendering.
- Integrated land tiles resolve strictly from the selected biome tag family (no generic passable/decorative fallback randomness).
- Integrated land tiles preserve legacy passable/decorative/impassable likelihood while resolving within the selected biome tag family.
- Tiles tagged with `<biome> + decorative` are used only for decorative land-class tiles of that biome, never for normal passable land.
- Add `rocks` to SSE default tag options for rock tile mapping.
- Integrated rendering falls back to legacy non-SSE textures per tile type (`land`, `street`, `water`, `rock`) when the required SSE tag bucket is missing.
- Add map setting checkbox for integrated sprite-sheet mode.
- Preserve passability semantics:
  - `impassable` blocks movement like current impassable behavior
  - `passable` and `decorative` remain traversable
- Keep current runtime tile-size/grid behavior unchanged, while storing normalization metadata with target `64` in exported JSON and warning on upscaling.
- Keep renderer cache invalidation chunk-based and compatible.

## Data Contract (SSE JSON)
```json
{
  "schemaVersion": 1,
  "sheetPath": "images/map/sprite_sheets/grass.webp",
  "tileSize": 64,
  "borderWidth": 1,
  "tags": ["passable", "decorative", "impassable", "street"],
  "columns": 8,
  "rows": 8,
  "runtimeNormalization": {
    "sourceTileSize": 62,
    "targetTileSize": 64,
    "scale": 1.0322580645,
    "requiresUpscale": true
  },
  "tiles": {
    "0,0": {
      "tags": ["passable", "grass"],
      "rect": { "x": 1, "y": 1, "width": 62, "height": 62 },
      "col": 0,
      "row": 0
    }
  }
}
```

## Integration Notes
- Runtime mode flag lives in `gameState.useIntegratedSpriteSheetMode`.
- Active metadata lives in `gameState.activeSpriteSheetMetadata` + `gameState.activeSpriteSheetPath`.
- `TextureManager` resolves map tile draw source from SSE tag buckets when mode is enabled.
- `MapRenderer` chunk cache redraw now also keys by integrated metadata signature.
- Occupancy map checks integrated tile tags and treats `impassable` as blocked.

## Acceptance Criteria
- SSE modal opens/closes from Map Settings and uses consistent modal visual language.
- Switching sheets loads immediately and preserves edits from previous sheet.
- Tagging supports click and drag; toggling same active tag on tile removes it.
- Grid and label visibility toggles work.
- Red tag overlay visibility toggle works.
- Zoom controls update canvas zoom and support snap-to-canvas + direct 100% reset.
- Apply-current-tag-all marks every segment tile with active tag.
- SSE opens in fullscreen with no top bar.
- Right-click drag pans canvas and continues briefly with inertia.
- Default opening scale matches fit-to-canvas scale.
- Changing active tag updates red tile overlay visibility immediately.
- After `Apply tags`, runtime uses freshly generated JSON without requiring SSE reopen.
- Applied tags export JSON and update runtime data.
- Mode checkbox switches between legacy and integrated rendering path.
- Changing SSE biome immediately updates integrated land tile selection to that biome-tag bucket.
- Decorative biome-tagged tiles are selected only when land-classification resolves to decorative at legacy distribution likelihood.
- Non-SSE decorative land fallback is allowed only if zero SSE candidates exist for `<selected-biome> + decorative`; do not mix SSE decorative and legacy decorative sources when SSE candidates are available.
- `rock` map tiles use `rocks` (or legacy `rock`) tag bucket when present, else fall back to legacy non-SSE rendering.
- Movement blocking matches existing behavior for `impassable` in integrated mode.
- No full-map forced redraw on each paint step; chunk-based invalidation remains in place.

## Follow-up (2026-04-15): Version B Animated Sprite-Sheet Editor
- SSE sidebar now has mode tabs:
  - `Static` (existing tile metadata workflow)
  - `Animated` (new animation sequence tagging workflow)
- Animated mode requirements:
  - Sprite-sheet selector lists assets from `public/images/map/animations` index.
  - Default animation tag is `explosion` (users can add more tags dynamically).
  - Tagging marks frame membership for animation sequences; frame order is left→right, top→bottom.
  - Canvas overlay displays white frame-number labels near bottom-left and reindexes immediately on sequence edits.
  - Sidebar preview panel renders selected-tag animation with play/pause, loop toggle, and duration/frame count display.
  - Applying animated tags immediately updates runtime animation metadata used by in-game destruction VFX.
  - Preview must render correctly for cached processed textures (no blank preview when tags are valid).
  - Grid overlay uses dashed lanes when border width is `0`; otherwise line width follows configured border width.
  - Sidebar remains scrollable without visible native scrollbar tracks and tag radio list remains fully reachable.
  - Border-width input must preserve literal `0` (not fallback to default), so dashed lane mode can be toggled reliably.
  - Action controls stay anchored at sidebar bottom while tag list remains visible above.
  - Preview button state returns to `Play` when non-loop playback reaches the end.
  - Static tab must never show animated preview output; preview is exclusive to Animated tab.
  - Editor supports independent row-height configuration (`rowHeight`) separate from tile width (`tileSize`).
  - Whenever a sprite sheet is loaded (both Static and Animated modes), show its image resolution directly below the sheet selector and provide an `(i)` info bubble that opens on hover/click to display full image metadata in a popover.
  - Static mode must always fully disable animated preview rendering/RAF updates (no visible preview and no hidden background animation work).
  - Animated preview RAF loop may only run while the SSE modal is open in Animated mode, so gameplay framerate is not reduced when SSE is closed.
  - Metadata popover should open to the right of the `(i)` button and stay readable near viewport edges (no side clipping).
  - Animated preview panel must include a `Background` checkbox beside `Loop`; when enabled, preview renders on a grass-like map tile backdrop so black-key transparency/additive blend quality can be inspected in-map context.
  - Metadata popover must render above the SSE workspace/canvas layer (no clipping behind/right of sidebar due stacking context).
  - Static mode must hide animated preview panel using effective `display: none` behavior.
  - SSE canvas accepts drag-drop image files in both Static and Animated modes, adds dropped images to current-mode selector list in-browser only (non-persistent), and auto-selects/loads dropped image immediately.
  - Dropped image paths (blob/data URLs) must animate in preview after tagging; animation instance creation/texture loading cannot rely exclusively on filename-encoded metadata for such temporary assets.
  - `Apply current tag to all tiles` must behave as a toggle: when all tiles already contain active tag it switches to remove mode and removes that tag from all tiles.
  - Runtime map rendering of sprite-sheet explosions must visually match SSE preview blending (no dark/black aura fringe) by using equivalent additive draw characteristics.
  - Bundled destruction VFX defaults must boot from `public/images/map/animations/explosion.webp` plus `public/images/map/animations/explosion.json` at startup, so the tested sidecar metadata drives explosions even before the SSE modal is opened or `Apply tags` is clicked in the current session.
  - SSE metadata now includes `blendMode` with values `black` or `alpha`; `black` removes near-black backgrounds for sprite-sheet-backed map tiles and keeps additive animation rendering, while `alpha` uses the source image's native alpha channel with normal source-over compositing.
  - Map Settings label for the integrated runtime toggle is now `Custom sprite sheets`.
  - When custom sprite sheets are enabled but the active SSE metadata contains no `water` tag bucket, runtime water must continue to fall back to the default procedural water renderer.
  - Integrated `rock` tiles with transparent custom sprites must render over a land underlay so the cleared background reveals terrain instead of empty black.
  - When custom sprite sheets are enabled without any tagged SSE water tiles, the renderer must keep the legacy GPU procedural-water appearance rather than downgrading to the CPU-only fallback look.
  - In that GPU water-only fallback mode, water SOT/coastline smoothing must remain enabled on the 2D pass so coast edges match the normal non-custom rendering.
  - When SSE `water` tags are present, integrated mode must render those tagged water tiles through the SSE path instead of switching back to the legacy GPU procedural terrain path.
  - When no SSE `water` tags are present, the top 2D terrain canvas must not repaint opaque water base tiles over the GPU procedural-water fallback underneath.
  - When SSE `water` tags are present, water SOT/coastline overlays must also render from clipped SSE water tiles, not from the procedural water renderer.
  - When SSE `water` tags are absent and the GPU procedural-water fallback is active, the top 2D terrain pass must also skip water SOT/coastline overlays so no polygonal water artifacts remain above the GPU water layer.
  - Integrated runtime tile selection must compose all enabled static sprite sheets that provide tagged tiles; for any requested tag, candidates from every enabled sheet are pooled so selection can mix variants across sheets deterministically.
  - Sheets without any tagged tiles must be excluded from runtime loading/candidate pools to reduce memory usage.
  - Static metadata precedence is: localStorage sidecar override first, bundled sidecar JSON fallback. In active multiplayer sessions, runtime must bypass local overrides and use bundled sidecar metadata only.
  - Map Settings must expose a per-sheet checkbox list (visible only when `Custom sprite sheets` is enabled) to control which static sheets are eligible at runtime; list viewport is capped to 5 visible rows with scrolling.
  - When tags are applied to a non-default sheet uploaded on-the-fly (e.g. dropped blob/data/local-upload path), that sheet must also appear in the same checklist, be auto-selected by default for runtime, and contribute tagged candidates to integrated map rendering.
  - Tagged metadata from those uploaded on-the-fly sheets must remain available for integrated runtime composition even after checklist toggles/re-applies in the same session (not just on the initial apply callback).
  - Integrated runtime image loading must treat `blob:` and `data:` sheet paths as direct URLs (no leading `/` rewrite), so uploaded sheet images can actually be decoded and rendered.
  - Whenever the `sprite sheets to use` checklist changes, the map must fully rerender by recomputing the SOT mask and invalidating all terrain chunks before the next frame.
  - For on-the-fly uploaded sheets in that checklist, the UI label must show the uploaded filename/display name (e.g. `my_sheet.webp`) rather than the raw `blob:`/`data:` URL string.
  - In that same no-water GPU fallback mode, the WebGL water-only batch must not emit clipped water-SOT triangle instances either; it should render only unclipped procedural water tiles.
  - The no-water GPU fallback must apply that water-SOT suppression in the active base-layer path too, not only in the overlay-only path; any SOT that would render into water must be skipped there.
  - That suppression must stay host-aware: skip SOT hosted on water tiles in the no-water fallback, but preserve land/street-hosted `type: water` SOT so coastline smoothing still appears against other terrain.
  - In the no-water custom-sheet fallback, those preserved `type: water` coastline SOT triangles must be rendered by the WebGL water shader, not the 2D procedural-water routine, so they visually match adjacent procedural water tiles.
  - Because those coastline `type: water` triangles come from the GPU underlay, the top 2D pass must cut that triangle out of the land/street base tile instead of repainting over it.
  - SSE drag/drop import must also accept JSON metadata files and apply the imported tag payload to the currently loaded sheet immediately (same schema as `Apply tags` export).
  - Static-mode import uses `tiles` tag assignments directly; animated-mode import must support exported animation metadata by reconstructing tile tag membership from frame indices/rects.
  - After JSON import, tag radio list, canvas overlays, animated preview, and runtime callbacks must refresh instantly without reopening SSE.
  - SSE sidebar must include a `Reset all tags` action that clears all current tile-tag assignments for the active sheet while keeping tag definitions available.
  - On mobile SSE modal layouts, the sidebar must support swipe-left hide and swipe-right reveal parity with the main game sidebar; when hidden, a bottom-left menu toggle button reopens it and the spritesheet canvas/workspace expands to full modal width.
  - Mobile/touch SSE must support tap-drag tile painting on the spritesheet canvas (same behavior parity as desktop click-drag painting), keep the menu-toggle hidden whenever the sidebar is expanded, and add safe-area-aware top/bottom sidebar padding to avoid iOS/browser bar overlap.
