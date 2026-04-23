# 067 — Apache destruction freeze-period fall animation

## Summary
When an Apache helicopter is destroyed, the game already holds the unit for a 2-second destruction-freeze window before explosion/removal. This spec adds a dedicated in-window fall animation so the helicopter visibly descends and rotates before impact.

## Requirements
- During the existing 2000ms destruction freeze window for `apache`, animate a fall sequence instead of keeping the helicopter static.
- The Apache must rotate a total of **270 degrees** over the freeze duration.
- The Apache altitude must decrease across the same window until it reaches near-ground at impact time.
- Rotor blades must continue spinning during the fall with visible deceleration, reaching a full stop at the 2s impact point.
- At the end of the freeze period, existing destruction behavior remains intact (explosion SFX/VFX and unit removal).

## Implementation notes
- Reuse `destructionQueuedAt` timing as the single source of truth for progression through the fall animation.
- Cache per-unit initial fall state (base direction + starting altitude) when destruction is first queued, then derive frame-by-frame direction/altitude from normalized progress.
- Cache initial rotor angle + speed at destruction queue time and compute a deterministic decelerating spin profile that ends at zero speed at `t=2000ms`.
- Keep deterministic behavior by deriving fall progress from simulation-time cleanup ticks, not ad-hoc render timers.

## Validation
- Unit tests should verify that: (a) Apache remains present during freeze, (b) altitude falls and direction rotates during freeze, and (c) explosion/removal still happen after freeze expiry.
