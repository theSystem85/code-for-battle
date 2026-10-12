# CFBL language reference — version 1

CFBL means **code-for-battle-language**. It describes Automation state machines for Code for Battle: control a unit or defence building, or build units/buildings. DAV (Buttons) and ATV (CFBL) edit the same source with automatically generated state indexes.

Start with the [Automation tutorial](automation-tutorial.md). Implementation contracts live in [specs 099–108](../specs/099-automation-cfbl-program.md); [release evidence](automation-release-evidence.md) records validation and outstanding real-device checks.

This reference reproduces the complete grammar, closed catalogs, explanations and examples from [the normative language contract, spec 100](../specs/100-cfbl-language-and-coverage.md). When implementation changes that contract, regenerate/update this reference and validate every example against the real parser. Catalog spellings are fixed keywords and enum values, not variable names. Automation display titles are metadata; states have indexes 1 through n, with n at most seven.

## Guided text entry

Choose an automation category first. The editor generates a legal skeleton. Place the caret/select a token and search the flyout of options legal at that location; fuzzy matching searches labels and spellings. Choose an option to commit it. Unfinished queries and number entry are staged outside committed source. A bounded numeric field accepts only valid values. Both views stay in sync and both generate CFBL source even if only Buttons is used. Paste is accepted atomically only when the resulting source is valid.

## Entire structural grammar (EBNF)

Terminals are quoted. `{ x }` means zero or more repetitions, `[ x ]` optional, `|` alternative. Whitespace separates tokens; indentation/newlines do not change behavior. Case is significant. EOF requires a complete program. One program defines one automation.

```ebnf
program          = category, "{", scope, execution, initial, state, { state }, "}" ;
category         = "control", ("unit" | "defence-building")
                 | "build", ("unit" | "building") ;
scope            = "scope", ("global" | "individual"), ";" ;
execution        = "run", ("continuous" | "once"), ";" ;
initial          = "start", stateIndex, ";" ;
state            = "state", stateIndex, "{", action, { rule }, "}" ;
action           = "do", ("wait" | effectCall, [ completionWait ]), ";" ;
completionWait   = "wait", "until", ("produced" | "done") ;
rule             = ifRule | whileRule | afterRule ;
ifRule           = "if", "(", condition, ")", "goto", stateIndex, ";",
                   [ "else", "goto", stateIndex, ";" ] ;
whileRule        = "while", "(", condition, ")",
                   [ "until", "(", condition, ")" ], "goto", stateIndex, ";" ;
afterRule        = "after", delay, "if", "(", condition, ")",
                   "goto", stateIndex, ";" ;
condition        = orExpression ;
orExpression     = andExpression, { "or", andExpression } ;
andExpression    = unaryExpression, { "and", unaryExpression } ;
unaryExpression  = [ "not" ], ( atom | "(", condition, ")" ) ;
atom             = "always" | "enemyInRange" | "underFire"
                 | checkCall | comparison ;
comparison       = fieldCall, ".", mode, compareOperator, number ;
mode             = "relative" | "absolute" ;
compareOperator  = "==" | "<=" | ">=" | "<" | ">" ;
fieldCall        = numericField, "(", [ argumentList ], ")" ;
checkCall        = checkName, "(", [ argumentList ], ")" ;
effectCall       = effectName, "(", [ argumentList ], ")" ;
argumentList     = argument, { ",", argument } ;
argument         = parameterKey, "=", ( enumValue | number ) ;
delay            = integer, "s" ;
stateIndex       = positiveInteger ;
positiveInteger  = nonzeroDigit, { digit } ;
integer          = "0" | positiveInteger ;
number           = [ "-" ], integer, [ ".", digit, { digit } ] ;
digit            = "0" | nonzeroDigit ;
nonzeroDigit     = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
```

