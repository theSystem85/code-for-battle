# Programmable units — implementation orchestration

Status: plan only. No game or runtime code is changed by this document.

This is the implementation plan for the six areas in the [programmable units feature list](programmable-units-feature-list.md). That file is the design source. This file says how the work is split, which interfaces the streams share, and which decisions are already fixed in the schema.

## Workstreams

| Id | Stream | Owns |
| --- | --- | --- |
| W1 | Programmable units | Binding a unit policy to a unit, and the base target a build policy attaches to. Direct orders stay intact. |
| W2 | Drag-and-drop builder | The pausing editor modal, the block canvas, and the state-machine graph of about 5 to 7 states. It emits a policy document. It does not run the battle. |
| W3 | Trigger rules and state-based rules | The meaning of trigger and state rules, one-time and continuous execution, and the pure state-machine step. |
| W4 | Policies switchable mid-battle | Global enable, per-unit apply, per-player build opt-in, and explicit folder grants. |
| W5 | Shared behavior engine | The scheduler for unit and build policies, the read model, deterministic traces, and the only edit to `src/enemy.js`. |
| W6 | UI visualization | Battle presentation, the radial apply menu, folder management, in-game state-machine view, and export of that trace. |

W2 is the editor. W6 is the in-battle and management view. They share the state-machine picture (the same states and the same current state). They do not share write access to the engine. The radial menu runs while the battle is moving. The editor modal pauses the simulation.

## 1. Parallel work and sequential dependencies

### Gate: policy JSON semantics

Every implementation stream waits on one written decision: the policy JSON semantics in section 4. The decisions already recorded in the feature list are part of that schema. They are not re-opened per stream.

Until the schema version is accepted, streams may read the feature list and sketch against throwaway examples. They do not publish types, fixtures, or events that another stream is expected to keep.

W3 writes the rule and state-machine rules the document must express. W5 publishes the schema, because the engine is the consumer of record and enemy policies must round-trip through the same document. W1, W2, W4, and W6 review it. Later changes bump the version.

### After the schema is accepted, these streams run in parallel

The unit variant and the build variant share the schema and then proceed side by side. Neither variant waits for the other stream to finish.

- **W3** implements `stepPolicy` for a machine of at most 7 states, including one-time and continuous execution. Unit-policy fixtures and build-policy fixtures are both in this work. They can be written together.
- **W5** implements validation, the player unit entry, the player base entry, the per-tick schedule, and the read model. It calls `stepPolicy`. Fixture documents are enough to start. The unit entry and the base entry are two functions behind one scheduler. They are the same stream and can land together.
- **W2** builds the modal editor and the state canvas, enforces the 7-state cap, and emits documents that validate. It does not need a live battle. The pause command is part of this stream and does not wait on enemy migration.
- **W1** implements unit binding and the base target against the schema. The two target types are one stream.
- **W4** implements global enable, the per-unit apply command, the per-player build opt-in, and folder grants with parent-to-child inheritance. Fixture owners are enough to start.
- **W6** builds, against read-model fixtures:
  - policy cards (variant, scope, execution, on/off),
  - the radial menu shell,
  - the folder tree and grant control,
  - the in-game state-machine view and the export payload.

### These steps stay sequential

1. Accept the policy JSON semantics (section 4), including the variant discriminant, scope, execution mode, state-machine cap, apply targets, and grant shape, before any stream treats a document as stable.
2. W3's written step rules land in that same decision. Coding the pure step starts after the decision, then runs in parallel with the other streams.
3. W5 edits `src/enemy.js` only after the engine can load a policy and step it for both variants. Domain modules under `src/ai/` move onto the engine only after that plug exists, one domain at a time, and only on W5. Granted AI build policies use this plug. They do not get a second integration.
4. W2's "assign this unit policy" action waits on `policy.apply`, the W4 command that writes the unit binding W1 defined. W2's "apply this build policy to my base" waits on `policy.base.apply`, which writes the base target W1 defined.
5. W6's live radial apply waits until W4's per-unit apply command is applied by W5 and shows up on the read model. A menu rendered from fixture policies does not wait.
6. W6's live base opt-in waits until W4's per-player opt-in is visible on the read model. W5 runs a human player's build policies only when that flag is on and the grant allows it.
7. W5 enforces grants only after W4's grant record and inheritance rule exist. The folder screen itself can be built earlier against fixtures.
8. Replacing one enemy behavior domain (naval, air, ground, support, and the rest named in the feature list) stays a sequence inside W5. Each replacement keeps the outer tick in `updateEnemyAI` and swaps that domain's decision for a shipped policy.

