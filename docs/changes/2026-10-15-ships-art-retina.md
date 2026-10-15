- [ ] **Improvement: Retina ship art for destroyer, battleship and aircraft carrier**
  New Grok Imagine art (sources, prompts and the processing script in `docs/asset-sources/ship-*`). The map sprites are cropped to the visible hull and authored at the exact DPR 3 backing size, so the prepared 3x sprite is 1:1 and 2x/1x are downscales. Nothing is upscaled at any pixel ratio any more (before: the carrier's 256 px source was drawn at 899 px at DPR 3).
  - Prepared sprite definitions use a new `target.nativeDensity: 3` (logical size = source / 3).
  - On-map visible length is unchanged: destroyer 111.7, battleship 198.8, carrier 284.3 CSS px. Collision (`NAVAL_RENDER_LENGTH_TILES`) is unchanged. `NAVAL_SPRITE_LENGTH_TILES` gives the tight sprite length for the unprepared fallback and the sinking wreck.
  - Battleship turret layout re-measured from the barbette rings (tiles, + = bow): foreOuter 2.229, foreInner 1.637, aftInner 0.992, aftOuter -2.16 (was 1.6 / 0.95 / -1.8 / -2.42). aftInner is now a superfiring forward turret (initial heading forward). The bow ring had a baked-in mount and was retouched to an empty ring.
  - Battleship turrets have three barrels (Iowa-like), drawn under the turret roof so recoil slides into the gun ports. Salvo damage is unchanged (3 x 52 instead of 2 x 78); a salvo still costs 2 ammunition (the third shell is free).
  - Destroyer gun anchor re-measured on the new forward gun mount.
  - Aircraft carrier mirrored so the island is on the port side; the four parking slots stay on the clear starboard deck (unchanged).
  - Build buttons are unchanged.
  Visual check: Playwright headless Chromium at DPR 1 and 3, old vs new crops. Real-device check outstanding.
