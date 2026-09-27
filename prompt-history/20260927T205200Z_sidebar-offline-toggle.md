# 2026-09-27T20:52:00Z

Cursor Cloud Agent using Grok 4.7. Token counts were not available for this run.

## Prompt

Additional change from Patrick for PR #720 (fold into current work): Remove the top-left floating offline pill over the map entirely. Instead there must be exactly ONE online/offline toggle button, permanently shown at the top of the sidebar (in both online and offline state, same place the sidebar offline chip currently appears). It is the clickable toggle (force offline), styled like the gamepad indicator, and shows the cache-size hover info. Never show it twice. Tooltips: show ONLY the custom styled tooltip; remove any native `title` attribute on the toggle (and on the disabled Multiplayer section hint too) so the browser's default tooltip doesn't appear alongside. Keep accessibility via aria-label/aria-describedby instead of title. Make sure the custom tooltip is not clipped by the sidebar overflow and works on touch (tap/long-press). Since the pill no longer sits over the map, the toast overlap issue should disappear; verify toasts don't cover the sidebar button. Update specs/095-offline-mode.md, tests, and screenshots (desktop + phone portrait: sidebar top with button online, offline, hover tooltip showing only one tooltip).