Player unit policies do not wait for enemy-domain migration. They wait for the schema, the W5 player entry, W1 binding, and W4 apply. A player's own-base build policies wait for the same schema plus the base target, the opt-in flag, and the grant check. Enemy migration, including AI build policies, is the later half of W5 and still the only half that touches `src/enemy.js`.

```text
policy JSON (variant, scope, execution, <=7 states, targets, grants)
        |
        +-- W3 stepPolicy (unit and build fixtures) -----+
        +-- W5 unit entry and base entry ----------------+-- W5 plugs src/enemy.js
        |                                                |         |
        +-- W1 unit binding and base target -------------+         +-- W5 migrates src/ai/*
        +-- W4 grants, global enable, per-unit apply, opt-in --+-- W6 live radial apply
        |                                                      +-- W6 live build opt-in
        +-- W2 pausing modal and 5–7 state canvas
        +-- W6 cards, folder UI, machine view, export, menu shell
```

### How the new decisions sit on that graph

- **Unit vs build.** The discriminant is in the gate. After that, W3, W5, W1, and W6 can exercise both variants in parallel. The radial menu is unit-only. Base apply and the per-player opt-in are build-only. Those two UI surfaces are independent of each other and can ship separately once their commands exist.
- **Global vs per-unit.** Global enable (W4) does not wait on the radial menu. Per-unit apply does. A global policy never travels through the combat menu.
- **One-time vs continuous.** Both modes are inputs to `stepPolicy`. The "start immediately on apply" behavior is W4 writing a started runtime record and W5 stepping it on the next engine pass. Conditions inside the machine still decide whether an effect is emitted. W6 only displays the result.
- **Sharing.** Folder UI (W6) and grant commands (W4) are parallel after the grant schema exists. Enforcement inside W5 is sequential on that command. Inheritance is a pure function of the folder tree. W6, W4, and W5 call the same function.
- **Editor pause.** W2 emits pause and resume. The session honors it. This is independent of `src/enemy.js` and of the radial menu. While paused, W5 does not tick.
- **State machines.** The 7-state cap is validation in W5 and a builder limit in W2. The pure step is W3. The picture and the export are W6 reading the trace W5 already stores. Export does not wait on enemy migration. Live traces wait until W5 publishes the read model.

## 2. Interfaces between streams

Streams talk through the documents and commands below. The builder emits documents and a pause request. The battle UI reads engine state and sends apply, opt-in, and grant commands. Policies are data the engine consumes. Enemy code does not grow a second behavior system.

### Policy document (data the engine consumes)

A policy is inert JSON. W2 emits it. Authored enemy behaviors are the same JSON, checked in as data. W5 validates and stores it. W6 reads it for the name, the variant, and the short rule view. W3 defines the states and transitions inside it. Assignment, opt-in, and grants do not rewrite the script.

Fields fixed by the decisions already made:

- `schemaVersion`, `id`, `name`
- `variant`: `"unit"` or `"build"`
- `scope`: `"global"` or `"perUnit"` on a unit policy. A build policy targets the owner's base (`target: "base"`).
- `execution`: `"oneTime"` or `"continuous"`
- `states[]`: 1 to 7 states. Each state carries the trigger and state-rule blocks that guard its transitions (condition, state, action, and the combinators if-then, while, and, or).
- `folderId`: the folder that holds the policy

W5 rejects `policy.upsert` when `variant` is missing, when a unit policy has no `scope`, when a build policy has no base target, or when `states.length` is greater than 7.

### Sharing and folders

Grants are a second JSON object. The policy script does not contain a recipient list.

- Folder: `{ id, parentId, name }`
- Grant, written only by an explicit command: `{ folderId, grantee }`. `grantee` is the granting player, another multiplayer player, or an AI faction.
- Effective permission is the folder's own grants plus every ancestor grant. Subfolders inherit from the parent. A child does not grant itself by existing.

Command, owned by W4: `policy.grant.set`. W6 sends it from the folder UI. W5 runs a policy for an owner only when that owner has an effective grant. W2 stores `folderId` on the document and does not grant as a side effect of save.

### Builder events into the engine

W2 emits commands. W5 is the only consumer of the document commands.

- `policy.upsert` — one policy document. W5 validates it. On failure it returns a structured error the builder shows. On success it stores the document.
- `policy.delete` — `{ id }`. W5 removes the document and reports owners that still reference it.

The builder does not call `updateEnemyAI`, does not import `src/enemy.js`, and does not step the machine.

### Editor pause

W2 owns the modal. Opening it emits `editor.pause`. Closing it emits `editor.resume`. The session pauses the simulation for as long as the modal is open. W5 does not advance a tick while paused. The radial menu does not emit pause. Applying a policy during combat leaves the simulation running.

