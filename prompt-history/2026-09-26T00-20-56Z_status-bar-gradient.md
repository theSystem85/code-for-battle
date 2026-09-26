# Prompt History

- UTC: 2026-09-26T00:20:56Z
- Model: Grok 4.7 in Cursor Cloud Agent (harness: Cursor). Token counts were not available for this run.

## Prompt

Visual polish: give all in-world status bars a slight white gradient along their grow/fill direction. Scope:

- HP bars shown for units and buildings when they are NOT selected (and, for consistency, also the selected ones if they use the same drawing path, unless that looks worse)
- other in-world bars: ammo and fuel state bars (units and buildings), and the repair timeout/cooldown bar, plus any similar small status bars drawn over units/buildings (check the render code for all of them).

Look: the bar keeps its current base color (red/yellow/green etc., including dynamic color by HP percentage). Along the direction the bar fills (e.g. left to right for horizontal, bottom to top for vertical), it starts at the full base color and blends slightly toward white near the filled end, only subtly (e.g. mixing up to ~20-30% white at the leading edge). Match the style of the existing energy bar in the portrait condensed mobile HUD, which already has this look; find it in the code and reuse its gradient parameters/approach so they look consistent. The gradient should span the FILLED portion (so it reads as a glow toward the growing edge), not the whole track.

Implementation: the game has both WebGL and WebGPU renderers (plus possibly a 2D canvas path for overlays). Implement for every path that draws these bars so it looks the same in all. Performance matters (target 75+ FPS in heavy battles with many bars): avoid creating a new CanvasGradient per bar per frame if drawn with 2D canvas (cache per color/size or draw with a precomputed overlay); in GPU paths do it in the shader/vertex colors, no extra draw calls per bar.

Verify visually: zoomed screenshots (mark tutorial completed first) of several units and buildings with bars at different fill levels and colors (HP red/yellow/green, ammo, fuel, repair timeout), in WebGL and WebGPU if available in the environment, plus a side-by-side with the portrait condensed energy bar for reference. Inspect and iterate until subtle and consistent. Include screenshots in the PR description and final report.

Keep `npm run test:unit` and lint green (add tests for any new color/gradient helper). Follow AGENTS.md: rebase only, never merge main into the branch, push with --force-with-lease. Open a draft PR and report the PR URL, which bars changed, and screenshot paths.
