# 079 - Strategic LLM incremental context (future implementation)

## Status

Implemented on 2026-08-30.

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
10. The Save Game Editor exposes a preview of the proposed strategic transfer using schema/row tables for statistics, units, buildings, wrecks, and mines; this preview is inspection-only and must not imply that live incremental delivery is implemented.
11. Strategic payloads should follow CFB2's no-envelope, schema-once relational layout so property names are not repeated for each entity.

## Implementation

- Strategic sessions receive a versioned (`1.0`) CFB2-style relational bootstrap with column schemas declared once and positional entity rows.
- Subsequent requests carry monotonically revisioned, coalesced created/changed/destroyed rows, resource changes, and ordered transition events. Repeated force/base/enemy tables are omitted on delta turns.
- Snapshot entities and transition events are filtered through the controlling AI player’s fog-of-war view before entering the context tracker.
- A bounded context query supports entity ID and rectangular region filters with a hard 500-row ceiling.
- Commentary retains its smaller dedicated digest/session and has an independent polling interval. Strategic and commentary polling controls accept 5–3600 seconds in Settings.
- This work runs only at configurable LLM polling boundaries (minimum five seconds), not per simulation tick or render frame, so it is outside the hot-loop performance benchmark gate.

## Verification

- `npm run test:unit`
- `npm run lint:fix:changed`
