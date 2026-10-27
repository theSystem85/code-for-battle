# Background game update handoff

UTC: 2026-10-27T13:31:26.690769+00:00
Model: GPT-6 (exact deployed version, reasoning level, token counts and elapsed task telemetry unavailable).
Harness: Codex desktop, managed cloud environment.

User request:

improvement: ensure that when a game is already loaded and running and the user clicks the update button for reloading the game that all new files will be loaded in the background while the game is still running until all files are available locally. Then the game pauses, saves, loads the downloaded files into the memory and restarts the game but the user will still see the running game in pause mode all the time until game is fully restarted/reloaded with save game and updated files. Then the game automatically resumes. It should feel like a how reload for the user (minimally invasive). Ensure the normal loading when user manually hits the reload button is not affected and will still show the loading screen like now. Do this change on dev directly and commit to remote. Any questions before you start?
