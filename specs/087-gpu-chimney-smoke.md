# Spec 087: Prepared chimney smoke sprites

## Goal
Keep the soft chimney plume, and stop rebuilding a radial gradient for every puff on every frame.

## What was slow
`EffectsRenderer.renderSmoke` walked `gameState.smokeParticles` and, for each visible puff, called `createRadialGradient` plus `arc`/`fill`. A normal chimney puff did this twice (body and core). Fire and heavy-damage shade added a third and fourth gradient. `MAX_SMOKE_PARTICLES` is 300, so a full budget was up to 600–1200 gradient paints per frame. The paints do not batch: each gradient is a unique fill, and the raster cost grows with puff area and canvas DPR.

`updateSmokeParticles` is a small per-particle integrate (wind, rise, growth, fade) over that same cap. It is not the expensive part. Emission rate, wind, lifetime, and the 300-particle cap are unchanged.

## Approach
Prepare three 128×128 sprites once (smoke with its core, flame, shade). Each frame, sample them with `drawImage` at the puff's current radius. The source image is not rebuilt and the radius is not quantized into size buckets. The browser uploads each sprite once and textures the quads.

A WebGL2 instanced quad pass was implemented and linked (`LINK_OK`, WebGL 2.0). It was not kept. Smoke has to composite above buildings on the 2D entity canvas, and blitting the WebGL canvas back onto that layer measured slower than the gradients it replaced (headless Chrome, SwiftShader, 640×360, 300 puffs: about 6.9 ms/frame versus 1.49 ms for the gradients) because the copy reads the framebuffer back.

If sprite preparation fails, the original gradient loop remains as `renderSmokeProcedural`.

## Measured
Headless Chrome with SwiftShader. This is not a 75 FPS certification. The display path cannot present 75 Hz, and qualifying-hardware scrolling with factories and power plants is still outstanding.

Isolated smoke pass, 300 puffs, logical 800×450, context scale 2 (backing 1600×900), radii 4–10.4 (in-game chimney range), 40 frames after 3 warmups:

- Procedural smoke + core gradients: 0.908 ms/frame
- Prepared sprite: 0.302 ms/frame
- About 3.0× less time in the smoke pass

Same host at 1280×720 with larger radii 14–29: gradients 0.907 ms/frame, sprites 0.310 ms/frame, about 2.92×.

Center pixel of one radius-16 puff at alpha 0.75, DPR 2: gradient `[64,64,64,152]`, sprite `[64,64,64,144]`. RGB matches. Alpha differs by 8/255.

Resident sprite bytes: `3 × 128 × 128 × 4 = 196608`, reported on the effects byte owner. After the first prepare, the three canvases keep their identity. A chimney puff is one `drawImage`. Flame and shade add a draw only when that puff has fire or shade.

## Visual notes
- Smoke stops and the 0.4 core overlay match the old paint for puffs whose radius is at least 4. Below that, the old core used a 1px minimum; the sprite keeps a 25% core.
- Flame uses the fire=1 stops and is scaled by the puff's fire intensity. Chimney smoke has no fire, so this does not change refinery or power-plant plumes.
- Wind, rise, growth, fade, and shadow-of-war culling are unchanged.

## How to verify
1. Start a match and build power plants and ore refineries. After construction finishes, gray plumes should rise from the chimneys and drift with the wind.
2. In the console, `gameInstance.renderer.effectsRenderer.gpuSmoke.backend` should be `prepared-sprite` once smoke has rendered.
3. Optional budget run: `PERF_CHIMNEY_SMOKE=1 npm run test:e2e:file -- tests/e2e/buildingChimneySmokePerformance.test.js`. The log includes `smokeBackend` and `smokePresents`.
