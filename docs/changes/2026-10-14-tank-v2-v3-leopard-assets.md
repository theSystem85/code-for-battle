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
