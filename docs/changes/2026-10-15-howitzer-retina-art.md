# Howitzer retina art overhaul

- New PzH 2000-style self-propelled howitzer map art generated with Grok Imagine (single top-down render, front up, white background), source in `docs/asset-sources/howitzer-pzh-source.jpg`.
- Weathered sand camouflage with soft olive/light-sand blotches; turret at the rear of the hull, gun drawn on top pointing forward.
- Earlier versions were rejected before merge: green woodland (too narrow) and a wide desert version (turret too far forward, artificially stretched 12 %).
- `docs/asset-sources/howitzer-build.py` keys out the white background, cuts the gun tube (muzzle brake to mantlet) into the barrel layer, diffusion-fills the hull under the tube and keeps natural proportions (no stretch).
- The hull is 1.2 tiles long (`HOWITZER_MAX_DIMENSION = 38` in the prepared-sprite script and renderer) so it keeps natural proportions at ~18 CSS px width: on-map footprint 18 × 38 CSS px (tank V2 hull 22 × 32).
- Sources: `howitzer_map.webp` 240×240, `howitzer_barrel.webp` 14×150. Prepared sprites only downscale: base 38/76/114 px, barrel 2×24 / 4×48 / 7×71 px for 1x/2x/3x.
- Anchors: base barrel mount (119.7, 86.3) at the rear trunnion/mantlet, barrel mount (7, 0), muzzle (7, 150).
