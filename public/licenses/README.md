# Third-party notices

## web-ocean

The procedural water lighting in `src/rendering/oceanWaterShader.js` is inspired
by [Noniv/web-ocean](https://github.com/Noniv/web-ocean), revision
`a07c7fd522ef0a897601c114f927a49d93d95520`. Its `fresnelWater` function adapts
`js/wgsl/ocean.js`. The multi-scale wave slopes, anisotropic sun glitter,
Fresnel reflection and crest foam informed this game's top-down implementation.
The game's analytic waves and lighting do not implement the demo's FFT cascades,
3D ocean mesh, atmosphere, persistent foam maps or post-processing.

Copyright (c) 2026 Maksymilian Dendura.

The complete upstream MIT license is reproduced in
[web-ocean-MIT.txt](web-ocean-MIT.txt). Both files are distributed with the web
build under `/licenses/`. The project's own license is unchanged.
