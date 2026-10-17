# Map settings Apply button

## Goal
Editing a sidebar map setting must not regenerate the map immediately. The user batches edits and regenerates once with an explicit Apply.

## Requirements
- The Map Settings accordion shows an `Apply map settings` button (`#mapSettingsApplyBtn`) below the generation inputs. No `title` attribute; a visible hint explains that changes apply on click.
- The button is disabled on load and after every apply. It becomes enabled as soon as any watched input differs from the last applied snapshot, and disabled again when all edits are reverted.
- Watched inputs: seed, width, height, ore fields, total ore value, start money, water %, rocks %, the four shore checkboxes, big center lake, map biome, biome regions, distribution, shore sand width, biome fade, biome size weights, snow on plateau tops, and every decoration setting (city/ruin centers and radii).
- Input sanitising still runs on `change`, but only the Apply click calls the existing regenerate routine (`applyMapSettingsAndRegenerate`). The water/rock normalisation hint (`changedField`) is the last edited of the two.
- If the regenerate routine refuses (multiplayer guest before the host starts), the edits stay pending and the button stays enabled.
- Unchanged: ore spread interval applies immediately (no regeneration), the player count in the multiplayer section regenerates immediately, and SSE-driven topology regeneration (sheet toggles, SSE Apply/Close, spec 134) keeps its own path.

## Implementation
- `src/ui/mapSettingsApply.js` `createMapSettingsApplyController({ inputs, button, onApply, fieldOf })` snapshots the inputs, tracks dirtiness on `input`/`change`, and re-snapshots after a successful apply.
- `GameOrchestrator.setupMapShuffle` wires it; the regenerate routine calls `resync()` and returns `false` when refused.
- Tests: `tests/unit/mapSettingsApply.test.js`.

## Stones (0.62.0)
- `stoneCount` (Stones, default 40, 0–400) is part of `DECORATION_SETTINGS` and is applied with the Apply button like the city/ruin settings.
