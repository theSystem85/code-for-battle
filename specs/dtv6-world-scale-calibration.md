# dtv6 world scale calibration

The eight dtv6 generated sources represent objects at illustration scale; their original pixel sizes are not compatible with map objects. Rebuild all 236 sprites from their original sources using SSE's real alpha detector/packer/exporter, with explicitly reviewed per-prop import ratios. This request supersedes ratio-1 import requirements for these eight targets only. Retain source originals, all semantic tags, all sprites and existing low/medium city calibration.

## Reference sizes

The map grid is 32 px; the source atlas grid is 64 px. The vehicle factory is 3×3 map tiles / 192×192 atlas px. Existing dtv4 tree median widths are about 65 px and dtv5 cottage widths about 112–128 px. Use reference bounds authored after visually reviewing every source, recorded in `scripts/map-prop-calibration.mjs` and assigned by the reviewed prop order. Different kinds of objects on one source require different ratios. A sheet-wide factor cannot keep a crate, tree and farmstead correctly scaled.

For each SSE-isolated component, calculate `min(1, referenceWidth / sourceWidth, referenceHeight / sourceHeight)`, round both dimensions after applying that one scalar, then resize its isolated RGBA pixels once with Sharp during atlas creation. This preserves aspect ratio. Reserve `ceil((dimension + 4)/64)` tiles, center the image with at least 2 px inset and grow the atlas as necessary. Never stretch into the reserved footprint. All resulting widths/heights stay below the factory's 192 px size; this is a reference for this catalog, not a global future maximum.

Record `source.packing.scale: "per-sprite"`, every import's `sizeRatio`, `referenceSize`, original source `bbox`, final `renderRect`, tile span and placement. Existing source hashes and extraction settings remain unchanged. Tag every new footprint cell and propLayout group with the same original biome/season/category/passability/group identity. Keep land/water crossing groups at least two columns wide. Current settings produce approx. 0.15–0.64 ratios; see the full [236-prop size report](../docs/asset-reports/2026-10-24-dtv6-scale-calibration.md) and [map-scale comparison](../docs/asset-reports/dtv6-map-scale-comparison.webp).

## Metadata compatibility and runtime

Bump the eight built-in dtv6 layouts to version 2. Reject version-1 applied/editor overrides, cached runtime overrides and saved topology metadata; load the calibrated bundled sidecar instead. Preserve valid version-2 edits and custom unrelated sheets. These checks run when configuring/loading sheets, never per simulation tick or frame. Continue preserving a saved topology fingerprint during restoration.

No runtime sprite scaling or zoom is added. All resampling happens offline in the builder. Existing final-DPR preparation, byte budgets, complete-footprint biome/resource/road/base validation, coast rotations and forest formations remain unchanged. Smaller footprints can fit more natural forest props without modifying the density algorithm. Both alpha and q85 WebP compression remain supported.

## Validation

Replay all source extraction and compare packed alpha pixels against independent reference-bound resizing of each component. Verify recorded factors, exact resized dimensions, footprints, original source hashes, no overlapping placements, all tags, source preservation, alpha blending and quality metadata. Check real object ratios: cars/crates/boats are smaller than cottages, individual trees match existing nature, and farm/ruin landmarks fit the factory reference. Generate maps across all biomes and observe every default sprite. Check stale local/saved/applied version-1 metadata falls back to fresh sidecars and valid current edits survive. Browser SSE must load/export all eight calibrated sheets with unchanged counts and tags, and actual map placements must use those smaller spans.

Run required unit/integration and focused Chromium functional coverage plus lint/build. No frame/render loop or entity scan changes are introduced. Hardware 75 FPS acceptance remains pending on Patrick's qualifying GPU; do not run graphics benchmarks on software rendering.

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Scale | Inspect the eight rebuilt atlases beside the factory/cottage comparison | Trees, equipment and small props have compatible relative size; all 236 props remain | 2: U05433, U05456 | 1: E00227 |
| T02 | Real maps | Generate all four biome contexts with coasts/roads | Smaller footprints, biome-matching forests/shore, no oversized bodies | 1: U01221 | 1: E00228 |
| T03 | Compatibility | Load v1 cached/editor/applied/saved overrides, then valid v2 edits | Stale coordinates fall back to current sidecars; valid edits survive | 2: U05455, U05457 | 1: E00227 |

- [x] T01 Source replay and visual comparison
- [x] T02 Real map catalog coverage
- [x] T03 Unit metadata compatibility checks
- [x] Browser, full-suite and build acceptance recorded in the change note
- [ ] Qualifying-hardware 75 FPS acceptance by Patrick
