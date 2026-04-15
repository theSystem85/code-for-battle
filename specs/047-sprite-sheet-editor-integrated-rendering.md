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

## Follow-up (2026-04-15): Version B Animated Sprite-Sheet Editing
- Add mode tabs in SSE sidebar:
  - `Static` (existing map tile tagging workflow / Version A)
  - `Animated` (new animation frame tagging workflow / Version B)
- Animated mode must:
  - list sheets from `public/images/map/animations`
  - default to tag `explosion` while allowing dynamic user-added tags
  - treat each selected tag as its own ordered frame sequence (LTR, top-to-bottom indexing)
  - show per-frame sequence numbers in overlay labels (bottom-left) for the selected tag and keep sequence numbers contiguous after edits
  - show preview panel with play/pause, loop toggle, and computed duration
  - drive preview from currently selected tag radio option
  - refresh preview automatically when selected tag or tagged frames change
  - apply generated animation metadata instantly to runtime when user presses `Apply tags`
