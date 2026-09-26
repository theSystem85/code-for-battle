# 094 — In-world status bar gradient

## Summary

In-world status bars keep their current base color and lighten slightly toward white along the direction the fill grows. The ramp matches the sidebar energy bar: a linear blend from the base color at 0% to a lighter color at 100%, applied only to the filled portion.

## Look

- Shared helper: `src/utils/statusBarGradient.js`.
- Fill start: `STATUS_BAR_START_BLACK_MIX` = 0.22 (within 20–25% toward black), matching the energy bar’s darker start.
- Growing edge: `STATUS_BAR_LEADING_WHITE_MIX` = 0.40.
- A 1px gloss line sits inside the top of a horizontal fill, and on the leading edge of a vertical fill. It is a little lighter than the fill at the same position (`STATUS_BAR_GLOSS_EXTRA_WHITE` = 0.16).
- Energy bar CSS stays `linear-gradient(90deg, start 0%, end 100%)` via `linearFillGradientCss`. Those HUD end colors stay hand-tuned. In-world bars compute both stops from the existing base color.
- Horizontal fills run dark → light, left → right. Vertical fills run dark → light, bottom → top. Donut HUD arcs do the same along the sweep. Thick arcs stay inset so the rail edge remains visible.
- The empty track is a dark semi-transparent rail, slightly darker on the top pixel, with a 1px inset hairline (`STATUS_BAR_RAIL_EDGE`). Ring tracks use the same edge color and, when the stroke is at least 3px, a lighter inner stroke. Bar size and position are unchanged.

## Bars

Rectangular fills use `fillStatusBar`. Donut sweeps use `strokeStatusArc`.

- Unit HP (unselected, legacy selected, and the modern edge/donut HUD, because those share `drawHudEdgeBar` or the same health fill).
- Unit ammo and fuel, including legacy vertical bars and the donut HUD.
- Harvester/experience/crew-load progress, supply-ship segments, and recovery progress.
- Building HP, helipad/airstrip fuel and ammo, turret ammo.
- Repair timeout, factory production, workshop restoration, and hospital healing.
- Selected wreck HP.

The harvester mining slug is a moving marker, not a fill, and stays flat.

## Rendering paths

WebGL and WebGPU rasterize terrain. Unit, building, and wreck bars are drawn on the 2D overlay in every backend, so one canvas helper covers WebGL, WebGPU, and the CPU terrain path. There is no per-bar GPU draw.

Rectangular fills draw a cached 64px ramp sprite plus a cached gloss sprite. Rails draw a cached height sprite (or a top pixel plus a body pixel when the bar is taller than 8px) and one hairline stroke. Later frames do not call `createLinearGradient` and do not allocate a gradient, pattern, or color string. Donut arcs stroke eight cached color steps inside the rail. That arc work runs only for selected HUD arcs, not for the many unselected HP bars in a battle.

## Performance

A rectangular bar is a handful of cached blits plus one stroke, with no per-frame gradient. This environment cannot certify 75 presented FPS. The qualifying-hardware check stays outstanding. Do not reduce resolution or effects to chase that gate here.

## Tests

`tests/unit/statusBarGradient.test.js` covers the energy-bar gradient string, the darkened start, the 40% white tip, gloss, sprite reuse, the inset rail, and donut arc colors.

## Visual check

Tutorial completion was set before capture. WebGPU was requested in settings and stayed unavailable in this environment (`gpuTerrain.backend` remained `webgl`), so the bars were checked on the shared overlay. Measured device pixels:

- Desktop energy bar, healthy green, computed `linear-gradient(90deg, rgb(63, 143, 68), rgb(124, 226, 132))`. Left of the fill about rgb(65, 145, 70); right edge about rgb(121, 222, 129).
- Portrait condensed `#mobileEnergyBar` (touch, `mobile-portrait sidebar-condensed`, 80% height, same CSS gradient left to right). Left about rgb(64, 144, 69); right about rgb(121, 221, 129).
- A later pass darkens the fill start by 22% and reaches 40% white at the growing edge. On a captured green HP bar the body runs from about rgb(15, 208, 15) to rgb(95, 252, 95), with a brighter gloss row above it, a black hairline, and the empty track left dark. Yellow, red, orange ammo, and blue fuel bars use the same ramp.
