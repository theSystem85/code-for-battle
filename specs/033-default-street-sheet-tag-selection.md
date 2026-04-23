# Spec 033: Default Street Sheet Tag Selection

## Summary
Street tile rendering should default to the bundled `images/map/sprite_sheets/streets23_q90_1024x1024.webp` sheet and choose per-tile street art based on matching tag metadata.

## Requirements
- Add `streets23_q90_1024x1024.webp` to the static sprite sheet index so it appears in SSE/map sheet selectors.
- Street rendering must evaluate directional tags (`top`, `bottom`, `left`, `right`) against neighboring street tiles.
- A directional tile variant is valid only when all of its directional tags have corresponding street neighbors.
- When multiple candidates are valid, choose among tiles matching the highest number of valid directional tags.
- Street rendering should prefer tiles matching the active biome tag (`grass`, `soil`, `snow`, `sand`) when biome-tagged street candidates exist.
- Disable SOT rendering for tiles whose rendered base type is `street` (keep non-street SOT behavior unchanged).

## Acceptance Checks
- Streets render from the default `streets23` sheet even without enabling custom sheet mode.
- Directional street patterns visually connect according to orthogonal street neighbors.
- Biome selection influences street variant choice when biome-tagged street tiles are available.
- Street tiles no longer render SOT overlays; land/water-hosted SOT remains functional.
