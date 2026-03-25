# Spec 059: Game Orchestrator Merge Conflict Cleanup

## Summary
Remove committed Git merge conflict markers from `src/game/gameOrchestrator.js` and keep the intended storage-key declarations intact.

## Requirements
- Remove all `<<<<<<<`, `=======`, and `>>>>>>>` markers from `src/game/gameOrchestrator.js`.
- Keep `PLAYER_COUNT_STORAGE_KEY` and `ORE_FIELD_COUNT_STORAGE_KEY` as exported constants.
- Preserve additional terrain-related storage key constants introduced alongside map generation settings.
- Ensure module parses cleanly for build tooling.
