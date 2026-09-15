# Spec 081: Shoreline water/land layering

## Requirements

- Procedural water is rendered beneath shoreline transition art on every supported terrain path.
- Organic shoreline transitions render land material onto water tiles using the same feathered mask as biome transitions; they must not paint animated water over opaque land tiles.
- Water-hosted land/street SOT corner information contributes to the shoreline transition direction, so SOT corners follow the same layer order as cardinal shore edges.
- The CPU fallback, WebGL water-only path, and WebGPU water-only path preserve this order: water base/SOT first, static land/street terrain next, and the land shoreline transition above the water canvas.
- Integrated sprite-sheet water remains governed by its own tagged water art, while SOT handling must not reintroduce a second mismatched animated water layer.
- Water-hosted diagonal SOTs render after the cardinal land feather with their own material and alpha edge; street SOTs must use street art rather than the land underlay.
- Consecutive cardinal and diagonal shoreline segments share the same tile-space mask orientation and must not leave rectangular gaps or material swaps at joins.

## Validation

- Unit coverage verifies cardinal and SOT-driven land transitions target water tiles and that land tiles no longer receive the animated-water transition.
- Browser coverage should verify shoreline pixels remain land-material dominant at the transition edge while the adjacent full-water sample continues to animate.
- Browser coverage should verify a street-over-water SOT samples street material and that a horizontal/SOT/vertical sequence has no opaque land replacement at the diagonal.
