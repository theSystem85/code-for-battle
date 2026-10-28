UTC: 2026-10-28T08:30:05Z
Harness: Codex
Model: GPT-6 (exact model revision and reasoning level are not exposed; token counts and precise task duration are unavailable).

User request: The black background issue still occurs during faster scrolling, and sometimes the game becomes unresponsive. Reproduce it, find the root cause, and fix it. Review recent Git commits and prompt history because at least two earlier fixes did not resolve it.

Context reviewed: mobile water/scroll crash requests from May 2026; the October 27 terrain-artifact request; current dev commits including f2a57fe8 (context loss and viewport pinning), 3d18c2d6 (incremental decorations), and 59438dbc (decoration restoration). The initial checkout was 52 commits behind origin/dev; implementation was rebased onto current dev before final verification.

Confirmed reproduction on unmodified current dev: start a decorative page, stop after one tile with staging held, then expose another terrain chunk. The foreground raster reservation throws `terrainStaging byte budget exceeded`. This aborts rendering after the canvas clear and prevents scheduling the next animation frame. This is separate from context loss and explains why that earlier fix did not cover it.

Verification: reproduced `terrainStaging byte budget exceeded` on unmodified current dev; the fix passes the focused regressions, all 5,800 tests in the final unit/integration run, the real-browser 2D scrolling/cancellation test, lint and production build. Hardware GPU / 75 FPS acceptance remains pending.
