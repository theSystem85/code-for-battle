- [x] **Feature: Tall desert cities with traversable upper artwork**
  Replaced the default desert city atlas with 20 newly generated native-size buildings, including eight skyscrapers, at WebP quality 85; all bases are at least 2×2 and towers at least 3×3, scaled against the 3×3 vehicle factory. Ground rectangles block movement while upper imagery projects over passable terrain. Hidden units retain HUDs, selection and click/drag interaction.
  Spec: [Desert city ground footprints and upper artwork](../../specs/desert-city-overhangs.md)

- [x] **Improvement: Repeatable tall-building asset workflow**
  Updated map-assets and extend-sprite-sheet skills with alpha settings, native-size packing, base/upper tags, prepared layer rendering, registry versioning and behavior checks. Added targeted atlas regeneration with `--name`.
  Spec: [Desert city ground footprints and upper artwork](../../specs/desert-city-overhangs.md)

Validation: `npm run test:unit` passed all 327 files / 5,395 tests. Production `npm run build` passed. Chromium `desertCityOverhangs`, `mapSourceSheets`, `destructibleCityBuildings` and `sseExtend`: 12 passed, including extracting all 20 new source sprites via SSE at original pixel dimensions and actual hidden-unit click/drag selection. `npm run lint:fix:changed`, `npm run lint` and test-ID checks passed. `npm run test` passed all 329 files / 5,481 unit and integration tests. All other `tests/e2e` files outside the four named above were skipped, including multiplayer and device scenarios; no GPU/performance tests were run. Hardware 75 FPS acceptance remains pending on Patrick's qualifying hardware GPU. No software-GPU performance benchmark was run.
