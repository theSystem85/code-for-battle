# Production building spawn progress

While a player unit is actively being produced, the map shows a compact blue progress bar above the production building selected by the existing spawn routing rules.

- The fill reflects the active queue item's production progress.
- Shared queues show the bar on only the building currently selected to spawn the unit.
- Explicit factory choices, round-robin factory routing, and currently available air parking are respected.
- Paused, cancelled, completed, and empty queues do not show the bar.
- Existing enemy production indicators remain unchanged.

## Performance acceptance

The queue updates one building reference per active production lane and rendering performs one numeric property check per visible building. Qualifying-hardware 75 FPS verification remains pending for Patrick on the `dev` deploy because this environment has no verified hardware GPU.
