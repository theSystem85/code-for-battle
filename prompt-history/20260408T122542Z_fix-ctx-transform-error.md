# 2026-04-08T12:25:42Z
# LLM: copilot

Fix console error: `TypeError: ctx.transform is not a function` in `MapRenderer.drawShorelineSegment`.

The PR comment requested fixing the JS error so the game runs and is deployable. The error occurred because `ctx.transform()` was used with a Canvas 2D affine matrix to set up a local coordinate space for drawing. This approach broke in certain rendering contexts.

Fixed by replacing the `ctx.transform()`-based quad rendering with direct polygon drawing using `ctx.beginPath()` / `ctx.lineTo()` / `ctx.fill()` and a world-space `createLinearGradient()`. Also removed the unused `getOrCreateShorelineTexture()` method and its associated `shorelineTexture` state. Removed unnecessary `ctx.save()` / `ctx.restore()` calls from the inner loop.
