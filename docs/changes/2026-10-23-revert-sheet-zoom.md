- [x] **Improvement: Restore city rendering before sheet zoom**
  Reverted a7d526b5 at the user's request, restoring city metadata, footprints, rendering and placement to the prior native-size atlas and natural forest implementation. Removed the zoom feature and its unreleased entry; retained prompt history.
  Spec: none

Validation: source, asset, builder, skill and test files exactly match 5e157870. Five focused Chromium tests passed across `mapSourceSheets.test.js`, `destructibleCityBuildings.test.js`, `integratedStartupSheets.test.js` and `legacySheetStorage.test.js`. All other Playwright files, including multiplayer and GPU benchmark suites, were skipped. `npm run test:unit` passed (326 files, 5,391 tests); `npm run test` passed (328 files, 5,477 unit/integration tests). `npm run lint:fix:changed` and `npm run lint` passed. Hardware performance verification remains pending on qualifying hardware; no GPU benchmark was run.
