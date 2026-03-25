2026-03-25T00:30:00Z
copilot

User asked not to run the replay determinism E2E locally and pointed out that the compared save states were diverging at least because `frameCount` was not captured at the same time.

Required fix:

1. Before creating the first save game and before stopping replay recording, pause the game so `gameTime` stops.
2. Once the game is paused, continue with the save-game creation and the replay-recording stop flow.
3. Apply the same frozen-time approach to the replay-end save so both compared saves are captured at the same paused simulation time.

Applied changes added an explicit pause-and-stable-time helper in the Playwright replay determinism test and reordered the first save point so the game is paused and saved before the recording is finalized.
