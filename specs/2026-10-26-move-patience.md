# Move patience

## Summary

Ground and naval units that already have a destination keep a 10-second patience budget. Each second they fail to move about one meter, they spend one second of that budget. At zero they take the existing local dodge (a nearby intermediate tile spliced in front of the current route) and the budget refills. Player and enemy units share that movement tick.

When more than five of the human player's own units are still stuck inside a circle of five tiles, the game shows one notice with a "Go to units" link that selects those units and centers the camera.

## Meter scale

One meter is `TILE_SIZE / CURSOR_METERS_PER_TILE` (32 / 10 = 3.2 pixels). That is the gameplay scale used for range readout and map size. `TILE_LENGTH_METERS` (1000) is only the fuel-consumption scale; using it would treat a fraction of a pixel as a meter and would count physics jitter as progress.

Displacement is measured from the previous sample, so oscillation smaller than one meter does not count as moving. Travel of at least one meter per elapsed second does not spend patience. Spent patience is not refunded by later movement. It refills to 10 when:

- the destination tile changes
- a fresh order sets `movePatienceResetRequested` (player move command, remote move command, lockstep move), even when the tile is unchanged
- any local dodge starts through `beginLocalAvoidance`

## Who is checked

The sample runs from `handleStuckUnit`, which already updates every unit on the shared movement tick. The hot path compares one timestamp and returns. Distance, dodge, and the cluster scan run only when a one-second sample is due, and the cluster scan runs only when a player unit's patience hits zero.

Not sampled:

- aircraft (`apache`, `f35`, `f22Raptor`, or `isAirUnit`), factory-exit, embarked, carrier, and transport operations
- hold-position orders and units with no driver
- units with no destination, units that have arrived, and harvesters that are harvesting or unloading
- naval units that are only rotating onto their heading

F22 runway and taxi states still skip stuck handling entirely.

## Stuck notice

A unit counts as stuck after patience hits zero until it next moves about a meter, and only for 10 seconds after that expiry. The notice requires more than five **player-owned** stuck units inside some circle of radius five tiles. Enemy-only crowds do not raise it. The link selects the living player units in that circle. The same neighborhood is not announced again for 30 seconds.

## Performance

No per-frame path search, notification, or `Set`/`Map` allocation. Dodge pathfinding and the cluster geometry run only on patience expiry. The geometry set is capped at the 48 stuck units closest to the unit that just expired.

Hardware 75 FPS acceptance is pending. This environment has no verified hardware GPU, so Patrick should confirm 75 FPS on `dev` with a crowded move order.
