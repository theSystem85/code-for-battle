- [x] **Feature: Tall temperate and snow cities**
  Replaced the default grass/soil and snow city sheets with 20 newly generated native-size buildings each, including eight skyscrapers per set. Physical bases block movement while upper floors hide passing units without hiding HUDs or preventing selection. Snow artwork carries winter tags.
  Spec: [Temperate and snow tall city replacements](../../specs/temperate-snow-city-overhangs.md)

- [x] **Improvement: Consistent city asset generation**
  All three city sources share the SSE alpha profile, extraction-count validation, native-size packing and layout version 5. Expanded asset skills and browser coverage to all four biome contexts.
  Spec: [Temperate and snow tall city replacements](../../specs/temperate-snow-city-overhangs.md)

Validation: production build, `npm run lint:fix:changed`, `npm run lint` and test-ID checks passed. Chromium desertCityOverhangs, mapSourceSheets, destructibleCityBuildings and sseExtend: 18 passed across sand, grass, soil and snow, including actual native-size SSE extraction, opaque upper-floor path crossings, HUDs, click/drag selection and destruction. Both packed atlases were visually inspected. `npm run test:unit` passed all 327 files / 5,395 tests. `npm run test` passed all 329 files / 5,481 unit and integration tests. Hardware 75 FPS acceptance remains pending on Patrick's qualifying GPU. All Playwright files outside desertCityOverhangs, mapSourceSheets, destructibleCityBuildings and sseExtend are skipped; no GPU/performance benchmarks are run.
