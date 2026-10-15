# Tank sprite sharpness on retina screens

- [x] **Pixel-snapped tanks with a pre-rendered rotation cache** – tank centers snap to device pixels; 64 rotated frames per wagon/turret/barrel are pre-rendered at the device DPR (2x supersampled, high-quality smoothing) in idle slices after sprite preparation, with live rotation as fallback until ready. Spec: none
- [x] **2x mobile map ground** – `MOBILE_CANVAS_PIXEL_RATIO_CAP` defaults to 2; a step-down-only governor lowers terrain DPR by 0.5 (min 1x) after 3 s below min(75, display refresh) − 3 FPS. Spec: none
- [x] **Unit sprite encoding** – prepared unit/naval/aircraft sprites use WebP q95 with sharp-YUV (`smartSubsample`); buildings stay q85. Spec: none
- [x] **DPR variant loading** – runtime fetches only the prepared @1x/@2x/@3x variant for the overlay DPR (nearest higher variant for fractional DPRs, never the full-size source); tank source images are only fetched if preparation fails. Spec: none
- [x] **Bug: density listener** – `canvas-density-changed` handler read a non-existent `detail.density`, so DPR changes never swapped sprite variants. It now uses `overlayPixelRatio`, de-duplicates concurrent preparations and re-points the building/wreck renderers. Spec: none
- [x] **Tank V1 art** – Leopard 2A7 style matching V2/V3 (sand base, brown camouflage), wagon 129×189, turret 106×138, barrel 11×115; the barrel breech sits under the turret front exactly like V2/V3 (mount points copied from the V2/V3 layout). The howitzer keeps the old thin barrel as `howitzer_barrel.webp`. Spec: none

## Memory / timing (headless Chromium, software rendering)

| DPR | Rotation cache bytes | Build time (idle slices) |
| --- | --- | --- |
| 3 | 20.5 MB | 1.1–2.1 s |
| 2 | 9.2 MB | 1.3 s |
| 1 | 2.5 MB | 1.0 s |

## Performance

Headless Chromium (iPhone 14 Pro landscape emulation, DPR 3, 60 Hz capped, software GPU) during 5 s of scrolling: before 60.2 FPS / p95 16.8 ms, after 60.2 FPS / p95 16.8 ms. This environment cannot certify the 75 FPS gate; the qualifying-hardware check (real iPhone/Mac) remains outstanding.