`numericField`, `checkName`, `effectName`, `parameterKey`, and `enumValue` are the **closed catalog terminals enumerated below**, with category-dependent validity. The lexer recognizes a candidate catalog token as ASCII `[A-Za-z][A-Za-z0-9_-]*`; this is lexical recognition, not permission for arbitrary identifiers. No strings, comments, assignment statements, `!=`, exponent syntax, `NaN`, infinity, percentages as numeric suffixes, or variables in v1. `s` is the literal seconds unit. Canonical delays print `90s` and editor help may explain “1 min 30 sec”. Number entry accepts finite decimals where the current schema does; retain exact precision necessary to preserve imported finite JavaScript values by printing a non-exponent decimal expansion. Values exceeding numeric-domain bounds fail validation.

`wait` maps to a null state effect. An effect call can optionally end with `wait until produced` for either production category, or `wait until done` for a finite unit-control action. This modifier is not allowed on `do wait`, defence intents or persistent unit actions. It is represented by a completion checkbox in Buttons, and both views preserve the same accepted source. Each state has exactly one `do` clause. State declarations must be contiguous 1…n, n ∈ [1,7]; references may point forward but must resolve. The number in a newly inserted state block is generated by the editor, not named by the player. `start` can refer to any existing index. Build categories require `scope global`; control categories permit both scopes. `individual` maps to legacy `perUnit`, `once` to `oneTime`; control unit → variant `unit`, build building → `build`, build unit → `unitBuild`; control defence-building → new `defence` variant. Ownership/enablement are outside this grammar.

Arguments may be omitted only when the existing catalog supplies a default; canonical printing writes all defaults explicitly in catalog order and normalizes whitespace/decimal representation. Reject unknown, repeated, wrong-type or out-of-domain arguments. Parameter order on input is arbitrary. Operator precedence is NOT, AND, OR. Parentheses override it. Parentheses themselves do not add condition-tree depth. Preserve existing boolean tree structure where needed using explicit grouping; do not flatten a legacy group merely for pretty-printing if it changes depth validation. The depth limit is four nested combinator edges; both views preserve this structure.

## Numeric field terminals and domains

U = control unit; B = build building; P = build unit; D = control defence-building. Category eligibility is defined by the shared language catalog. Relative values are fractions (0.25 means 25%), except `turretRotation.relative`, which is signed degrees. Every comparison explicitly states its mode so generated text never ambiguously changes an absolute measurement into a fraction. Units/tolerance come from shared metadata, not suffix guesses.

| Terminal | Modes and domain | Params (default) | Categories |
| --- | --- | --- | --- |
| `hp` | relative 0…1; absolute 0…100000 | none | U,D |
| `xp` | relative 0…1; absolute 0…100000 | none | U |
| `rank` | absolute 0…3 (retain current schema even though UI says 1–3) | none | U |
| `fuel` | relative 0…1; absolute 0…100000 | none | U |
| `ammo` | relative 0…1; absolute 0…100000 | none | U,D where measurable |
| `reload` | relative 0…1 (1 = ready); absolute 0…600000 ms left | none | U,D |
| `crew` | relative 0…1; absolute 0…10 | none | U |
| `load` | relative 0…1; absolute 0…100000 | none | U |
| `rotation` | absolute 0…360 degrees | none | U |
| `turretRotation` | absolute 0…360; relative -180…180 degrees from body | none | U; D absolute only |
| `money` | absolute -1000000000…1000000000 | none | U,B,P,D |
| `moneyPerMinute` | absolute 0…1000000000 | none | B,P |
| `power` | absolute -100000…100000 | none | U,B,P,D |
| `unitCount` | absolute 0…1000 | `unitType=any` | B,P |
| `enemyUnitCount` | absolute 0…1000, visible only | `unitType=any` | B,P |
| `buildingCount` | absolute 0…1000 | `buildingType=any` | U,B,P,D |
| `enemyBuildingCount` | absolute 0…1000, visible only | `buildingType=any` | B,P |
| `distance` | absolute 0…1000 tiles | `kind=unit,targetType=any` | U,D |
| `enemyDistance` | absolute 0…1000 tiles, legacy nearest-enemy field | none | U,D |

Current `distance.targetType` options use the unit-type catalog even with `kind=building`; This preserves imported U machines. D supports `kind=unit`; building-target sensors are not available.

