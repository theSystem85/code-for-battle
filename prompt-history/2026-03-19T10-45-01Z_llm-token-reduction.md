# 2026-03-19T10:45:01Z — LLM Token Reduction

**Processed by:** copilot

## Prompt Summary

The user encountered 429 errors from the LLM API due to exceeding the 200k token limit. The request was to **dramatically reduce the size of the tokens sent and received** by sending only the most relevant game state information the LLM needs to make good strategic decisions.

## Key requirements identified

1. Remove redundant data from unit snapshots (world-pixel `position` field — `tilePosition` is sufficient)
2. Compact unit `status` object: omit `isAirUnit: false` (the default) and other null/undefined fields
3. Compact unit `orders` object: omit null fields entirely when no active order is set
4. Omit null `rallyPoint` from building snapshots
5. Aggregate damage transition events by target instead of sending every individual hit (dramatically reduces transitions size in combat)

## Changes made

- `src/ai-api/exporter.js` — compact `unitToSnapshot` and `buildingToSnapshot`; add `compactTransitions` helper; apply compaction to transition output
- `src/ai-api/validate.js` — make `unit.position` optional (backward-compatible)
- `src/ai/llmStrategicController.js` — remove reliance on removed `unit.position` field in `filterInputByFogOfWar`
- `src/ai-api/examples/early-game-input.json` — updated to reflect new compact format
- `src/ai-api/examples/combat-input.json` — updated to reflect new compact format
- `tests/unit/aiApi.test.js` — added three new tests verifying compact output
- `TODO/Improvements.md` — recorded completed task
