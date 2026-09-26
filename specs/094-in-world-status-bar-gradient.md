# 094 — In-world status bar gradient

## Summary

In-world status bars keep their current base color and lighten slightly toward white along the direction the fill grows. The ramp matches the sidebar energy bar: a linear blend from the base color at 0% to a lighter color at 100%, applied only to the filled portion.

## Look

- Shared helper: `src/utils/statusBarGradient.js`.
- Leading-edge mix: `STATUS_BAR_LEADING_WHITE_MIX` = 0.25 (within the 20–30% white range).
- Energy bar CSS stays `linear-gradient(90deg, start 0%, end 100%)` via `linearFillGradientCss`. Those HUD end colors stay hand-tuned. In-world bars compute the end color by mixing the existing base toward white so red, yellow, green, ammo orange, and fuel blue all use the same ramp.
- Horizontal fills lighten left → right. Vertical fills lighten bottom → top. Donut HUD arcs lighten along the sweep, from the arc start toward the filled end.
- The gray track is unchanged.

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

Rectangular fills are one `drawImage` of a 64px sprite cached per base color and direction. The sprite is built once. Later frames do not call `createLinearGradient` and do not allocate a gradient, pattern, or color string. Donut arcs stroke eight cached color steps. That extra work runs only for selected HUD arcs, not for the many unselected HP bars in a battle.

## Performance

Call count for a rectangular bar is unchanged (the gradient sprite replaces the solid fill). This environment cannot certify 75 presented FPS. The qualifying-hardware check stays outstanding. Do not reduce resolution or effects to chase that gate here.

## Tests

`tests/unit/statusBarGradient.test.js` covers the energy-bar gradient string, the 25% white mix, sprite reuse, and donut arc colors.
