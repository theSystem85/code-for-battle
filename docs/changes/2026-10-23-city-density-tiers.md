- [x] **Feature: Villages, towns and rare skylines**
  Added six 20-building low/medium city sheets for temperate, sand and snow, per-building density scores 1–10, and a low/medium/medium/high settlement cycle with denser centers and lower-density outskirts.
  Spec: [City density tiers and calibrated village buildings](../../specs/city-density-tiers.md)

- [x] **Improvement: Realistic small-building scale**
  Calibrated new low/medium imports at 0.5/0.75 relative to existing skyline art, recorded ratios in JSON, and gave the smallest houses 2×1 blocking bases with passable upper art. Retained source originals and updated asset skills.
  Spec: [City density tiers and calibrated village buildings](../../specs/city-density-tiers.md)

Validation: `npm run test:unit` passed 328 files / 5,403 tests; `npm run test` passed 330 files / 5,489 unit and integration tests. Chromium cityDensity, desertCityOverhangs, mapSourceSheets and destructibleCityBuildings passed all 12 checks, including six-source extraction, calibrated scale, 2×1 cottage bases, density rarity/gradient in all four biome contexts, HUDs, click/drag selection and destruction. Every bundled sprite has a placement path across default and eight-settlement maps. Lint, test-ID checks and production build passed. Packed low-density artwork was visually inspected. All Playwright files outside cityDensity, desertCityOverhangs, mapSourceSheets and destructibleCityBuildings are skipped. Hardware 75 FPS acceptance remains pending on Patrick's qualifying GPU; no GPU/performance benchmarks are run.
