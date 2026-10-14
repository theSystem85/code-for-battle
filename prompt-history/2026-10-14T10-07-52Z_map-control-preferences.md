UTC: 2026-10-14 10:07:52
Model: GPT-6 through Codex. Exact serving variant, reasoning level and token counts are unavailable.

Prompt:
1) Remove the new "drag to pan map" button because it is not needed and there is no more space in action bar for more buttons!
2) Increase the max map scroll velocity that user can accelerate towards using arrow keys to about 4x of what it is now. Reduce the auto break default value to 1/3 of what it is right now. In control settings offer an option to invert the map scrolling direction when 2 finger touch gesture is used to pan the map.

Implementation: removed the action and primary-drag mode; increased the default keyboard cap to 32 and reduced release braking to 1200; added the live Controls inversion preference for two-finger touch and trackpad/wheel input. Updated tutorial, localized landing copy, manual, specs and regression coverage.

Validation: all 254 unit files / 4,856 tests passed; changed-file lint fix, full lint and production build passed. Chromium covers wheel direction, retained secondary drag, touch sale, two-finger inversion and keyboard acceleration/live configuration. The keyboard browser test now waits for asynchronous Controls dialog input release before sending a direction key. Physical macOS/Safari and reference-hardware FPS certification remain outstanding as documented.
