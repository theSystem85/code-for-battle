# Water style controls and update notice layout

## Graphics controls

- A checked-by-default **Use new ocean water rendering** checkbox selects the ocean-inspired GPU shader. Unchecking it selects the original procedural GPU shading without reloading or rebuilding terrain geometry.
- Selection is a persisted preference. The actual renderer uses classic shading automatically when adapter metadata identifies software/fallback rendering or cannot establish hardware availability. CPU rendering keeps the existing classic Canvas2D pass. Hardware detection happens once per context/adapter initialization, not per frame; context restoration rechecks it.
- Three main sliders apply to both styles: **Water view height** (0.5–20x), **Wave strength** (0–200%), and **Animation speed** (0–300%, zero freezes water animation). Tone and saturation remain separate existing color sliders.
- View height reuses `waterEffectZoom`, with `height = 1 / zoom`. Raising height makes waves smaller. No second independent zoom state is introduced. The default height is 5x (`zoom = 0.2`); the ocean shader's spatial scale changes from 0.2/zoom to 0.8/zoom for four-times smaller waves than the first ocean release.
- Checkbox, shared height/zoom, strength and speed persist in the existing IndexedDB graphics settings record, survive reloads, and request a new render immediately. Older saved preferences default to the new style, height 5x, strength 100% and speed 100%.
- The ocean style retains the upstream MIT notice and existing provenance.

## Update notices

- The live-update popup uses a fixed responsive width, a wrapping action row above the message, readable padding and full-width wrapping text below the buttons.
- The sidebar's Load action precedes a full-width message below it. Long commits/version labels may wrap, and keyboard focus stays visible.
- Reload, Later, deferred multiplayer, safe-update and restored-game behavior remain unchanged.

## Render cost

At 75 FPS, a 1440×1000 viewport at DPR 2 represents up to 432 million water fragments per second before tile overlap. The chosen style is one uniform branch in the existing shader, with both shader functions compiled during renderer initialization. No extra draw passes, textures, resizing or per-entity work are introduced. Hardware classification allocates only during initialization. WebGL uniform data grows from 40 to 48 bytes per frame (+600 bytes/second at 75 FPS); WebGPU reuses the existing 48-byte uniform buffer. The classic Canvas2D pass retains its draw count and buffers, applying scalar strength and speed values to its existing animation.

## Validation handoff

No tests, browser/GPU validation or performance benchmarks are run, honoring Patrick's standing instruction. Lint and the production build are static checks only. Patrick will verify on dev with his hardware GPU:

1. Toggle between classic and ocean rendering; the preference should survive reload.
2. Raise view height, increase/decrease strength and speed; verify both styles react, zero speed freezes animation and zero strength flattens variation.
3. Reload and check the same values and checked state remain; verify tone/saturation still work.
4. Check automatic classic fallback on a software/unavailable GPU without losing the stored ocean preference.
5. Check update popup/sidebar actions and full-width text on desktop and a narrow viewport, including long labels.
