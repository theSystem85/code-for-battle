# 2026-10-18T17:04:00Z — Live updates on the dev deploy

Processed by: Grok Bot (executor subagent). The exact underlying model name, version and token counts are not exposed to the agent, so they are left out rather than guessed.

## Prompt (Patrick, relayed by the dispatching agent)

He doesn't want to reload at all; updates should arrive "kind of hot reload". As a second PR into dev: detect a new deploy (poll a small build-info file every 15–30 s or use the service-worker update check); if only CSS changed, hot-swap the stylesheets in place with no reload and no loss of game state; if JS changed, save the game with the existing save/load system, reload and restore it so it feels seamless (a small toast is fine). Enable it only on the dev branch build (and local dev), not production unless cleanly guarded; make it work with the service worker caching; test it with a CSS-only deploy on a running dev page (before/after screenshots of the same page instance); document it in AGENTS.md Deployment; add test IDs, notes and prompt history.

## Result

See `docs/changes/2026-10-18-dev-live-update.md` and AGENTS.md, Deployment, "Live updates on the dev deploy".

## Follow-up 2026-10-18T17:21:00Z (B-008 consistency)

Processed by: Grok Bot (executor subagent); exact model not exposed.

Keep it consistent with B-008 in the brainstorm notes: always notify the player when an update is available (bubble at the top or the sidebar update info) and say whether it needs a reload; safe (CSS-only for now) updates apply on their own; breaking/JS updates need the player's consent first, then save, reload and restore; the update manifest records safe vs breaking; single-player scope; add a schema-version field as groundwork for state migration. Module hot-swap and state migration are follow-ups.

## Follow-up 2026-10-18T17:26:00Z (scope)

"Single-player" means no network multiplayer. Local games with one human against any number of AI enemies ("You (Host)") are in scope; skip live updates only while other humans are connected over the network.
