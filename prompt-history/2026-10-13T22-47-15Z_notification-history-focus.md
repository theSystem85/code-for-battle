UTC: 2026-10-13 22:47:15
Model: GPT-6 through Codex. Exact serving variant, reasoning level and token counts are unavailable.

Prompt: Ensure in the notifications list the row of a notification that contained a link to the affected unit like in "harvester under attack" is also causing the unit to be focussed when row is clicked like in the original message.

Implementation: Notification history retains the original focus callback for attack and harvester-promotion alerts. Actionable rows use native buttons and isolate activation keys from game shortcuts.

Validation: 4,830 unit tests, changed-file lint fix, full lint and a Chromium regression verifying expired history rows reproduce original harvester selection and camera focus with click, Enter and Space passed.
