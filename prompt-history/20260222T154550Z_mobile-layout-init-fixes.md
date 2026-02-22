20260222T154550Z UTC
LLM: codex (GPT-5.2-Codex)

## Prompt
1) on chrome in mobile emulator dev mode the sidebar is initially not shown (neither condensed nor extended is visible) when the page is reloaded in landscape mode (portrait works). But when the device rotation is simulated the sidebar shows up again. Ensure the sidebar in condensed mode is always initially visible!

2) I also noticed that the protected areas (around the notch and at the bottom) which are also used in portrait mode (PWA) by the game are only correctly filled after a rotation back and forth of the device. So there must be some function existing to init it correctly also on initial load. Ensure the bottom space on mobile ios portrait is correctly filled on initial load!

3) Also ensure on mobile landscape the notification bell button is on the top left of the screen to not overlap with sidebar.
