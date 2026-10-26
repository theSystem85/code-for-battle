# S08 decoration layout integration patch

The S08 component lane does not own `src/rendering/textureManager.js`, `src/rendering.js`, or city-state wiring. The integration owner should make the following changes before checking the first S08 checklist item:

1. Give `TextureManager` one `DecorationLayoutPreparation` instance and explicit map, catalog, and decoration-config revision counters.
2. Replace `getDecorationLayout()` cache-miss construction with `preparation.read(...)`. A miss must return `null` (or a previously published compatible snapshot); it must never call `buildDecorationLayout()`.
3. Add a lifecycle-only preparation method that calls `preparation.prepare(...)`, passing `prepareCityBuildings` as `applySimulationEffects`. Invoke it from the existing `publishPreparedRuntimeMap()` prewarm and await it before the map is renderable.
4. Route the existing invalidation producers at integrated-sheet reset, integrated-sheet publication, texture clearing, map edit/load, and decoration-setting changes through explicit revision increments followed by lifecycle preparation.
5. Keep `prepareCityBuildings()` on the main simulation thread. Do not accept city or collision state from a visual worker result.

The focused fixture in `tests/unit/decorationLayoutPreparation.test.js` defines the lookup, invalidation, immutability, authoritative-effect, and tier-independent placement contracts that this wiring must preserve.
