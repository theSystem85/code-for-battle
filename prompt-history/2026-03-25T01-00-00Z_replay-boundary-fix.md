2026-03-25T01:00:00Z
copilot

User shared the latest replay determinism failure with grouped mismatch branches showing ore-tile drift in `mapTileState`, AI budget differences, refinery status mismatch, and a one-step counter drift in `frameCount`, `gameTime`, `simulationTime`, and RNG call count.

Applied changes targeted the replay end boundary directly: replay recording now appends an explicit terminal marker at stop time so playback reaches the same paused simulation timestamp as the live-match save, and the Playwright save-point freeze helper now verifies `frameCount`, `simulationTime`, `simulationAccumulator`, and `lastOreUpdate` stay stable in addition to `gameTime` before saving.