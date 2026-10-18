# 2026-10-18T08:16:00Z — Old stored sheet selection hides new sheets (PR #688)

Processed by: Grok Bot (no Codex task this round; the exact model version is not exposed to the agent).

## Prompt

Ensure to always show all used sprite sheets in the editor. Currently I see only one and none of the new ones anymore, neither in the list nor their assets on the map!?

## Delegated requirements

- (a) The sprite sheet editor and the Map Settings list always show every available sheet: all default dtv sheets plus debris plus user-added ones, whatever is stored.
- (b) New default sheets are enabled automatically for existing users. Store explicit opt-outs instead of a whitelist, and migrate old stored selections.
- (c) Retired sheets in stored data are silently ignored.
- Add unit and e2e tests that seed old localStorage states. Verify visually with seeded old storage.

## Root cause

- The stored whitelist only ever contained the sheets selected at that time. After the round 5 retirements, only debris_craters_tracks was left, and new defaults were never added.
- The service worker cached /images/map/sprite_sheets/index.json cache-first, and both sheet loaders trusted index.json alone, so a stale index could limit the lists to old sheets.
