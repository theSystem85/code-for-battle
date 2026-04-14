# Prompt Record
- UTC: 2026-04-14T20:03:33Z
- LLM: GPT-5.3-Codex

## User Prompt
I added a sprite sheet animation asset at:

public/images/map/animations/64x64_9x9_q85_explosion.webp

Implement a generic sprite sheet animation system and use this asset for destruction explosions.

Core idea:
All animation metadata must be derived from the filename. No hardcoded values.

Filename format:
<tileWidth>x<tileHeight>_<cols>x<rows>_<anything>.webp

Example:
64x64_9x9_q85_explosion.webp
→ tile size: 64x64
→ grid: 9 columns, 9 rows
→ total frames: 81

Requirements:

1) Generic parsing
- Parse tileWidth and tileHeight from the first segment
- Parse columns and rows from the second segment
- Compute frameCount = cols * rows
- Do not hardcode any of these values anywhere

2) Animation system
- Implement a reusable "SpriteSheetAnimation" (or similar) abstraction
- Inputs:
  - texture
  - tileWidth, tileHeight
  - columns, rows
  - frameCount
  - duration (in seconds)
  - loop (boolean)
- Frame order: left → right, top → bottom
- Frame index must be time-based (delta time), not frame-based

3) Explosion usage
- When a unit or building is destroyed:
  - spawn exactly one animation instance
  - position: center of the destroyed object
  - render above ground / wreck

4) Timing
- One-shot animation (loop = false)
- Total duration should feel natural (~0.8–1.5s). Pick a reasonable default.
- Frame progression must be smooth and independent of FPS

5) Rendering
- Render as world-space sprite (top-down)
- Keep it centered (no visual jumping between frames)
- Default size = 1 tile, but allow scale multiplier

6) Additive blending (critical)
- Asset uses black background
- Use additive blending (ONE, ONE)
- Ensure black contributes nothing
- Properly restore previous blend state after rendering

7) Cleanup
- Remove animation automatically after last frame
- No duplicate spawns
- No memory leaks

8) Reusability
- The system must work for ANY sprite sheet that follows the filename convention
- No explosion-specific logic inside the animation system

9) Output
- Implement the system
- Show where filename parsing happens
- Show how explosion effect is triggered

10) ensure the animation runs highly performant with webGL so that hundreds of explosions at the same time would not dip the frame rate.
