UTC: 2026-03-25T16:32:43Z
Model: copilot

Prompt summary:
- New replay determinism result still showed ~95.5% overlap with mismatches in `mapTileState`, `aiFactoryBudgets`, `money`, `rngState.callCount`, `simulationAccumulator`, `simulationTime`, and `totalMoneyEarned`.
- Goal: continue narrowing the real replay drift without hiding it behind comparison noise.

Implemented response:
- Identified that classic AI and LLM replay commands are recorded from the end of `updateGame` but were replayed at the start of the same timestamped tick.
- Added a deferred post-tick replay phase for AI/LLM entries so replay command timing matches live execution order.
- Removed `frameCount` from the overlap target because it is a render-frame counter, not deterministic gameplay state.