Retain equality slack/circular comparisons from `policyConditions.js`: fractional fields generally 0.005; absolute HP/XP/fuel/ammo/load 0.5; reload relative 0.005 and absolute 50 ms; crew absolute/count/rank exact; rotation/turret rotation 5 degrees with circular absolute angle equality; money/income/power 0.5; distance 0.25 tiles. Do not introduce different comparison semantics in the compiler.

## Check and legacy-atom terminals

All listed calls use `()`, including parameterless checks. U-only unless categories say otherwise.

| Terminal | Parameters and defaults | Meaning |
| --- | --- | --- |
| `ownUnitDestroyed` | `unitType=any` | P only: owned unit loss in one gated 1-second pass; preserve tank production/sensor alias |
| `airborne` | none | Is airborne |
| `moving` | none | Is moving |
| `attacking` | `kind=unit` | Attacking a unit/building; U,D |
| `serving` | none | Serving a unit |
| `underService` | none | Under service |
| `underServiceByUnit` | none | Under service by a service unit |
| `inServiceRange` | `building=hospital` | Within the service building's range |
| `protectedByUnit` | none | Protected by a unit |
| `inDefenseRange` | `by=building` | In range of friendly defence building or friendly combat/service unit |
| `canAttack` | `kind=unit` | Has an attackable target; U,D (`kind=unit` for initial D sensor support) |
| `inVisibleRange` | `by=unit` | In an enemy's visible range |
| `parkedAt` | `place=helipad` | Parked at a supported facility |
| `hitDirect` | `by=unit` | Most recent hit was direct |
| `hitIndirect` | `by=unit` | Most recent hit was indirect |
| `underAttackBy` | `by=unit` | Under attack by a visible attacker |
| `enemyVisible` | `targetType=any` | Visible enemy unit of selected type; U,D |
| `enemyInFireRange` | `targetType=any` | Enemy unit in effective fire range; U,D |
| `myUnitsInEnemyRange` | `unitType=any` | Some friendly units in an enemy fire range |

Legacy bare atoms: `always` for U/B/P/D; `enemyInRange` and `underFire` for U/D. They retain their original meaning rather than being silently replaced by a vaguely similar new check. Unsupported conditions `crewByRole` and `attackerInVisibleRangeOfHit` remain unavailable. Missing/nonapplicable numeric measurements make a comparison false, missing checks false; NOT retains the current boolean inversion (so NOT of a false unavailable leaf is true). Document this explicitly in help; changing to three-valued logic is out of scope.

## Effect terminals and parameters

All zero-parameter effects require `()`. U-only except explicit D/B/P entries. “idle” repeats a WHILE-held effect when idle, at most once per second; “tick” repeats on automation evaluation, not every rendered frame. A state effect executes when a transition enters it; the current engine does not execute the initial state's effect immediately merely because a binding was created. Preserve this; templates normally start with `do wait;`.

| Terminal | Params (default/domain) | Repeat / command meaning |
| --- | --- | --- |
| `attackNearestEnemy` | none | idle / attack and chase |
| `autoAttackInRange` | none | tick / no-chase attack; U,D |
| `aimNearestEnemy` | none | tick / aim and lock; U,D |
| `fireAtLocked` | none | tick / fire at locked target; U,D |
| `fireForward` | none | tick / fire along turret direction; U,D gun turrets only |
| `turretLeft`, `turretRight` | none | tick / rotate turret; U,D with rotatable turret |
| `protectNearestFriendly` | none | idle / protect closest friendly unit |
| `hold` | none | idle / stop moving (U only) |
| `retreat` | none | idle / retreat to base |
| `moveForward`, `moveBackward`, `moveLeft`, `moveRight` | `tiles=2`, finite number 1…20 | idle / movement; sideways meaningful for helicopters |
| `turnLeft`, `turnRight` | none | tick / body turning |
| `takeoff`, `land` | none | idle / Apache and F-35 flight command |
| `requestRefill` | `resource=ammo` | idle / request ammo, health or fuel service |
| `goToWorkshop`, `goToHospital`, `goToAmmoFactory` | none | idle / travel to selected service category |
| `serviceNearestFriendly` | none | idle / service target using a service unit |
| `buildBuilding` | `buildingType=powerPlant` | B only / normal construction queue |
| `buildUnits` | `unitType=tank,quantity=1,delivery=factoryRally`; quantity integer 1…20 | P only / normal production queue with spawn delivery |
| `holdFire` | none | D only / suppress firing; persistent intent until another defence action/direct order overrides it |
| `resumeFire` | none | D only / clear automation fire suppression and restore normal defensive targeting |

