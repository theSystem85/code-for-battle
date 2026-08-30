# 079 - Strategic LLM incremental context (future implementation)

## Status

Specification only. This feature is intentionally not implemented with the compact save-game work.

## Requirements

1. A local strategic LLM receives one compact, semantically named initial snapshot compatible with the compact save vocabulary.
2. The initial context includes only strategically relevant entities, resources, ownership, visibility, objectives, and coordinates rather than the full render/simulation state.
3. Later turns receive an ordered change feed (created, moved, damaged, destroyed, ownership/resource/objective changes), not repeated whole-map snapshots.
4. Changes are coalesced between planning turns and carry a stable sequence/revision so missed updates can be detected.
5. Hidden enemy state must never leak through either the initial snapshot or deltas; information follows the controlling player's visibility and memory rules.
6. Commentary context is separable from planning context and can use a smaller filtered event stream.
7. A future agentic tool API may request bounded state by region, entity ID, player, objective, or revision range, with explicit response/token budgets.
8. The LLM context schema is independently versioned from disk saves even where both reuse compact map/entity vocabulary.
9. Deterministic tests must verify initial-state filtering, delta ordering/coalescing, fog-of-war privacy, and bounded tool responses before enabling LLM control.
