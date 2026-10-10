# Unit build automation policies

## Status

Implemented on 2026-10-09.

## Goal

Add **Unit build policies** as the third automation category beside unit-control policies and base-building policies. A player can define the conditions under which one or more units enter the normal production queue and choose the first order delivered units receive.

## Policy model

- Policy variant: `unitBuild`.
- Scope: global (the player's production system).
- Execution: one-time or continuous, using the existing state-machine rules (`if`, `while`, and `after`).
- Conditions: money, power, income, friendly unit/building counts, visible enemy unit/building counts, logical condition groups, delays, and the event-like `ownUnitDestroyed` check with a unit-type parameter.
- Action: `buildUnits` with a unit type, an integer stack size from 1 through 20, and a delivery order.
- The loss check is true for one one-second policy evaluation after an owned unit disappears. The `tank` production alias also satisfies a `tank_v1` loss check.

## Production and safety rules

- The action supports all currently producible land, air, and naval units.
- Land vehicles continue to use Vehicle Factories, Apaches use Helipads, jets use their normal facilities, and ships use Shipyards because automation enters the existing `productionQueue` instead of spawning directly.
- The existing button availability/tech state, pause/replay/AI locks, build cost, build duration, power penalty, factory selection, and spawn validation remain authoritative.
- One action may stack at most 20 units and automated orders may not push the shared unit queue above 100 entries.
- Unit-build automation is opt-in per player and persists separately from base-build automation.

## Delivery orders

Each queue item stores its own delivery instruction so mixed stacks retain their intended behavior across later production and save/restore:

1. use the producing factory's rally point;
2. attack the nearest enemy;
3. attack an enemy harvester;
4. attack an enemy construction yard (or another enemy building if it is gone);
5. protect an owned harvester;
6. deploy to the owned construction yard to defend the base.

Attack and protection delivery uses the existing unit command API. Base defense uses the existing movement command handler. If the requested target no longer exists when production finishes, the command is safely skipped rather than selecting a stale entity.

## Shipped templates

- Replace a destroyed Tank V1 with a Tank V2 and deploy it at the base.
- Build a three-tank escort group and assign it to an owned harvester.
- Build two rocket tanks and send them after an enemy harvester.

## Performance notes

`updateBasePolicies` is called each simulation tick, but policy evaluation remains gated to once per 1,000 ms. Loss detection adds one linear pass over owned units per gated pass while either base or unit-build automation is opted in: at 200 units this is approximately 200 identity/type checks per second, independent of canvas DPR. No render path, canvas draw, per-entity frame loop, image preparation, or allocation-heavy per-frame lookup was added. Delivery target selection runs once when a produced unit spawns, not every frame.

The automated unit and UI unit tests are reproducible with `npm run test:unit`. A qualifying-hardware 75 FPS presentation certification was not available in this headless environment; because no frame/render hot path changed, the hardware-only scrolling/render scenarios remain outside this feature's measured scope.