`holdFire`/`resumeFire` are idle commands, applied on entry; held reassertion is idempotent. Unit movement accepts fractional `tiles`. Unit-production quantity must be an integer as required by its command API, Fractional legacy quantities require repair rather than silent rounding.

## All enum terminals

- **Sensor unit type** (`unitType` for count/loss/myUnits checks; `targetType` for sensing): `any`, `tank_v1`, `tank-v2`, `tank-v3`, `rocketTank`, `howitzer`, `harvester`, `ambulance`, `tankerTruck`, `ammunitionTruck`, `recoveryTank`, `mineLayer`, `mineSweeper`, `apache`, `f22Raptor`, `f35`, `destroyer`, `battleship`, `submarine`, `aircraftCarrier`, `supplyShip`, `hovercraft`, `vehicleFerry`, `navalMineLayer`.
- **Production unit type** (`buildUnits.unitType`): the same list without `any`, and **`tank` instead of `tank_v1`**. Keep this distinction visible in the typed catalog. Control-unit capability is the narrower set in spec 099.
- **Sensor building type** (`buildingCount`/`enemyBuildingCount`): `any`, `constructionYard`, `powerPlant`, `oreRefinery`, `vehicleFactory`, `vehicleWorkshop`, `hospital`, `gasStation`, `ammunitionFactory`, `radarStation`, `helipad`, `airstrip`, `turretGunV1`, `turretGunV2`, `turretGunV3`, `rocketTurret`, `teslaCoil`, `artilleryTurret`.
- **Production building type** (`buildBuilding.buildingType`): all sensor building types except `any`, plus `concreteWall`. Shipyards and streets require placement workflows unavailable in the present DAV and remain excluded.
- **Delivery**: `factoryRally`, `attackNearest`, `attackHarvester`, `attackBase`, `defendHarvester`, `defendBase`.
- **Kind/by**: `unit` or `building` where its catalog entry permits it.
- **Service building**: `hospital`, `ammunitionFactory`, `gasStation`, `vehicleWorkshop`.
- **Parking place**: `airstrip`, `helipad`, `vehicleWorkshop`.
- **Resource**: `ammo`, `health`, `fuel`.

The complete parameter-key vocabulary is `unitType`, `buildingType`, `targetType`, `kind`, `by`, `building`, `place`, `resource`, `tiles`, `quantity`, `delivery`. Each call accepts only its own keys and values. `relative`/`absolute` are modes, not user identifiers. The shared catalog defines options, descriptions, numeric bounds, defaults, variant eligibility and capability notes for both editors.

## Examples and explanations

### Unit control: repair while damaged, then resume

```cfbl
control unit {
  scope global;
  run continuous;
  start 1;
  state 1 {
    do wait;
    while (hp().relative < 0.25) until (hp().relative >= 0.75) goto 2;
  }
  state 2 {
    do goToWorkshop();
  }
}
```

When HP first drops below 25%, enter state 2 and repeat its travel command while held/idle. At 75% HP, return to state 1. A WHILE without UNTIL returns when its initial predicate becomes false. Initial `do wait` does nothing. One-time WHILE finishes on return; continuous stays available for a future trigger.

### IF/ELSE: choose one move once

```cfbl
control unit {
  scope individual;
  run once;
  start 1;
  state 1 {
    do wait;
    if (enemyInRange) goto 2;
    else goto 3;
  }
  state 2 { do autoAttackInRange(); }
  state 3 { do moveForward(tiles=2); }
}
```

ELSE belongs to the preceding IF. At the first eligible evaluation, choose the true or false branch. Both targets are terminal, so this one-time machine finishes after issuing its entry effect. An IF does not maintain a combat command indefinitely; use WHILE to hold/reassert it.

