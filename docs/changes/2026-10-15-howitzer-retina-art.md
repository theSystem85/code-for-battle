# Howitzer retina art overhaul

- New self-propelled howitzer map art generated with Grok Imagine (one sheet: wide hull with an empty turret ring, wide boxy turret, barrel), source in `docs/asset-sources/howitzer-desert-spritesheet.jpg`, prompt in `docs/asset-sources/howitzer-desert-prompt.txt`.
- Desert sand paint with only a slight camouflage pattern; no green. The build script softens luminance contrast slightly (factor 0.85).
- A first green woodland version was rejected (too narrow, wrong camouflage) and replaced before merge.
- `docs/asset-sources/howitzer-build.py` keys out the blue background, composes the fixed turret onto the hull ring, widens the footprint by 12 % and rotates the base 180° losslessly to the renderer convention (front up). The barrel is flipped to muzzle-down and its breech/cradle section is cropped off.
- On-map footprint: 18.5 × 32 CSS px (old sprite 17 × 32, rejected green version 15.8 × 32, tank V2 hull 22 × 32).
- Sources: `howitzer_map.webp` 192×192, `howitzer_barrel.webp` 23×152. Prepared sprites only downscale: base 32/64/96 px, barrel 4×25 / 8×51 / 12×76 px for 1x/2x/3x.
- Anchors re-measured: base barrel mount (96.2, 18.8) at the turret gun stub, barrel mount (11.5, 0), muzzle (11.5, 152).
