# Features

- [x] **Systematic AI ground assault**
  AI players attack any opponent in squads. They use the existing danger-zone map to breach the weakest defence on the way to the construction yard, then the vehicle factory, remaining defences, and other buildings. A lone ground unit attacks a base only when it has no ground or air defence. One Apache, F-22, or F-35 may still strike a base with no anti-air. Squads retreat from a fight they would lose, and crew losses (missing gunner or loader) count on both sides. Wounded vehicles sit behind the line. Planning runs at most every 5 seconds and only while the frame still has CPU headroom.
  Spec: [AI ground assault](../specs/2026-11-11-ai-ground-assault.md)

## Verification

- `npm run lint`: pass. `npm run test:ids` reports 5789 declarations, all IDs present and unique.
- `npm run test`: 5879 unit and integration tests passed in 373 files, including U07092–U07112.
- No new Playwright scenario. The assault decisions are deterministic planner tests. `npm run test:e2e` was not run in this environment.
- No verified hardware GPU. No GPU benchmark was run. The 75 FPS check on `dev` stays with Patrick.

## Manual checks on dev

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Squad production | Give an AI a vehicle factory, hospital, and ammunition factory, then watch production after the base defences exist | The AI builds toward one core of tanks and light tanks, one rocket tank, one howitzer, one ambulance, one recovery tank, and one ammunition truck | 4: U07098, U07099, U07100, U07101 | 0 |
| T02 | Weak breach | Fortify one flank with artillery and leave a light turret on the other. Watch an AI with several tanks | Tanks move as one group, shoot the light turret, then the construction yard, the vehicle factory, and the remaining buildings | 2: U07104, U07105 | 0 |
| T03 | Single unit | Leave one AI tank against a turret, then sell every defence | The tank waits while the turret stands, and attacks the construction yard once the base has no ground or air defence | 2: U07102, U07106 | 0 |
| T04 | Retreat and crew | Send a stronger group into an AI squad, then send a tank whose loader is dead | The squad pulls back from the stronger group. It closes on the crew-crippled tank instead of running | 6: U07092, U07093, U07094, U07095, U07096, U07108 | 0 |
| T05 | Other opponents | Start a match with two AI players | Each AI attacks the other AI as well as the human, using that opponent's own base | 1: U07107 | 0 |

- [ ] T01 Squad production
- [ ] T02 Weak breach then base
- [ ] T03 Single tank waits
- [ ] T04 Retreat and crippled crew
- [ ] T05 AI versus AI

## Hot-loop review

The planner runs at most once per AI player per 5 seconds, and it does not run when the previous frame's headroom is below 2ms. One danger map is built per opponent inside that pass. Between passes, a combat unit reads its stored order (a handful of property writes per AI tick, not per rendered frame). Paths are still recalculated only on the existing 5 second decision interval. No per-frame translucent overlay was added.
