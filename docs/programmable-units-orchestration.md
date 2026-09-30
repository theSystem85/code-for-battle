# Programmable units — implementation orchestration

Status: plan only. No game or runtime code is changed by this document.

This is the implementation plan for the six areas in the starting spec, [Programmierbare Einheiten](programmable-units-feature-list.md). That spec stays the design source (it is written in German). This file says how the work is split, what each stream may assume, and what has to be settled before the others build on it.

## Workstreams

| Id | Stream | Owns |
| --- | --- | --- |
| W1 | Programmable units | Binding a policy to a unit, and the unit-side data that says which policies that unit may run. Direct orders stay intact. |
| W2 | Drag-and-drop builder | The block palette, the canvas, and the connections between blocks. It produces a policy document. It does not run the battle. |
| W3 | Trigger rules and state-based rules | The meaning of the two rule kinds, and the pure evaluation of one rule against a world view. |
| W4 | Policies switchable mid-battle | The activation record and the command that turns a finished policy on or off during a battle. |
| W5 | Shared behavior engine | The scheduler that runs player policies and enemy policies on one engine, the read model other streams display, and the only edit to `src/enemy.js`. |
| W6 | UI visualization | Battle presentation of policy name, on/off state, and a short view of the rules, including a visible difference between triggers and state rules. |

W2 is the editor. W6 is the in-battle view. They may share a visual language (a trigger does not look like a state rule). They do not share write access to the engine.

## 1. Parallel work and sequential dependencies

### Gate: policy JSON semantics

Every implementation stream waits on one written decision: the policy JSON semantics in section 4. Until that decision is accepted, streams may read the starting spec and sketch against throwaway examples. They do not publish types, fixtures, or events that another stream is expected to keep.

The gate is a short design step. W3 writes the rule-kind rules that the document must be able to express. W5 publishes the schema, because the engine is the consumer of record and the enemy policies must round-trip through the same document. W1, W2, W4, and W6 review it. One schema version is accepted. Later changes bump that version.

### After the schema is accepted, these streams run in parallel

- **W3** implements the pure evaluator for one trigger and one state rule, tested with fixture world views.
- **W5** implements document validation, the player entry point, the per-tick schedule, and the read model, calling the W3 evaluator through the interface in section 2. Fixture policies are enough to start.
- **W2** builds the palette and canvas and emits policy documents that validate against the schema. It does not need a live battle to do that.
- **W1** implements unit binding against the assignment object defined in the schema.
- **W4** implements the activation record and the on/off command against the schema. Fixture owners are enough to start.
- **W6** builds the battle presentation against the engine read-model fixture, including the trigger-versus-state distinction.

### These steps stay sequential

1. Accept the policy JSON semantics (section 4) before any stream treats a document shape as stable.
2. W3's written semantics land in that same decision. Coding the pure evaluator starts only after the decision, and then runs in parallel with the other streams.
3. W5 edits `src/enemy.js` only after the engine can load one policy document and call the W3 evaluator. Domain modules under `src/ai/` move onto the engine only after that plug exists, and only one domain at a time, on W5.
4. W2's "assign this policy to a unit" action waits until the W1 binding command exists.
5. W6's live on/off control waits until W4's command is applied by W5 and shows up on the read model. A static card built from fixture state does not wait for that.
6. Replacing a specific enemy behavior (naval, air, ground, support, and the rest listed in the starting spec) is a sequence inside W5. Each replacement keeps the outer tick in `updateEnemyAI` and swaps that domain's decision for a shipped policy.

Player programmable units do not wait for the enemy-domain migration. They wait for the schema, the W5 player entry, W1 binding, and W4 activation. Enemy migration is the later half of W5.

```text
policy JSON semantics
        |
        +-- W3 pure evaluator --------+
        +-- W5 engine, player entry --+-- W5 plugs src/enemy.js
        |                             |         |
        +-- W1 unit binding ----------+         +-- W5 migrates src/ai/* domains
        +-- W4 activation command ----+-- W6 live toggle
        +-- W2 builder emits documents
        +-- W6 reads the read model (fixture first, live state when W5 publishes it)
```

## 2. Interfaces between streams

Streams talk through the documents and commands below. The builder does not reach into the simulation. The battle UI does not scrape unit objects to discover which rule is active. Enemy code does not grow a second behavior system.

### Policy document (data the engine consumes)

A policy is inert JSON. W2 emits it. Authored enemy behaviors are the same JSON, checked in as data. W5 validates and stores it. W6 reads it for the name and the short rule view. W3 defines the rule objects inside it. W1 and W4 do not rewrite the script when a unit is assigned or a policy is toggled.

Minimum fields, fixed at the gate:

- `schemaVersion`, `id`, `name`
- `rules[]`, each with `kind: "trigger"` or `kind: "state"`
- the block tree for that rule (condition, state, action, and the combinators the starting spec names: if-then, while, and, or)

### Builder events into the engine

W2 emits commands. W5 is the only consumer.

- `policy.upsert` — body is one policy document. W5 validates it. On failure it returns a structured error the builder shows. On success it stores the document.
- `policy.delete` — `{ id }`. W5 removes the document and reports any owners that still reference it.

The builder does not call `updateEnemyAI`, does not import `src/enemy.js`, and does not run rules.

### Activation record (policies switchable mid-battle)

The on/off state is a second JSON object, so a mid-battle switch does not rewrite the script.

