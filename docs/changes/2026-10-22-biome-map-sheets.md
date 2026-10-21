- [x] **Feature: Default biome sprite sheets from transparent sources**
  Extracted 737 sprites from all five supplied sources with the SSE detector; packaged native-alpha WebP quality 85 plus full biome, category and grouped footprint metadata.
  Spec: [Extracted biome map sprite sheets](../../specs/extracted-biome-map-sheets.md)

- [x] **Improvement: City building size follows city radius**
  Replaced temperate city art, added sand/snow city art, and reserved central lots for larger buildings while preferring small buildings on outer streets.
  Spec: [Extracted biome map sprite sheets](../../specs/extracted-biome-map-sheets.md)

- [x] **Bug: Stale city metadata after atlas replacement**
  Discard old city-grid overrides and preserve the new atlas layout version when editing metadata in SSE.
  Spec: [Extracted biome map sprite sheets](../../specs/extracted-biome-map-sheets.md)

- [x] **Bug: Ruin starvation in an expanded decoration catalog**
  Give ruins a dedicated seeded pass and classify new stones as rocks so expanded catalogs do not crowd existing biome props out of valid sites.
  Spec: [Extracted biome map sprite sheets](../../specs/extracted-biome-map-sheets.md)

Validation passed:

- `npm run lint:fix:changed` and `npm run lint`.
- `npm run test:unit`: 325 files, 5,381 tests passed.
- `npm run test`: 327 files, 5,467 unit/integration tests passed.
- Focused Chromium: 13 tests passed across `sseExtend.test.js`, `mapSourceSheets.test.js`, `destructibleCityBuildings.test.js`, `integratedStartupSheets.test.js`, and `legacySheetStorage.test.js` (including a city SSE edit/export round trip).
- `npm run build`: production build passed.
- The unchanged default-catalog coverage assertion places every old and new sprite on generated maps. Source replay tests validate all five inputs and all 737 extracted components.

All E2E files other than the five listed above were skipped, including the hardware benchmark and multiplayer suites. Workflow: direct push to dev without an MR.

 Full unrelated Playwright and GPU/performance scenarios are excluded; focused SSE, default startup, legacy selection, city destruction and four-biome atlas tests cover the changed areas. Hardware performance acceptance is pending on qualifying hardware.
