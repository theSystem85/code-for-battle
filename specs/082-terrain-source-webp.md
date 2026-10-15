# Terrain source WebP conversion

## Requirement

All raster source assets in `public/images/terrain/source` (runtime biome ground: meadow, soil, snow, sand) and `assets-src/terrain/` (build-only compiler inputs, moved out of `public/` on 2026-10-15 so they no longer ship) must use WebP with quality 85. Terrain compiler scripts must reference the WebP filenames, while generated atlas outputs remain unchanged.

## Verification

- Confirm the source directory contains no PNG raster assets.
- Run `npm run lint:fix:changed` and `npm run test:unit`.
