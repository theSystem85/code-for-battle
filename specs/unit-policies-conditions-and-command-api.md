# Unit policies — conditions, command API and activity display

Status: implemented on branch `cursor/programmable-unit-policies-c5c1` (PR #728, not in `main` until merged). Companion to [Unit policies — first slice](unit-policies-first-slice.md). Requirements source: the Google-Doc requirement list folded into the [programmable units feature list](../docs/programmable-units-feature-list.md).

Marks used below: **Built** = in the code with unit tests. **Later** = spec only, no code. **Skipped** = the game has no such field today, so no fake stat was invented.

## 1. Condition catalog

A condition is a tree of leaves joined by `not`, `and`, `or` (nesting allowed). Leaves are `always`, `compare`, `check`, and the two first-slice leaves `enemyInRange` and `underFire`. The catalog lives in `src/policies/policyConditions.js` and drives validation (`policySchema.js`), the evaluator (`policyStep.js`, through `view.measure`), the editor (`src/ui/policies/conditionRows.js`) and the rule summaries.

`compare` is `{ type: "compare", field, op, value, mode?, params? }`.

- Operators: `==`, `<=`, `>=`, `<`, `>`. `==` uses a per-field tolerance (for example 0.5 percentage points of a fraction, 5° for angles, 0 for integers) because a float never lands on an exact value.
- `mode` is `relative` (a fraction 0..1, or degrees relative to the wagon for the turret) or `absolute` (raw game units). A field offers only the modes that make sense for it.
- Angles are compared on the circle, so 359° is close to 1°.
- A measurement the game cannot take (for example fuel on a unit with no fuel tank) is **never true**, whatever the operator. `not` of it is true only because the inner leaf is false; authors who mean "has fuel and it is low" combine with `and`.

`check` is `{ type: "check", check, params? }` for yes/no facts.

### Internal (the unit itself)

| Condition | Field / check | Status |
| --- | --- | --- |
| HP (relative or absolute) | `hp` | Built |
| Experience (relative or absolute) | `xp` | Built |
| Rank 1–3 | `rank` | Built (`unit.level`, absolute only) |
| Fuel | `fuel` | Built (units with a gas tank) |
| Ammo | `ammo` | Built (units that carry ammunition; the right counter is picked per unit type) |
| Reload status | `reload` (1 = ready, absolute = ms left) | Built (units with a fire rate) |
| Crew status | `crew` (present fraction or count) | Built |
| Crew status per role (driver, gunner, …) | — | **Skipped**: only the present fraction/count is exposed to policies; listed in `UNSUPPORTED_CONDITIONS` as `crewByRole` |
| Load status | `load` | Built (harvester ore, ambulance medics, tanker truck fuel cargo, ammunition truck cargo); other unit types have no load and never satisfy it |
| Wagon rotation | `rotation` (°) | Built |
| Turret rotation | `turretRotation` (° absolute, or ° relative to wagon) | Built |
| Is airborne | `airborne` | Built |
| Is moving | `moving` | Built |
| Is attacking a unit / a building | `attacking` + `kind` | Built |
| Is serving a unit | `serving` | Built |

### External (the world around the unit)

| Condition | Field / check | Status |
| --- | --- | --- |
| Base money | `money` | Built (human: `gameState.money`; AI factions through `partyStates`) |
| Power | `power` (supply minus demand) | Built (AI factions: aggregated `enemyPowerSupply`) |
| Number of my buildings, of a type or any | `buildingCount` + `buildingType` | Built |
| Is under service | `underService` | Built |
| Is under service by someone | `underServiceByUnit` | Built |
| Is in range of a hospital / ammo factory / fuel station / workshop | `inServiceRange` + `building` | Built (service radius from `getServiceRadiusPixels`) |
| Is protected by a unit | `protectedByUnit` | Built |
| Is in range of a defense building / of a combat or service unit | `inDefenseRange` + `by` | Built |
| Can attack a unit / a building | `canAttack` + `kind` | Built |
| Is in visible range of an enemy unit / building | `inVisibleRange` + `by` | Built |
| Is parked at an airstrip / helipad / workshop | `parkedAt` + `place` | Built |
| Got a direct hit by a unit / building | `hitDirect` + `by` | Built |
| Got an indirect hit by a unit / building | `hitIndirect` + `by` | Built |
| Is under attack by a unit / building, only while the attacker is visible | `underAttackBy` + `by` | Built |
| Attacker of a hit is visible (hit **history**) | — | **Skipped** (`attackerInVisibleRangeOfHit`): only the last hit is recorded |
| Distance to a visible unit / building (optionally of a type) | `distance` + `kind` + `targetType` | Built (tiles; only visible targets count) |

### Sensing

| Condition | Check | Status |
| --- | --- | --- |
| An enemy of the chosen type, or any, is visible | `enemyVisible` + `targetType` | Built |
| An enemy of the chosen type, or any, is in my fire range | `enemyInFireRange` + `targetType` | Built |
| Some or any of my units of a type are in an enemy's fire range | `myUnitsInEnemyRange` + `unitType` | Built |
| Nearest enemy distance (first-slice field) | `enemyDistance` | Built (kept for old documents) |

### Approximations (stated honestly)

- **Visibility.** A human owner's visibility is the real shadow-of-war visibility. For an AI owner, which has no personal fog map, a target counts as visible when it is inside the unit's own vision range.
- **Direct versus indirect hit.** A hit is recorded in `unit.lastHit` (`src/game/hitRecord.js`: time, direct, attacker, byBuilding), non-enumerable so saves are unchanged. A hit is **indirect** when it came from splash damage or from a howitzer or artillery turret shooter. Everything else is direct.
- **Money / power** for a non-human owner are read from the party state, not from the human HUD fields.
- The sensing helpers build their indexes (served units, protected ids, building counts, visible enemy counts) lazily, at most every 250 ms, and reuse their containers. They run only when a policy that uses them is evaluated.

## 2. Unit command API

`src/policies/unitCommandApi.js` is the one internal way policy code gives a unit an order.

```js
executeUnitCommand(name, unit, args, ctx) // -> boolean
canExecuteUnitCommand(name, unit, args, ctx)
refuseUnitCommand(name, unit, args, ctx)  // -> reason string or null
```

- A command runs only when the engine allows it for that unit and the current world. If not, it returns `false`, changes nothing on the unit, and never throws.
- Commands go through the same handlers a player's order uses (`UnitCommandsHandler`) but are wrapped in `runAsPolicy` (`policyIssuer.js`), so a policy order is never mistaken for a **direct order**. Direct-order precedence from the first slice is unchanged.
- Heavy game helpers (fire range, firing, target filter) are injected through the shared policy context (`policyGameBindings.js`), so the module and its tests do not import the game.
- Map physics (collision, occupancy, terrain) stay the only thing that may push a unit. Tile position keeps the center-based formula.

| Command | Who may use it | Status |
| --- | --- | --- |
| `moveForward`, `moveBackward` | ground, naval and air units that can move | Built. **Approximation:** the game has no reverse gear, so "backwards" is a move to the tile behind the current facing (refused when it is blocked) |
| `moveSidewaysLeft`, `moveSidewaysRight` | helicopters only | Built |
| `turnLeft`, `turnRight` | units with a facing | Built (15° step per call) |
| `turretLeft`, `turretRight` | tanks only (`tank`, `tank_v1`, `tank-v2`, `tank-v3`) | Built (about 12.9° step per call) |
| `takeoff`, `land` | helicopters and F-35 only | Built |
| `aimAndLock` | tanks | Built: aims the turret at a target and locks it without firing |
| `fireAtLocked` | tanks with a lock in range and loaded | Built |
| `fireForward` | tanks | Built: fires along the turret direction, independent of any lock |
| `requestRefill` (`ammo` / `health` / `fuel`) | any unit that uses that resource | Built: asks the matching service unit (ammunition truck / recovery tank / tanker truck) to come |
| `goToWorkshop` | land vehicles | Built |
| `goToHospital` | ambulances only (to restock medics) | Built |
| `goToAmmoFactory` | ammunition trucks only | Built |
| `attackAndChase` | combat units | Built (existing attack handler) |
| `attackInRange` | combat units | Built: attack a target that is in range, never chase; the target is released when the unit would have to move (`onRefused`) |
| `autoAttackInRange` | combat units | Built: pick whatever is in range automatically |
| `serviceTarget` | service units only | Built (ambulance, tanker truck, ammunition truck, recovery tank) |
| `protect` | combat and service units | Built: follow and guard a friendly unit |
| `retreatTo` | movable units | Built (first-slice retreat) |
| `stop` | any | Built (hold) |

Limits stated plainly: only `tank`, `tank_v1`, `tank-v2`, `tank-v3` accept aim, fire and turret commands; every other type refuses them (`tank-v3` needs a tighter aim than the others before it may fire at a lock). Howitzers, rocket tanks and the other types have no free-aim turret in the game; they still attack through `attackAndChase`/`autoAttackInRange`.

Tests: `tests/unit/unitCommandApi.test.js` covers allowed and refused commands for every command above (wrong unit type, no target, out of range, blocked tile, missing service building, empty stock, cooldown).

## 3. Effects (what a state does)

Each effect is a catalog entry in `src/policies/policyEffects.js` (`command`, `repeat`, `params`, `needsEnemy`) that calls the command API. `repeat: "idle"` re-asserts only when the unit has nothing to do (as in the first slice); `repeat: "tick"` is for per-step commands such as turning and firing.

Built: attack nearest enemy (chase), attack enemies in range (no chase), aim and lock nearest enemy, fire at locked, fire in turret direction, turret left/right, protect nearest friendly, hold, retreat, move forwards/backwards/sideways, turn left/right, take off, land, request refill (ammo/health/fuel), go to workshop/hospital/ammo factory, service nearest friendly.

Programmable unit types are now: `tank`, `tank_v1`, `tank-v2`, `tank-v3`, `rocketTank`, `howitzer`, `apache`, `f35`, `ambulance`, `tankerTruck`, `ammunitionTruck`, `recoveryTank`.

Existing human and enemy-AI code is **not** rewritten to use this API (see [Later](#5-later-spec-only)).

## 4. Activity counts, HUD icon, automation status

A policy **actively controls** a unit while all of these hold (`src/policies/policyActivity.js`):

1. One of its conditions has fired and a `while` hold is in force, or an `after` delay is running.
2. The state machine is **not in its start state**.
3. The machine has **not finished** (a finished one-time policy sits in an end state).
4. The binding is not gated: no running direct order and not paused by the conflict banner.

Displays (Built):

- **Policy panel.** Every card shows two counts: *enabled* (living units that carry the policy: for a global policy every unit that can carry one, for a per-unit policy the units it was applied to) and *in control* (units it actively controls right now). The count text nodes are updated in place twice a second while the panel is open; cards are not rebuilt.
- **Unit HUD icon.** A small round badge with a bolt at the top-right of the unit, drawn for your own living units with `unit.policyActive`. Hovering it shows a canvas tooltip "Controlled by policy:" plus the policy names. Cost: one flag read per unit, one arc and one small path per controlled unit, one reused hit rectangle, no per-frame allocation.
- **Automation status.** Superseded: the Units-tab popover was removed; each unit and wreck row of the unit detail panel shows the status instead. See [the follow-up spec](unit-policies-after-rule-and-state-machine-view.md).
- Tooltips are custom (`policyTooltip.js`, one shared element), never the native `title` attribute; the same text is exposed as `aria-label`. Scrolling uses the global thin custom scrollbar; the panel and the list each have exactly one scroller.

Tests: `tests/unit/policyActivity.test.js`, `tests/unit/policyActivityUi.test.js`, and the renderer cases in `tests/unit/unitRendererAmmoBar.test.js`.

Performance note: nothing was benchmarked against the 75 FPS gate on qualifying hardware; per-frame cost is as described above and the engine work is gated to units that carry bindings and evaluated at most every 150 ms. The qualifying-hardware check stays outstanding.

## 5. Later (spec only)

None of these is built. They are recorded so the design stays one coherent system.

- **Voice vibe coding.** A spoken command goes to an LLM that returns build commands and unit commands, which are validated and executed through the same paths as a hand-built policy.
- **Hotkeys 1–9 (and higher) run a script.** A hotkey runs a chosen policy/script on the currently selected units.
- **One-click attack plans.** One click starts a scripted plan, for example: two groups wait until an F-22 destroys the artillery; then the artillery hits air defense while the tanks protect it; then aircraft hit the turrets; then the groups destroy the construction yard, the vehicle factory and the remaining buildings. This needs group addressing, cross-group waits and building targets in the schema.
- **Base-build scripts.** Build policies with conditions on money, income per minute, own unit and building counts, and visible enemy unit and building counts. A host may apply one to another player's base (an explicit grant, see the feature list).
- **One shared command path.** Replays, the enemy LLM and these scripts all issue orders through the same path. The command API above is the intended foundation.
- **Full migration to the command API.** Every existing human and enemy behavior eventually goes through the unit command API; map physics is the only exception that may push a unit. **Not done in this pass:** existing direct-order code (`UnitCommandsHandler` callers) and the enemy AI (`src/enemy.js`, `src/ai/*`) are untouched. Only new policy code is required to use the API.
- Still open from the first slice: build policies, grants and folders, LLM-written policies, live state-machine view, saved runtime bindings, multiplayer sync, replay transport.
