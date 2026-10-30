# Unit ground shadows

## Intent

Ground units use their rendered sprite silhouette for a darker, soft north-east cast that matches shadows baked into building art. The draw loop reuses prepared images rather than rasterizing filters for every unit.

## Behaviour

- Shadows default to enabled and cast north-east at 45 degrees.
- Graphics settings expose offset, start and end stretch, overall size, opacity, blur, and cast direction. Values persist in the existing IndexedDB graphics record; the former length value migrates to offset.
- The Graphics dialog shows a tank and its shadow. Only this preview is regenerated while a slider moves.
- Gameplay keeps one bounded offscreen shadow canvas per unit type. All instances of that type use the same canvas through one `drawImage` call.
- Closing the settings dialog commits the final values and rebuilds each known unit-type cache once. Slider input never invalidates gameplay caches.
- The source mask is rendered through the unit's normal body renderer, so sprite-backed and procedural fallback units preserve their silhouettes.

## Performance acceptance

The hot draw path performs a map lookup and one cached `drawImage` per visible unit. Mask drawing, repeated cast sampling, and canvas blur occur only on first preparation or the explicit close-dialog rebuild. Cache size is bounded by encountered unit types. Qualifying-hardware 75 FPS verification remains pending on Patrick's hardware because this environment has no verified hardware GPU.
