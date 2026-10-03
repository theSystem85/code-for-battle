# Unit policies — first slice

Status: implemented (units only). Design source: [programmable units feature list](../docs/programmable-units-feature-list.md). Plan: [orchestration](../docs/programmable-units-orchestration.md).

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
- A state may carry one `effect`. Effects: `attackNearestEnemy`, `retreat`, `hold`.
- A transition has `kind` (`if` or `while`), a `when` condition and a target state `to`. A `while` transition may carry an optional `until` end condition (default: the condition becoming false).
- Conditions: `always`, `compare` (`hp` as a fraction 0..1, or `enemyDistance` in tiles; operators `<`, `<=`, `>`, `>=`), `enemyInRange`, `underFire`, and `not`, `and`, `or`.
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

`tank`, `tank_v1`, `tank-v2`, `tank-v3`, `rocketTank`, `howitzer`.

## UI

- **Policies button** (`#policiesBtn`) opens a panel listing policies with name, scope, execution, a rule summary, Edit, Delete and, for global policies, an enable switch. Enabling does not pause the game.
- **Editor modal** pauses the simulation while open. It offers templates, a state diagram, state cards and rule blocks. An invalid draft shows a red exclamation icon at the top right, a slight red background, and the reason (for example "More than 7 states (this draft has 8). Remove 1 to save."). Save is disabled while invalid.
- **Radial apply menu** opens on right-click or long-press on a programmable unit and lists per-unit policies, plus "Policies…". It uses the shared radial menu with custom tooltips and no native `title`. If no per-unit policies exist the old right-click behavior is kept.
- Custom scrollbars only; the editor has a single scroll container.

## Performance

`updateUnitPolicies` runs once per simulation tick after `processCommandQueues`. It early-outs for units without bindings, reuses one world-view object and one context object (no per-tick allocation), scans for enemies only for policies that need it (cached per document in a `WeakMap`), and evaluates each unit at most every 150 ms. Global bindings are synced only when the policy store version changes.

## Open items after this slice

- Multi-unit selection: the radial menu applies to the unit it was opened on.
- Multiplayer: documents and bindings are not synced; orders issued by remote clients are not hooked on the host.
- Save and load of runtime bindings.
- Build policies, grants and folders, enemy AI migration, LLM-written policies.

## Tests

`tests/unit/policyStep.test.js`, `policyEngine.test.js`, `policyDirectOrderHook.test.js`, `policyConditionRows.test.js`. Run with `npm run test:unit`.
