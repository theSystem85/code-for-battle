# Spec 048: F22 runway robustness and combat command reliability

## Problem
F22 units can still become stuck in runway state-machine transitions (takeoff/landing/taxi), causing runway starvation for other F22. A separate regression may trigger immediate return-to-land after takeoff even when the player just issued an attack command against a live target.

## Requirements
- Stale runway queue/operation entries must not permanently block runway access.
- F22 state machine must include deterministic timeout recovery for takeoff and landing phases so no F22 can remain stuck indefinitely.
- If an F22 has a live combat assignment and sufficient ammo/fuel, it must not auto-switch into landing flow before attempting target approach/engagement.
- F22 auto-return is only valid when target is destroyed, ammo is exhausted, or fuel is below RTB threshold.
- Increase F22 fuel consumption by 3x globally; additionally apply extra 2x multiplier during takeoff-phase states.

## Validation
- Add E2E coverage for stale runway blocker recovery (landing/takeoff able to proceed).
- Add E2E coverage that attack-assigned F22 does not immediately reland after takeoff while target is alive and ammo/fuel are sufficient.
