UTC: 2026-03-25T16:15:39Z
Model: copilot

Prompt summary:
- Investigate and fix the visible retreat action icon that appears during automated gameplay even though it does not make sense to the observer.
- Continue replay determinism debugging using the latest overlap failure report with mismatches in `mapTileState`, `aiFactoryBudgets`, `scrollOffset`, building health, `enemyUnitsDestroyed`, `gameTime`, `powerSupply`, `rngState.callCount`, and `simulationAccumulator`.
- Keep the replay comparison focused on only the meaningful non-overlapping gameplay state so root-cause debugging stays targeted.

Implemented response:
- Limited retreat target rendering to player-issued retreat commands instead of all AI retreat state.
- Replaced harvester ore-search/manual-target retry `setTimeout` usage with deterministic simulation-time scheduling stored on the unit and persisted through save/load.
- Trimmed replay overlap comparison noise by omitting camera scroll and derived kill/power counters from mismatch reporting.