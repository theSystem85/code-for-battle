- [x] **Improvement: Preserve original city sprite resolution**
  Repacked all 464 temperate, sand and snow city sprites at their original extracted dimensions, growing atlases and grouped footprints instead of resizing buildings.
  Spec: [Native source map assets and forests](../../specs/native-source-map-assets-forests.md)

- [x] **Bug: Saved sheet coordinates after native-size repacking**
  Reject stale saved metadata for each rebuilt city atlas; preserve layout version 3 on SSE export.
  Spec: [Native source map assets and forests](../../specs/native-source-map-assets-forests.md)

- [x] **Improvement: Reproducible asset workflow**
  Updated map-assets and extend-sprite-sheet skills with native-size packing, alpha extraction profiles, biome contracts, source provenance and validation commands. Builder supports category-specific regeneration.
  Spec: [Native source map assets and forests](../../specs/native-source-map-assets-forests.md)

Validation: extraction replay checks every city's source dimensions and exact alpha silhouette after WebP q85 encoding. Default-catalog generated-map coverage, city size gradient and registry tests pass (22 focused tests). Full `npm run test:unit`: 325 files / 5,381 tests passed. Expanded three-city stale-metadata checks: 11 registry tests passed. Chromium `mapSourceSheets.test.js` and `destructibleCityBuildings.test.js`: 2 passed. `npm run lint:fix:changed` and `npm run lint` passed. Larger buildings already use full grouped footprints, street-facing placement and central large-building lots; no render-loop resizing was introduced. Hardware 75 FPS acceptance remains pending on qualifying hardware; no software-GPU benchmark was run.
