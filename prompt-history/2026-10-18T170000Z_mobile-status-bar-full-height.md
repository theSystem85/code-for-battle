# 2026-10-18T17:00:00Z — Mobile money and power bars fill the status bar

Processed by: Grok Bot (executor subagent). The exact underlying model name, version and token counts are not exposed to the agent, so they are left out rather than guessed.

## Prompt (Patrick, on his iPhone in portrait, on the dev deploy, with a screenshot)

"ensure the power and money status bar is always full height to fill available space."

Context from the dispatching agent: stretch the money and power bars vertically to fill their container on mobile portrait, landscape and desktop, without overlapping the safe area / home indicator, keep the text vertically centered; first real run of the dev workflow, auto-merge into dev allowed, never touch main.

## Result

See `docs/changes/2026-10-18-mobile-status-bar-full-height.md`. Portrait PWA bars grow from 12px to 18px (all of the status bar except 3px top padding and 13px kept for the home indicator); landscape rows share the bar height; desktop has no slack and is unchanged.
