# Unit policies — first slice

Status: implemented (units only). The condition catalog, effects and unit command API were extended afterwards; they are specified in [Unit policies — conditions, command API and activity display](unit-policies-conditions-and-command-api.md), which supersedes the vocabulary lists in this file. Design source: [programmable units feature list](../docs/programmable-units-feature-list.md). Plan: [orchestration](../docs/programmable-units-orchestration.md).

## Scope of this slice

In:

- Unit policies only, as inert JSON documents (`schemaVersion: 1`), run as state machines of at most 7 states.
- A pure, deterministic `stepPolicy` and an engine that applies its effects to units.
- `if` and `while` rules, one-time and continuous execution, global and per-unit scope.
- Direct-order precedence, the dominance rule, and a conflict message with "pause until the order is done".
- A pausing editor modal, a policy panel with global switches, and a radial apply menu on a unit (right-click or long-press).
- Owner-only control (a human player, or an AI commanding its own units).

Out (later work, not built here):

- **Build policies** (buildings, base expansion, per-player build opt-in). The schema rejects `variant: "build"`.
- **Explicit grants and folders UI.** `folderId` is stored on the document and nothing else uses it yet. Sharing to another player or an AI is recorded in the feature list only.
- **Enemy AI on the engine.** No existing AI module is migrated and `src/enemy.js` is untouched.
- **LLM-written policies.** When the enemy AI is LLM-driven (`src/ai/llmStrategicController.js`), that LLM may later write and apply unit policies through the same document and the same apply path. This is specified here as future work only. No code in this slice does it.
- Multiplayer sync of policy documents and bindings, and replay transport.

## Policy document (stable, v1)

```json
{
  "schemaVersion": 1,
  "id": "policy-1",
  "name": "Retreat while HP < 25%",
  "variant": "unit",
  "scope": "perUnit",
  "execution": "continuous",
  "folderId": null,
  "initialStateId": "watch",
  "states": [
    {
      "id": "watch",
      "name": "Watch",
      "effect": null,
      "transitions": [
        {
          "id": "rule1",
          "kind": "while",
          "when": { "type": "compare", "field": "hp", "op": "<", "value": 0.25 },
          "to": "react"
        }
      ]
    },
    { "id": "react", "name": "Retreat", "effect": { "type": "retreat" }, "transitions": [] }
  ]
}
```

- `scope`: `global` or `perUnit`. `execution`: `oneTime` or `continuous`.
- A state may carry one `effect`. First-slice effects: `attackNearestEnemy`, `retreat`, `hold`. More effects (all going through the unit command API) are listed in the companion spec; effects may carry `params`, for example `{ "type": "moveForward", "params": { "tiles": 3 } }`.
- A transition has `kind` (`if` or `while`), a `when` condition and a target state `to`. A `while` transition may carry an optional `until` end condition (default: the condition becoming false).
- Conditions: `always`, `compare` (`hp` as a fraction 0..1, or `enemyDistance` in tiles; operators `<`, `<=`, `>`, `>=`), `enemyInRange`, `underFire`, and `not`, `and`, `or`. These stay valid. Additive extensions (schema v1 is unchanged): `compare` also takes `==`, an optional `mode` (`relative` / `absolute`) and `params`, many more `field` values, and a new `check` leaf. Old documents load and behave as before. The full catalog is in the companion spec.
- The document has no owner, enabled flag or recipient list. Those live in the policy store (`src/policies/policyStore.js`). Documents persist in `localStorage` key `cfb-unit-policies-v1`. Runtime bindings are not saved.

### Validation

`validatePolicy` returns `{ valid, errors: [{ code, message, path }] }`. Codes include `too_many_states` ("More than 7 states (this draft has 8). Remove 1 to save."), `variant_not_supported`, `invalid_condition`, `invalid_state`, `invalid_transition`. The editor shows the first problem to the user.

## Semantics

### `if` versus `while`

- `if <cond>` fires once when the condition becomes true (edge-triggered). It does not keep overriding later direct orders.
- `while <cond>` takes effect when the condition becomes true and stays in effect until its end condition. A `while` that becomes true after a direct order overrides that order.
- One-time policies start immediately when applied; their conditions still gate effects, and they finish at a terminal state reached through `if`, or when their `while` hold ends. Continuous policies keep evaluating while enabled.

### Direct orders

- A direct order always wins when it is given. The existing command path is untouched; every `handle*Command` is wrapped so the engine learns that an order was issued.
- After a direct order the unit is in a soft gate (`orderRunning`): `if` rules and the re-assertion of holds are frozen until the order is completed and the unit would otherwise be idle (detected by idleness, with a short start grace of 500 ms).
- A `while` condition that becomes true after the order still overrides it. Example: HP 100%, retreat-while-below-25% active, the player orders an attack, HP drops below 25%, the unit retreats. If the player orders an attack again, the new order wins.

### Dominance and several active policies

Several policies can be active. The last direct order or the last newly activated condition is dominant, using a monotonically increasing sequence number. A hold re-asserts only when the unit is idle, and the holder with the highest activation sequence re-asserts. Applying a per-unit policy counts as the newest command.

### Conflict message

When a `while` policy is currently overriding and the player gives another direct order, the order wins and a banner (`#policyConflictBanner`) shows: "Policy '<name>' conflicts with your new order. Your order wins." with the buttons "Pause policy until order is done" and "Dismiss". Pausing sets a hard `paused` gate on that binding (`pausedUntilOrderSeq`) so a re-triggered `while` cannot override the new order. The policy resumes automatically once the order is fulfilled.

### Permissions

Only the commanding owner (a human player, or an AI commanding its own units) can enable, disable or apply a policy (`canCommandPolicy`). Applying a policy to a unit needs ownership of both the unit and the policy. Global enable works on global-scope policies only.

