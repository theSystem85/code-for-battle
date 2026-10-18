# 2026-10-18 UTC

Processed by Codex using GPT-5.6 Sol (reasoning level unavailable; exact token and elapsed-time metrics unavailable).

## Prompt

On the `dev` line, investigate and fix two iPhone portrait regressions reported from the Netlify dev deploy. A safe CSS-only live update must show only the short applied-live message and never any reload prompt, including prompts originating from the service-worker waiting/updatefound flow, startup checks, release/version UI, or incorrect local-versus-network multiplayer detection. Add unit coverage using only IDs U05400–U05419. Also make the condensed portrait build-button scroller consume exactly the width remaining beside the doubled Buildings/Units category tab in both standalone PWA and browser layouts, using CSS only for the layout fix. Add the required release note, change note, prompt history, tests, conventional commits, and PR documentation; mark the JavaScript commit with `Live-Update: breaking (pwa update notice logic)`.
