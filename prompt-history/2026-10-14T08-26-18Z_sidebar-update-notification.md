UTC: 2026-10-14 08:26:18
Model: GPT-6 through Codex. Exact serving variant, reasoning level and token counts are unavailable.

Prompt: Ensure to show the "update available" button only in the left sidebar to the left of the "online/offline" button and also as a notification with the link to the reload of the page when the link is clicked in the initial notification or when the row is clicked in the notifications list. Do not show that button anymore as an overlay on the game map or controls.

Implementation: The unique update button lives directly before Online/Offline in the sidebar status row with static positioning. A waiting update announces itself once with a real link and a retained history action. Every entry point shares the existing service-worker activation/reload flow and ignores duplicate clicks while applying.

Validation: Full unit suite (253 files / 4,848 tests), Chromium sidebar placement check, changed-file lint fix, full lint and production build passed. Three focused update cases verify the sidebar button, initial notification link and expired notification history row all activate the waiting worker and reload exactly once after controller change.
