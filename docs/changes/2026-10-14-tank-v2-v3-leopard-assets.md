# Tank V2/V3 Leopard 2A7-style image assets

- Regenerated the `tankV2` and `tankV3` hull (wagon), turret and gun barrel images in a photorealistic top-down Leopard 2A7 style.
  - Both keep the sand base coating; V2 has green camouflage blotches, V3 has red camouflage blotches.
  - All six parts came from one AI-generated sprite sheet (`docs/asset-sources/tank-v2-v3-leopard-spritesheet.webp`, prompt in `tank-v2-v3-leopard-prompt.txt`), keyed off a flat blue background and cut into separate transparent WebP files in `public/images/map/units/`.
- The new source images are 3x the old resolution (wagon 99/100x189, turret 106x138, barrel 11x115), so the prepared @2x/@3x sprites are no longer upscaled.
- Updated `src/tankImageConfig.json` for V2/V3:
  - `turretMountPoint` 19,32 -> 50,93 (turret ring center on the new hull)
  - `barrelMountPoint` 17,35 -> 53,184 (barrel rear starts at the turret mantlet)
  - `muzzleFlashOffset` 2,64 -> 5,115 (muzzle at the barrel tip)
- `scripts/build-prepared-sprites.mjs` now reads the tank anchors from `src/tankImageConfig.json` per variant instead of hard-coding the V1 values; prepared sprites were rebuilt with `npm run make:prepared-sprites`.
- Tank V1 is unchanged.

## Follow-up 2026-10-15: wider hulls

- Horizontally stretched `tankV2_wagon.webp` (99→129 px) and `tankV3_wagon.webp` (100→130 px) by 1.30× (premultiplied-alpha Lanczos, height 189 px unchanged, lossless WebP). No images were regenerated.
- Turret mount x scaled to keep the turret centered: V2/V3 `turretMountPoint` 50,93 → 65,93. The turret (106 px) no longer covers most of the hull; the tracks are visible on both sides.
- Rebuilt prepared sprites (`npm run make:prepared-sprites`). Render scale is driven by the wagon's max dimension (height), so in-game turret/barrel size is unchanged.
