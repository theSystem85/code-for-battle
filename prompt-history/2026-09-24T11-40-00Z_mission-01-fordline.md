# 2026-09-24T11:40:00Z

Cursor Cloud Agent using Grok 4.7. Token counts were not available to this session. Elapsed time from prompt receipt to the finished unit-test run was about 19 minutes (11:40Z–11:59Z).

## Prompt

Replace the existing first mission (Mission 01) with a totally new first mission that fits Code for Battle’s RTS design. From how missions are authored, create a reusable Cursor skill (`SKILL.md`). Add support for a mission intro video that plays when the mission starts, with a clear asset path if a Grok Imagine clip is not available yet.

Constraints: draft PR, keep the first-mission id if that preserves selectors and progress, EN+DE through the existing i18n pattern, do not break multiplayer, sandbox, or other missions. Verify with `npm run lint:fix:changed` and `npm run test:unit`. 75 FPS certification is out of scope for this headless session.