### Programmable unit types in this slice

`tank`, `tank_v1`, `tank-v2`, `tank-v3`, `rocketTank`, `howitzer` in this slice. Widened afterwards (see the companion spec) to also include `apache`, `f35`, `ambulance`, `tankerTruck`, `ammunitionTruck`, `recoveryTank`.

## UI

- **Policies button** (`#policiesBtn`) opens a panel listing policies with name, scope, execution, a rule summary, Edit, Delete and, for global policies, an enable switch. Enabling does not pause the game.
- **Editor modal** pauses the simulation while open. It offers templates, a state diagram, state cards and rule blocks. An invalid draft shows a red exclamation icon at the top right, a slight red background, and the reason (for example "More than 7 states (this draft has 8). Remove 1 to save."). Save is disabled while invalid.
- **Radial apply menu** uses the shared radial menu with custom tooltips and no native `title`.
  - It lists **only per-unit policies**, plus one "Policies…" entry that opens the policy panel. Global policies are never listed.
  - The shipped "Attack while an enemy is in range" template is global, so it never appears in the menu. Its switch in the policy panel controls it. The two retreat templates are per-unit and do appear.
  - If the player has no per-unit policy the menu stays closed and a right-click keeps its old behavior (including deselecting).
  - Desktop: a right-click on one of the player's own programmable units. The click lands within half a tile of the unit center and moves at most 6 px between press and release.
  - Touch: a still half-second (500 ms) press on the unit center. Moving more than 12 px first cancels it.
  - It is anchored on the unit it was opened on and applies to that unit only. Choosing an already applied policy removes it. Opening it does not pause the game.
- Custom scrollbars only; the editor has a single scroll container.

## Performance

`updateUnitPolicies` runs once per simulation tick after `processCommandQueues`. It early-outs for units without bindings, reuses one world-view object and one context object (no per-tick allocation), scans for enemies only for policies that need it (cached per document in a `WeakMap`), and evaluates each unit at most every 150 ms. Global bindings are synced only when the policy store version changes.

## Checklist: built and remaining

Checked means it is in the code on branch `cursor/programmable-unit-policies-c5c1` (PR #728), not yet in `main`. The same checklist lives in the [feature list](../docs/programmable-units-feature-list.md#checklist-built-and-remaining).

Built in the first slice:

- [x] Policy JSON schema v1 with validation and a cap of 7 states.
- [x] Pure, deterministic `stepPolicy`.
- [x] `if` (fires once) and `while` (holds until its end condition) rules; one-time and continuous execution; global and per-unit scope.
- [x] Policy store with owner-only enable, disable and apply; policy documents persist in `localStorage`.
- [x] Engine applying `attackNearestEnemy`, `retreat` and `hold` to the programmable unit types, once per tick.
- [x] Direct orders win; a newly true `while` overrides an older order; newest command or newly triggered condition is dominant; several policies can be active.
- [x] Conflict banner with "Pause policy until order is done".
- [x] Pausing editor modal, invalid-draft treatment, policy panel with global switches, radial apply menu, three templates.
- [x] Unit tests and a browser run of the editor, radial, conflict and pause flow.
- [x] **Known UI bug: policy-card toggle clipped on phone widths.** Found on the Netlify preview of PR #728. The switch styled one `::after` as both knob and hover tooltip. Fixed on this branch in commit `65b112c1`; it reaches `main` with the PR.

Remaining on the unit slice:

- [ ] Live in-game state-machine view and trace export (the editor draws the diagram; the live view and export do not exist).
- [ ] Apply a radial choice to every selected unit.
- [ ] Save and load of runtime bindings.
- [ ] Multiplayer sync of documents and bindings; hook remote client orders on the host.
- [ ] Replay transport.
- [ ] Exercise the touch long-press path in a real browser or device test (the browser run covered the desktop right-click only).
- [ ] Measure the engine tick cost against the 75 FPS gate with realistic unit counts.
- [ ] Decide on harvester automation and on shipped enemy policies in the builder.

Built after this slice (details in the [companion spec](unit-policies-conditions-and-command-api.md)):

- [x] Long condition list with `==, <=, >=, <, >`, `not`/`and`/`or` nesting, internal, external and sensing conditions, wired into schema, validation, editor and `stepPolicy` tests. Two conditions are skipped because the game has no such data (crew per role, hit history).
- [x] Unit command API that returns `false` when a command is not allowed; policy effects go through it.
- [x] Policy activity counts on each card, HUD icon, and long-press controlled-unit list.

Later, spec only (not built): voice vibe coding, hotkeys running a script on selected units, one-click attack plans, base-build scripts with money/income/count conditions (including a host applying one to another player's base), one shared command path for replays/enemy LLM/scripts, and migrating every existing human and enemy behavior onto the command API (map physics is the only exception).

Later work (not started):

- [ ] Build policies.
- [ ] Explicit grants and the folder UI.
- [ ] Enemy AI migration onto the engine.
- [ ] LLM-written policies.

## Open items after this slice

- Multi-unit selection: the radial menu applies to the unit it was opened on.
- Multiplayer: documents and bindings are not synced; orders issued by remote clients are not hooked on the host.
- Save and load of runtime bindings.
- Build policies, grants and folders, enemy AI migration, LLM-written policies.

## Tests

`tests/unit/policyStep.test.js`, `policyEngine.test.js`, `policyDirectOrderHook.test.js`, `policyConditionRows.test.js`, `policyPanelSwitch.test.js`, plus `policyConditions`, `policySensors`, `unitCommandApi`, `policyActivity` and `policyActivityUi` for the follow-up. Run with `npm run test:unit`.
