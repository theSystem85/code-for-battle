# 2026-09-27T20:45:00Z

Cursor Cloud Agent using Grok 4.7. Token counts were not available for this run.

## Prompt

Follow-up for PR #720 from Patrick:

1) Add a "Clear offline cache" action. Place it where it makes sense near the cache size info (e.g. in the settings or reachable from the offline pill; hover-only tooltips can't hold a button on touch, so choose a discoverable spot, e.g. settings panel section "Offline" showing cached size + button, and/or a long-press/secondary action on the pill). It must delete only this app's Workbox/precache/runtime Cache Storage entries and unregister the service worker, but KEEP saved games, settings, and localStorage/IndexedDB game data. Ask for confirmation first (in-game styled confirm, not window.confirm if the game has its own modal). After clearing, show the new size (0 / not cached) and explain that the game will re-cache on next online load; offer reload. If offline at the time, warn that clearing will make the game unavailable offline until next online visit. i18n EN + DE. Add unit tests and update specs/095-offline-mode.md.

2) On phone, a toast (e.g. "LLM strategic AI needs a provider and model...") overlaps the top-left offline pill. Make sure toasts don't cover the pill (offset them below it or lay them out so both are visible).

Screenshot desktop and phone portrait: the clear-cache UI, the confirm dialog, the post-clear state, and the phone top-left with a toast visible not overlapping the pill. Run unit tests and lint, rebase onto origin/main (no merge commits), push with --force-with-lease.