- Shape fixed at the gate: `{ owner, policyId, enabled, priority }`. `owner` uses the binding key W1 and the schema agree on.
- Command, owned by W4: `policy.activation.set` with that object.
- W5 reads the active set at the start of its tick and runs only enabled policies. W6 sends the command through W4 and then reads the result from the engine read model.

### Unit binding

W1 owns who can carry policies and how a binding is stored. The command is `policy.binding.set` with the owner key from the schema. W5 reads bindings when it builds the tick's work list. W5 does not decide which unit types are programmable. Direct player orders remain the unit's existing command path; W1 defines how an active policy and a direct order sit together, using the priority field from the schema.

### Rule evaluator

W3 exports a pure function. W5 calls it. No other stream does.

```text
evaluateRule(rule, worldView) -> effect | none
```

- `rule` is one element of `rules[]` from a valid policy document.
- `worldView` is a plain snapshot W5 builds (the fields the accepted schema names, such as enemy-in-range and hit-point fraction). W3 does not scan the unit or building lists.
- A trigger rule returns an effect when its condition becomes true, then is idle until it may fire again under the cooldown the schema defines.
- A state rule returns its effect on every evaluation while the state still holds, and returns none when the state no longer holds.

W5 turns effects into game actions on its own tick. W3 does not issue orders.

### Engine read model (UI reads engine state)

W6 is read-only against a snapshot W5 publishes:

- policy `id`, `name`, `enabled`
- each rule's `kind` and a short, display-ready summary
- optional `holding` flag for a state rule that is currently in effect

W6 uses that snapshot for the battle cards and the toggle's displayed state. It does not import the evaluator and does not read `src/enemy.js`.

### Enemy entry

Described in section 3. The interface is: `updateEnemyAI` keeps its current outer contract and calls the shared engine with the faction's policy documents and activation records. Player units enter the same engine through a separate function. Both paths call `evaluateRule`.

## 3. Single owner of `src/enemy.js`

**W5, the shared behavior engine, is the only stream that integrates with `src/enemy.js`.**

Today the simulation tick in `src/updateGame.js` calls `updateEnemyAI` in `src/enemy.js`. That function stays the enemy entry: host-only, skipped during replay, and throttled by `AI_UPDATE_FRAME_SKIP`. From there the code fans out into `src/ai/` (strategic layer, attack point, per-faction `updateAIPlayer`, and the unit-behavior modules named in the starting spec).

W5 is the stream that changes this path. Its job at the plug is:

- keep `updateEnemyAI` as the outer entry
- pass that tick into the shared engine with the enemy faction's policy documents
- move decisions that now live in `src/ai/*.js` onto shipped policies of that same engine, domain by domain

No other stream edits `src/enemy.js` or rewires `updateEnemyAI`.

- W1 binds policies to units and does not special-case the enemy tick.
- W2 emits documents.
- W3 evaluates a single rule.
- W4 writes activation records.
- W6 reads the read model.

Enemy policies and player policies differ by which entry calls the engine and by who authored the document. They do not differ by engine.

The tick budget (how often rules run, cooldowns, and how much work one evaluation may do) is an open performance choice inside W5. The starting spec already lists it as open. Builder and UI work must not add per-tick scans or per-frame allocation on this path.

## 4. What must be decided first

**Policy JSON semantics are decided and written down before W1–W6 build on them.**

The starting spec leaves product questions open on purpose. Streams must not answer those questions privately in code. The gate closes every choice that changes the document another stream will emit, store, or read. In particular the decision records:

- **Schema version and identity.** `schemaVersion`, stable `id`, player-visible `name`.
- **Rule kind.** Each rule is `trigger` or `state`, with the evaluation behavior in section 2. The block fields cover trigger, condition, state, action, and the combinators if-then, while, and, or. The full action catalog may grow later by adding enum values. The field names do not.
- **Script versus switch.** The policy document has no enabled flag. Mid-battle switching writes the activation record. Both objects are JSON.
- **Owner key.** One binding shape for "this policy applies to this owner." The starting spec still asks whether the owner is a unit, a selection, or a faction. That choice is part of this decision, because W1, W4, W5, and W6 all branch on it.
- **One policy or many.** Whether an owner has a single active policy or an ordered list, and what `priority` means when a direct order is also present. W1 and W5 need the same answer.
- **Effect vocabulary.** The effect names the evaluator may return (`attack`, `defend`, `retreat`, `hold`, and any others in the first slice) and the world-view fields those effects may read.
- **Fire control for triggers.** The condition edge and the cooldown field, so W3 and W5 agree when a trigger may emit again.
- **Validation errors.** The error object `policy.upsert` returns, so the builder can show it.

Still open after the gate, and safe to leave open because they do not change the JSON:

- which unit types are programmable in the first slice (W1 can ship the binding for an agreed subset)
- whether shipped enemy policies appear in the builder
- whether the optional LLM layer stays above the engine or later emits policies
- whether today's harvester automation moves into this system
- the numeric tick budget (owned by W5 when it touches the hot path)
- save, load, multiplayer sync, and replay transport, which must carry these same JSON objects but can be designed after the in-memory shape is stable
- whether the builder itself is available during a live battle (the on/off switch is in scope; the editor timing is not)

Enemy authors and the builder use this one schema. A second, enemy-only document format is out of scope.

## Non-goals of this plan

- No implementation, and no edits to simulation, AI, or UI code.
- No change to the starting spec's design content.
- No fixed balance numbers and no final block catalog beyond the fields the JSON decision names.
