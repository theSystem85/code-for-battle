# Native source map assets and natural forests

User request: preserve source sprite pixel dimensions in all recently generated city and nature atlases, increase trees and form natural forests with occasional isolated trees. Deliver city and nature changes as separate dev commits.

## Atlas contract

Use the existing SSE detector, ownership guides, packer and exporter. Copy each isolated RGBA raster at scale 1 without resize. Source alpha thresholding remains necessary for the supplied noisy sources; preservation means the detector's accepted source pixels, not background noise. Reserve enough 64 px cells for the full raster plus a two-pixel minimum inset and grow canvas rows. Every import records original bbox, target renderRect, footprint and provenance. Encode WebP q85 with lossless alpha. Compare all dimensions and alpha silhouettes against extraction replay; validate no overlapping groups, bounds, biome/passability/category tags, and placement paths for every bundled sprite.

Cities: rebuild temperate, sand and snow sheets first (153/157/154 sprites), preserving original art and groups, using layout version 3 and rejecting older metadata overrides. Existing street-based grouped placement must support expanded footprints and central larger buildings. Nature: rebuild sand and snow sheets next (155/118 sprites), with the same contract and metadata invalidation.

## Forest contract

Generate deterministically during layout preparation, never during rendering. Forests have irregular outlines, branching lobes, varied density, softer sparse edges and clearings. Distribute matching-biome forests across available land, with a low probability of isolated trees outside them. Give trees a denser dedicated placement pass with footprint-aware overlap rejection and variety; farm orchards remain controlled by farm clusters. Preserve existing city/ruin, coast, road buffers, biome, resource/start/base and narrow-passage constraints. Respect all passability and multiplayer/save/topology contracts.

## Acceptance

Extraction pixel/dimension audit for all 737 sprites; default-catalog placement coverage; deterministic forest density/clearings/isolated-tree and full-footprint constraint tests; full unit and combined unit/integration suites; focused Chromium SSE, startup, city destruction and atlas loading tests; lint and production build. Full unrelated E2E scenarios may be excluded with exact files recorded. No hardware GPU is verified here, so 75 FPS acceptance is pending on Patrick's qualifying hardware; do not run software-only performance benchmarks.
