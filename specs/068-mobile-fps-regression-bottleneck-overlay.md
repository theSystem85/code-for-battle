# 068 — Mobile FPS regression after sprite-sheet routing + realtime bottleneck overlay

## Context
Recent street sprite-sheet routing work introduced a major mobile framerate regression (reported from ~60fps to <10fps).

## Requirements
1. Identify and fix the core render-path performance issue introduced by sprite-sheet street routing changes.
2. Add realtime bottleneck diagnostics to the FPS overlay so users can see likely limiting factor while playing.
3. Bottleneck visibility should include:
   - CPU simulation/update time
   - CPU render submission time
   - GPU/compositor/wait estimate
   - JS heap usage (when browser exposes `performance.memory`)

## Implementation summary
- Street tile selection now caches filtered candidate pools per topology/signature instead of re-filtering tag buckets every draw call.
- Street tag matching now precomputes tag sets and direction bitmasks to avoid repeated per-tile array scans.
- FPS overlay now receives frame-phase breakdown data from the game loop and renders a dominant bottleneck label plus realtime phase timings and heap info.

## Acceptance criteria
- Unit tests remain green.
- Repeated street topology selection calls reuse cached pools.
- FPS overlay surfaces bottleneck metrics in realtime during gameplay.
