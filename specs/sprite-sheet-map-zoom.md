# Sprite sheet map zoom

`zoomFactor` is an optional positive finite JSON number, default 1. Missing or invalid legacy values normalize to 1. For a source prop occupying W×H atlas cells, runtime footprint is ceil(W×zoomFactor) × ceil(H×zoomFactor). The source image spans exactly W×factor by H×factor map tiles, centered in that rectangle; rounding must never stretch artwork to fill spare space. For example, 3×2 at 1.25 occupies 4×3 tiles with artwork 3.75×2.5; 3×2 at 0.4 occupies 2×1 with artwork 1.2×0.8. Factor 2 maps 1×1 to 2×2 and 2×2 to 4×4.

All three supplied city atlases use factor 2, including their matching urban props. Preserve atlas resolution, source extraction rectangles, import footprints and WebP quality. Zoom is a map placement/rendering property, not atlas repacking. Metadata import/export and saved selections retain it. Bump city metadata layout version to 4 so older local editor copies cannot undo the new default.

Prepare virtual map cells once during configuration. Sample contiguous source imagery directly; composite non-contiguous cells once at native resolution if necessary, within explicit memory bounds. Per-frame rendering consumes prepared source and destination rectangles without generating resized imagery. Each virtual cell preserves one draw, including rotated coastal art. Keep ordinary terrain cell semantics and unit occupancy formulas unchanged.

Runtime footprints govern placement, spacing, biome validation, impassability and the shared city building HP object. City extent and street branch density accommodate enlarged lots. Original source building size tiers retain the center/outskirts size gradient. Enlarged roadside props remain anchored to the first road ring, may extend outward to cover their larger footprint, and cannot cover roads, water, resources, bases or incompatible biomes.

Topology fingerprints and preparation signatures include normalized zoom, with omitted and explicit 1 equivalent. Existing host-only pregame topology rules and saved metadata handling remain in place.

Acceptance: all three city sheets at factor 2; fractional enlarge/shrink numeric and real browser pixel checks; no seams/overflow; whole building occupancy/destruction; SSE export round trip; all-default-sprite generated-map coverage using original source tile provenance; full unit/integration suites, relevant Chromium E2E, lint and production build. Qualifying-hardware 75 FPS acceptance remains pending here; do not run software-GPU benchmarks.
