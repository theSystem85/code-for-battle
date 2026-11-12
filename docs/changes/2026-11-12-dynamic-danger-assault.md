# Features

- [x] **Dynamic danger overlay**
  The danger-zone key now cycles a dynamic layer for each party after the stationary maps. It is off until the player turns it on. The layer shows coarse danger from enemy vehicles.
  Spec: [Dynamic danger and retreat fire](../specs/2026-11-12-dynamic-danger-assault.md)

# Improvements

- [x] **Retreat fire and combined-danger assaults**
  A retreating squad still shoots attackers in range while it moves toward lower danger. Squads clear in-range units and defences before the next base building, and the breach path uses stationary defences plus the dynamic vehicle map.
  Spec: [Dynamic danger and retreat fire](../specs/2026-11-12-dynamic-danger-assault.md)

## Verification

- `npm run lint`: pass. 5796 test declarations, all IDs unique.
- `npm run test`: 5886 tests passed in 374 files.
- `CONTEXT=branch-deploy BRANCH=dev npm ci --include=dev && npm run build && npm run test:smoke`: pass. Map sprite check verified 21 sheets. Smoke test U00001 passed.
- No hardware GPU. The 75 FPS check on dev stays with Patrick.

## Manual checks on dev

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Retreat fire | Make an AI squad lose a fight and watch it pull back while the attacker stays in range | The squad moves away and its tanks keep firing | 1: U07116 | 0 |
| T02 | Dynamic map | Toggle the danger-zone key through every party | It starts off, shows the stationary map, then the dynamic layer, then turns off | 2: U07113, U07115 | 0 |
| T03 | Corridor | Put a strong tank on one flank and a light turret on the other | The assault uses the quieter flank | 1: U07117 | 0 |
| T04 | Threats first | Park an enemy tank or turret next to an AI squad that is marching on a construction yard | The squad fights that threat before the yard, and a losing fight retreats toward quieter ground | 2: U07118, U07119 | 0 |

- [ ] T01 Retreat fire
- [ ] T02 Dynamic overlay
- [ ] T03 Quieter corridor
- [ ] T04 In-range threats

## Hot-loop review

The dynamic grid is not rebuilt per frame. A refresh is one comparison until 5 seconds have passed and the previous frame had at least 2 ms of headroom. Only units that changed cell, health bucket, or crew are restamped. The overlay draws strokes for visible coarse cells with danger, and only while the player has turned it on. Squad orders are still applied as a few property writes per AI tick.
