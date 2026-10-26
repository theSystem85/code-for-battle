# Proposed S03 integration: terrain sheet-tier publications

This lane intentionally does not edit integration-owned publication or startup modules. When the sprite-streaming integration owner publishes a `createSpritePublication(...)` record for an integrated terrain sheet, it should forward that same immutable record to:

```js
mapRenderer.notifySpriteTierPublication(publication)
```

The publication `spriteId` must use the same stable sheet path stored as `sheetPath` on integrated terrain tile descriptors. The map renderer then deduplicates the `(spriteId, tier, revision)` tuple and invalidates only resident pages recorded as depending on that sheet. Older complete pages remain drawable until the bounded high-priority page job finishes.

No worker-composition hook is proposed yet. Current decorated-page drawing depends on live `CanvasImageSource` handles and renderer methods that are not serializable. Moving that work to a worker before S01/S02 provide transferable, tier-specific sheet handles would either clone unbounded source data or introduce a synchronous fallback. Procedural water already remains outside the static page when the separate-water path is selected; live entities and effects are rendered after terrain pages.