No stream implements pause by editing `src/enemy.js`.

### Activation, apply, and build opt-in

On/off and apply are separate from the script, so a mid-battle change does not rewrite the policy.

- **Global enable**, owned by W4: `policy.activation.set` `{ ownerId, policyId, enabled }`. Used for global unit policies. W5 runs an enabled global policy for that owner on the unit entry.
- **Per-unit apply**, owned by W4: `policy.apply` `{ unitId, policyId }`. Emitted by the W6 radial menu. W5 attaches the policy to that unit and, when `execution` is `oneTime`, marks it started immediately. The next `stepPolicy` still returns effects only when the machine's conditions pass. Example: engage-when-in-range produces no attack if no enemy is in range at that step.
- **Build apply**, owned by W4: `policy.base.apply` `{ playerId, policyId }`. W5 attaches the build policy to that player's base. A one-time build policy starts immediately. Its conditions still gate effects.
- **Build opt-in**, owned by W4: `policy.buildOptIn.set` `{ playerId, enabled }`. This flag is per player. It is not a single host flag. W5 runs build policies for a human player only when the flag is enabled and the grant allows the policy. An AI runs a build policy when the grant names that AI. The human opt-in does not gate the AI.

W5 reads these records at the start of its tick. W6 sends the commands and then reads the result from the engine read model.

### Unit binding and base target

W1 owns who can carry a unit policy and how a base target is stored. W4 owns the commands that write those records. There is one command per target, shared by the editor and the combat menu.

- Unit record: `{ unitId, policyId }`, written by `policy.apply`. W5 reads it when it builds the unit work list.
- Base record: `{ playerId, policyId }`, written by `policy.base.apply`. W5 reads it when it builds the base work list. W5 does not decide the per-player opt-in. It only honors the flag W4 stored.

W5 does not decide which unit types are programmable. Direct player orders stay on the unit's existing command path. How an active policy and a direct order combine is still the open priority question in section 4.

### State-machine step

W3 exports one pure function. W5 calls it. No other stream does.

```text
stepPolicy(policy, runtime, worldView) -> { nextStateId, effects, trace }
```

- `policy` is a valid document. `runtime` holds `currentStateId` and, for a one-time policy, whether it has already started and finished. W5 owns `runtime`.
- `worldView` is a plain snapshot W5 builds (the fields the schema names, such as enemy-in-range and hit-point fraction for unit policies, and base and building fields for build policies). W3 does not scan the unit or building lists.
- The machine has at most 7 states. The same inputs produce the same `nextStateId`, effects, and trace.
- A trigger guard contributes an effect when its condition becomes true, then stays idle until the schema's cooldown allows it again.
- A state guard contributes its effect on every step while the state still holds, and contributes none when the state no longer holds.
- `execution: "oneTime"` steps from the start state when the policy is applied, then finishes. `execution: "continuous"` keeps stepping while the policy stays enabled.

W5 turns effects into game actions on its own tick. W3 does not issue orders. The 7-state cap keeps one step bounded. The tick budget itself stays an open performance choice inside W5.

### Engine read model (UI reads engine state)

W6 is read-only against a snapshot W5 publishes:

- policy `id`, `name`, `variant`, `scope`, `execution`, `enabled`
- `states[]`, `currentStateId`, and the latest `trace` (from state, to state, effects produced)
- effective grant for the local owner, and that player's build opt-in
- optional `holding` flag for a state guard currently in effect

W6 uses the snapshot for cards, the radial menu's enabled rows, the folder screen, and the in-game machine. The export for an external analysis tool is this same trace payload. W6 does not compute a new transition at export time. W6 does not import the stepper and does not read `src/enemy.js`.

### Radial apply menu

W6 owns the widget. In combat, right-click or long-press on a unit opens it. It follows the same interaction family as the factory build menu: a radial list of choices anchored to the unit.

The list is per-unit unit-policies the player has an effective grant for. Global policies are already active and are not listed as apply actions. Build policies are not listed. Choosing an entry emits `policy.apply`. W6 then shows the read model, including an immediate "started" runtime for a one-time policy and whatever effects the conditions allowed.

### Enemy entry

Described in section 3. `updateEnemyAI` keeps its current outer contract and calls the shared engine with the faction's policy documents, grants, and activation records. Unit policies and granted build policies both enter there. Player units and a player's opted-in base enter the same engine through separate functions. Every path calls `stepPolicy`.

## 3. Single owner of `src/enemy.js`

**W5, the shared behavior engine, is the only stream that integrates with `src/enemy.js`.**

