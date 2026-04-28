# 064 — Mobile sprite-sheet FPS recovery + bottleneck monitor

1. Terrain chunk cache updates must avoid recomputing expensive tile signatures every frame; recomputation should be throttled and reused between redraw checks.
2. Water-animation-driven chunk invalidations must be rate-limited so procedural/animated water cannot force full chunk redraw on every render tick.
3. FPS overlay must expose a realtime bottleneck line that classifies current limiting factor as one of:
   - `cpu`
   - `gpu/fill-rate`
   - `memory/bandwidth`
   - `none`
4. Bottleneck classification must be derived from runtime telemetry (frame time + long-task pressure, and heap pressure when available) and refresh continuously while FPS overlay is visible.
5. The bottleneck line must remain in the existing FPS overlay and not require opening an additional debug panel.