### Building production: wait for low power to persist

```cfbl
build building {
  scope global;
  run continuous;
  start 1;
  state 1 {
    do wait;
    after 10s if (power().absolute < 0 and money().absolute >= 1000) goto 2;
  }
  state 2 {
    do buildBuilding(buildingType=powerPlant) wait until produced;
    if (always) goto 1;
  }
}
```

The delay starts when both comparisons become true; if either becomes false before ten simulation seconds, it cancels. The action uses normal costs, tech, time and placement. Category opt-in and enablement are required. Returning to state 1 starts another cycle; a continuous terminal state would otherwise remain terminal, not auto-restart.

### Unit production: replace a lost Tank V1

```cfbl
build unit {
  scope global;
  run continuous;
  start 1;
  state 1 {
    do wait;
    if (ownUnitDestroyed(unitType=tank_v1) and money().absolute >= 1000) goto 2;
  }
  state 2 {
    do buildUnits(unitType=tank-v2,quantity=1,delivery=defendBase) wait until produced;
    if (always) goto 1;
  }
}
```

The loss event is visible for a single production evaluation, not queued until affordable. If money is insufficient during that pass this condition is missed; an advanced queued-event feature is out of scope. Queue capacity (100 units), quantity (1–20), correct factories and per-item delivery instructions still apply.

### Defence control: hold fire while ammo is low

```cfbl
control defence-building {
  scope individual;
  run continuous;
  start 1;
  state 1 {
    do resumeFire();
    while (ammo().relative < 0.25) until (ammo().relative >= 0.75) goto 2;
  }
  state 2 { do holdFire(); }
}
```

Applies to an ammo-bearing defence building. Entering state 2 suppresses firing; leaving the hold returns to state 1. The legacy stepper does not execute a source state's effect on WHILE return; Defence control clears its owned hold-fire intent on hold exit so normal defensive behavior resumes. On a Tesla coil without measurable ammo this leaf is unavailable; flyouts explain applicability.

### Parameterized checks and grouping

```cfbl
control unit {
  scope individual;
  run continuous;
  start 1;
  state 1 {
    do wait;
    while ((ammo().absolute < 5 or fuel().relative < 0.2) and not underServiceByUnit()) goto 2;
  }
  state 2 { do requestRefill(resource=ammo); }
}
```

Grouping decides logic, mode decides units. This example requests ammo even if low fuel triggered it; a machine with separate branches is needed to select different resources.

## Wait for command completion

Waiting is optional; without a modifier the current behavior remains unchanged. A wait retains the current numbered state and blocks outgoing rules, WHILE return/reassertion and one-time finishing until its exact issued objective completes. An accepted command is not issued repeatedly while waiting. AFTER timers and other rules do not advance during the wait.

**Wait until produced** requires every unit in the requested stack to spawn, or the requested building to be finalized as a placed game entity. It does not wait for unit delivery orders. Other production, a ready blueprint, or an idle queue cannot complete the tracked order. Refused build commands keep the existing retry behavior.

**Wait until done** is supported by `moveForward`, `moveBackward`, `moveLeft`, `moveRight`, `retreat`, `attackNearestEnemy`, `takeoff`, `land`, `goToWorkshop`, `goToHospital` and `goToAmmoFactory`. For example, `do moveForward(tiles=2) wait until done;` waits for arrival at the issued destination; `do attackNearestEnemy() wait until done;` waits for destruction of the originally issued target. Service travel also waits for the associated service objective. Continuous rotation, protection/follow, aim/auto-fire and defence intents have no finite end and do not offer this option.

Choose the checkbox in Buttons, or select the action's `wait until …` completion in the CFBL flyout. Removing the modifier returns to the default behavior. Cancellation, an unreachable objective or a superseding manual command cannot count as successful completion: status explains that work is blocked/failed. Reapply/re-enable the automation or change its accepted behavior to start fresh. Saves retain the issued work and wait, so restoring does not order it again. See [spec 109](../specs/109-automation-command-completion-waits.md) for lifecycle and performance contracts.