Today the simulation tick in `src/updateGame.js` calls `updateEnemyAI` in `src/enemy.js`. That function stays the enemy entry: host-only, skipped during replay, and throttled by `AI_UPDATE_FRAME_SKIP`. From there the code fans out into `src/ai/` (strategic layer, attack point, per-faction `updateAIPlayer`, and the unit-behavior modules named in the feature list).

W5 is the stream that changes this path. Its job at the plug is:

- keep `updateEnemyAI` as the outer entry
- pass that tick into the shared engine with the enemy faction's unit policies and any build policies granted to that AI
- move decisions that now live in `src/ai/*.js` onto shipped policies of that same engine, domain by domain

No other stream edits `src/enemy.js` or rewires `updateEnemyAI`.

- W1 stores unit bindings and base targets.
- W2 emits documents and the editor pause.
- W3 steps a single machine.
- W4 writes grants, global enable, per-unit apply, and per-player build opt-in.
- W6 reads the read model, draws the radial menu, and exports the trace.

Enemy policies and player policies differ by which entry calls the engine and by who holds the grant. They do not differ by engine, and a build policy is not a second engine. An AI base-building policy runs only after an explicit grant, resolved with folder inheritance, and only through this W5 plug.

The tick budget (how often machines step, cooldowns, and how much work one step may do) is an open performance choice inside W5. Builder, folder, and combat UI work must not add per-tick scans or per-frame allocation on this path. The state cap of 7 is the bound those streams can rely on.

## 4. What must be decided first

**Policy JSON semantics are written down before W1–W6 build on them.** The feature list now fixes the items below. The schema records them. Streams do not pick private answers.

### Already decided, and part of the schema

- **Identity.** `schemaVersion`, stable `id`, player-visible `name`.
- **Variant discriminant.** `variant: "unit" | "build"`. Unit policies target units. Build policies target buildings and base expansion.
- **Scope.** Unit policies are `global` (always active once enabled) or `perUnit` (applied mid-battle). Build policies target the owner's base.
- **Execution.** `oneTime` or `continuous`. A one-time per-unit policy starts immediately on `policy.apply`. A one-time build policy starts immediately on `policy.base.apply`. In both cases the machine's conditions still gate effects.
- **State machine.** `states[]` with a hard maximum of 7. The builder is designed for about 5 to 7 states. `stepPolicy` is deterministic. The read model carries `currentStateId` and `trace` for the in-game view and for export.
- **Apply targets.** Per-unit apply names a unit. Build apply names a player's base. The radial menu emits only per-unit unit-policy applies.
- **Build opt-in.** `policy.buildOptIn.set` is per player, never a host-global flag. Human build policies run only when that player's flag is on. AI build policies run when granted.
- **Sharing.** Explicit `policy.grant.set` to self, another player, or an AI. Folders form a tree. Effective grants inherit from parent to subfolder. Saving a policy does not grant it.
- **Editor pause.** `editor.pause` and `editor.resume` from W2. The simulation is paused while the modal is open. This is session behavior, not a field inside the policy script.
- **Script versus switch.** The policy document has no enabled flag and no recipient list. Activation, apply, opt-in, and grants are separate JSON objects.

### Still closed at the gate before streams share types

These still change the document or the step result. They stay in the gate even though the list above is settled.

- **One policy or many.** Whether an owner has a single active policy or an ordered list, and what `priority` means when a direct order is also present. W1 and W5 need the same answer.
- **Effect vocabulary.** The effect names `stepPolicy` may return for unit actions (`attack`, `defend`, `retreat`, `hold`, and any others in the first slice) and for build actions, plus the world-view fields those effects may read.
- **Fire control for triggers.** The condition edge and the cooldown field, so W3 and W5 agree when a trigger guard may emit again.
- **Validation errors.** The error object `policy.upsert` returns, so the builder can show a bad variant, a missing target, or an 8th state.

### Still open after the gate

Safe to leave open because they do not change the JSON the other streams already share:

- which unit types are programmable in the first slice
- whether a radial apply on a multi-unit selection covers every selected unit
- whether shipped enemy policies appear in the builder
- whether the optional LLM layer stays above the engine or later emits policies
- whether today's harvester automation moves into this system
- the numeric tick budget (owned by W5 when it touches the hot path)
- save, load, multiplayer sync, and replay transport, which must carry these same JSON objects but can be designed after the in-memory shape is stable

Enemy authors and the builder use this one schema. A second, enemy-only or build-only document format is out of scope.

## Non-goals of this plan

- No implementation, and no edits to simulation, AI, or UI code.
- No fixed balance numbers and no final block catalog beyond the fields the JSON decision names.
