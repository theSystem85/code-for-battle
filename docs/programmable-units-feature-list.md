# Programmable units — feature list

Status: the **unit-policy first slice is implemented**, and on top of it the **long condition list, the unit command API and the policy activity display are implemented** on the same branch (see [Unit policies — first slice](../specs/unit-policies-first-slice.md) and [Unit policies — conditions, command API and activity display](../specs/unit-policies-conditions-and-command-api.md)). Build policies, the grant and folder UI, moving existing human and enemy behavior onto the command API, and the items under [Later, spec only](#later-spec-only) are **later work** and are only specified here.

How to read the marks: **[x] built** = in the code with tests. **[ ] later** = spec only, nothing built. **skipped** = the game has no such field today, so no fake stat was invented.

## First slice (units only)

The first slice covers unit policies only.

- Included: the policy JSON (schema v1), a state machine of at most 7 states, `if` and `while` rules, one-time and continuous execution, global and per-unit scope, direct-order precedence, the conflict message, the pausing editor modal, the policy panel and the radial apply menu on a unit.
- Programmable unit types: `tank`, `tank_v1`, `tank-v2`, `tank-v3`, `rocketTank`, `howitzer`. The follow-up widened this to `apache`, `f35`, `ambulance`, `tankerTruck`, `ammunitionTruck`, `recoveryTank` so the new commands have units to run on.
- Not included yet: **build policies** (buildings and base expansion), the **grant and folder UI** (explicit grants stay specified below, not built), **moving enemy AI onto the engine** (`src/enemy.js` and the `src/ai/*` modules are untouched), and **LLM-written policies** (see [LLM-written policies](#llm-written-policies-later)).
- Sections below that describe build policies, grants and folders, or enemy unification describe the target design. They are not implemented in the first slice.

## Checklist: built and remaining

Checked means it is in the code on branch `cursor/programmable-unit-policies-c5c1` (PR #728). It is not in `main` until that PR is merged. The same checklist is kept in [Unit policies — first slice](../specs/unit-policies-first-slice.md#checklist-built-and-remaining).

### Built in the first slice

- [x] Policy JSON schema v1 with validation and a hard cap of 7 states (`src/policies/policySchema.js`).
- [x] Pure, deterministic `stepPolicy` (`src/policies/policyStep.js`).
- [x] `if` (fires once) and `while` (holds until its end condition) rules.
- [x] One-time and continuous execution; global and per-unit scope.
- [x] Policy store with owner-only enable, disable and apply, and `localStorage` persistence of policy documents.
- [x] Engine that applies effects (`attackNearestEnemy`, `retreat`, `hold`) to tanks, rocket tanks and howitzers, run once per tick after `processCommandQueues`.
- [x] Direct orders always win; a newly true `while` overrides an older order; the newest command or newly triggered condition is dominant; several policies can be active.
- [x] Conflict banner with "Pause policy until order is done".
- [x] Pausing editor modal with templates, state diagram, state cards and rule blocks.
- [x] Invalid-draft treatment: red exclamation icon top right, slight red background, reason text, Save disabled.
- [x] Policy panel (`#policiesBtn`) with global enable switches that do not pause the game.
- [x] Radial apply menu on a unit (see [the note below](#radial-menu-behavior-first-slice)).
- [x] Three shipped templates: retreat if hurt, retreat while hurt, attack while an enemy is in range.
- [x] Unit tests for the schema, the step, the engine, the direct-order hook, the condition rows and the panel switch; a browser run of the editor, radial, conflict and pause flow on the dev server.
- [x] **Known UI bug: policy-card toggle clipped on phone widths.** Found on the Netlify preview of PR #728. Cause: the switch styled one `::after` as both the knob and the hover tooltip. Fixed on this branch in commit `65b112c1` (labelled switch that wraps under the title). It reaches `main` with the PR.

### Built after the first slice (same branch)

Requirements from the Google-Doc list. Details, field names and approximations are in [the companion spec](../specs/unit-policies-conditions-and-command-api.md).

- [x] **Condition catalog with operators.** `compare` with `==`, `<=`, `>=`, `<`, `>`, relative or absolute mode, per-field tolerance for `==`, circular angle compare; `check` leaves with parameters; `not`/`and`/`or` with nesting. An unmeasurable value is never true.
- [x] **Internal conditions.** HP, XP, rank 1–3, fuel, ammo, reload status, crew present, load, wagon rotation, turret rotation, airborne, moving, attacking a unit or a building, serving a unit.
- [x] **External conditions.** Base money, power, number of my buildings of a type, under service, under service by someone, in range of hospital / ammo factory / fuel station / workshop, protected by a unit, in range of a defense building or a combat or service unit, can attack a unit or a building, in visible range of an enemy unit or building, parked at airstrip / helipad / workshop, direct hit and indirect hit by unit or building, under attack by unit or building (only while the attacker is visible), distance to a visible unit or building.
- [x] **Sensing.** Enemy of a chosen type or any is visible; enemy of a chosen type or any is in my fire range; some or any of my units of a type are in an enemy's fire range.
- [x] **Wired through** the policy schema and validation, the evaluator, the editor (nested condition rows, grouped field picker, parameter selects) and `stepPolicy` tests.
- [ ] **Skipped conditions** (the game has no such data): crew status per role (only the present count/fraction exists), and "attacker of a past hit is visible" (only the last hit is recorded, there is no hit history).
- [x] **Unit command API** (`src/policies/unitCommandApi.js`): `executeUnitCommand` returns `false` when the engine does not allow a command and leaves the unit untouched. Commands: move forwards / backwards / sideways left and right (sideways: helicopters only), turn left / right, turn turret left / right (tanks only), take off and land (helicopters and F-35 only), aim and lock without firing, fire at the locked target, fire in the current turret direction independent of a lock, order a service unit to refill ammo / health / fuel, go to a workshop / hospital / ammo factory, attack and chase, attack when in range without chasing, attack anything in range automatically, service a target (service units only), protect a target (follow), retreat to a position.
- [x] **Policy effects go through the API.** Existing direct-order code and enemy AI are not routed through it (see [Later](#later-spec-only)). Tests cover allowed and refused commands.
- [x] **Policy activity counts.** Each policy card shows how many units have it enabled and how many it actively controls (a condition fired, the machine is past its start state, not finished, and a `while` hold is in force).
- [x] **HUD icon** on units a policy actively controls, with a canvas tooltip naming the policies.
- [x] **Automation status** on every unit and wreck row of the unit detail panel (long-press a unit in the build menu). The earlier Units-tab popover was removed.
- [x] **`after` rule** (wait a delay in minutes and seconds after the condition becomes true, then fire once), **live state-machine view** from the radial menu (full rule text, current state, entry counts) and the HP label. See [the follow-up spec](../specs/unit-policies-after-rule-and-state-machine-view.md).
- [x] Custom tooltips only (no native `title`), custom scrollbars, one scroller per surface.

### Remaining work on the unit slice

- [ ] Export the state-machine trace. The live view (current state, entry counts) is built; trace export and history are not.
- [ ] Apply a radial choice to every selected unit instead of only the unit the menu was opened on (still an open question).
- [ ] Save and load of runtime bindings (policies applied to units). Only the policy documents persist today.
- [ ] Multiplayer: sync policy documents and bindings, and hook orders issued by remote clients on the host.
- [ ] Replay transport for policy activity.
- [ ] Exercise the touch long-press path in a real browser or device test. The browser run only covered the desktop right-click.
- [ ] Measure the engine tick cost against the 75 FPS gate with realistic unit counts and record it in the spec.
- [ ] Decide whether existing harvester automation (`havester-policies.md`) moves into this system.
- [ ] Decide whether shipped enemy policies appear in the builder.

### Later, spec only

Nothing below is built. The design is written down in [the companion spec](../specs/unit-policies-conditions-and-command-api.md#5-later-spec-only).

- [ ] **Voice vibe coding:** a spoken command goes to an LLM that produces build commands and unit commands, run through the same validated paths as a hand-built policy.
- [ ] **Hotkeys 1–9 and higher:** a hotkey runs a chosen script on the selected units.
- [ ] **One-click attack plans.** Example: two groups wait until an F-22 destroys the artillery; then the artillery attacks air defense while the tanks protect it; then aircraft hit the turrets; then the groups destroy the construction yard, the vehicle factory and the remaining buildings.
- [ ] **Base-build scripts** with conditions on money, income per minute, own unit and building counts, and visible enemy unit and building counts. A host can apply one to another player's base (an explicit grant).
- [ ] **One shared command path** used by replays, the enemy LLM and these scripts.
- [ ] **Migration of every existing human and enemy behavior to the unit command API.** Map physics is the only thing allowed to push a unit outside the API. Not done in this pass: the existing direct-order code and the enemy AI modules are unchanged, and only new policy code must use the API.

### Later work (not started, out of the first slice)

- [ ] Build policies (buildings and base expansion, per-player build opt-in).
- [ ] Explicit grants and the folder UI.
- [ ] Moving the enemy AI (`src/enemy.js`, `src/ai/*`) onto the engine.
- [ ] LLM-written policies: the LLM-driven enemy AI writes and applies unit policies through the same document and apply path.

## Goal / overview

The player can program units. Alongside direct orders, the player defines how units behave in battle.

Behavior is created in a visual drag-and-drop builder. Source code is not required. Construction is block-based: triggers, states, and actions are blocks the player connects.

Those scripts are called **policies**. The same behavior engine runs player policies and enemy AI. Only the entry point differs.

A policy is also a small state machine: the engine runs it as one, and the game can show that machine. Two variants are designed. Unit policies target units and are implemented. Build policies target buildings and base expansion and are later work.

## Core concepts

- **Programmable unit:** A unit can run policies that control its behavior.
- **Policy:** A stored behavior script built from blocks and executed as a state machine. Players build policies themselves. Enemy AI uses policies on the same engine.
- **Block:** The smallest piece in the builder (trigger, condition, state, action, link).
- **Two rule kinds** in the same builder, written as `if` and `while`:
  - **`if` (conditional trigger):** The rule fires **once** when the condition becomes true. It does not keep overriding later direct orders. Example: "If HP drops below 25%, retreat."
  - **`while` (state rule):** The rule stays in effect until its end condition (by default, the condition becoming false). A `while` condition that becomes true **after** a direct order overrides that order. Example: "Retreat while HP is under 25%."
- **Two variants:** **Unit policies** target units (first slice). **Build policies** target buildings and base building / base expansion (later).
- **Two scopes:** **Global** policies are always active. **Per-unit** policies are applied to a unit mid-battle.
- **Two execution modes:** **One-time** and **continuous**.
- **Runtime switch:** Finished policies can be turned on and off during play, so strategy can change in the middle of a battle.
- **Explicit grant:** A policy is shared with the granting player, another multiplayer player, or an AI only as an explicit act. (Specified, not built in the first slice.)
- **Owner-only control:** Only the commanding owner can enable, disable, or apply a policy: a human player, or an AI commanding its own units.
- **One engine:** Player policies and enemy behavior, including base building, run on the same script system.

| | `if` (trigger) | `while` (state rule) |
| --- | --- | --- |
| Evaluation | The condition becomes true and fires an action once | Takes effect when the condition becomes true and holds |
| Example | HP under 25% → retreat, once | Retreat while HP is under 25% |
| End | The action has fired | The end condition is met (default: the condition is false) |
| Against a later direct order | Does not override it | Does not override it unless the condition becomes true again after that order |
| Against an older direct order | Skipped while that order is running | Overrides it the moment the condition becomes true |

## Direct orders, dominance and conflicts

- **A direct order always wins when it is given.** Active policies pause until that order is completed and the unit would otherwise become idle.
- `if` rules fire once and do not override later direct orders.
- A `while` condition that becomes true after a direct order overrides that order. Example: HP is 100%, "retreat while below 25%" is active, the player orders an attack, HP drops below 25%, and the unit retreats. If the player orders an attack again, the new order wins.
- **Several policies can be active at once.** The last command or the last newly triggered condition is dominant.
- When a `while` policy is currently overriding and the player gives another direct order, the game shows a **conflict message** and lets the player **pause that policy until the new order is fulfilled**. The policy resumes automatically afterwards.
- Applying a per-unit policy from the radial menu counts as the newest command.
- Direct orders stay on the existing command path. Policies never replace it.

## Policy variants

### Unit policies

Unit policies target units. They describe combat and other unit behavior.

A global unit policy is always active for its owner. A per-unit policy is applied to one unit during the battle, from the radial menu in [Visualization / UI](#visualization--ui).

### Build policies

Later work (not in the first slice). Build policies are a second variant alongside unit policies.

- They target buildings and base building / base expansion. They do not target units.
- A player can apply build policies to their own base to automate its construction.
- In multiplayer, each player chooses individually whether to use build policies for their own base expansion. The choice is per player. It is not a host-wide switch.
- The enemy AI can be given build policies, including how its base building works. Delivery uses the same explicit grant as any other policy. See [Sharing and folders](#sharing-and-folders).

## Scope and execution

### Global always-active and per-unit

- **Global policies** are always active for their owner once enabled. They are not applied one unit at a time in combat.
- **Per-unit policies** are applied mid-battle to a specific unit.

Build policies attach to the owner's base. For a human player they run only when that player has opted in. They are not chosen from the unit radial menu.

### One-time and continuous

- **One-time** execution starts the policy once.
- **Continuous** execution keeps the policy in force. The engine evaluates it again while it stays enabled.

A **one-time per-unit** policy fires immediately when it is applied to the unit. Conditions inside the policy still gate what happens. Example: "engage only when an enemy is in range" does not attack at the moment of apply unless an enemy is already in range. The policy has started. The condition decides whether an effect is produced.

A one-time build policy follows the same rule on its own target: applying it to the base starts it immediately, and its conditions still gate construction effects.

## State machines

A policy under execution is a state machine.

- The engine implements the policy internally as a state machine. The same policy and the same world view produce the same next state and the same effects. Behavior is deterministic and traceable.
- That machine is visualized in game. The same trace can be exported for external analysis tools.
- Each policy is limited to about 5 to 7 states so the drag-and-drop builder stays manageable. A policy document holds at most 7 states.

Trigger rules and state rules are the guards and transitions of this machine. They are not a second system beside it.

## Sharing and folders

Players share or grant policies as an **explicit act**. Placement in a folder does not publish a policy on its own, and nothing is granted automatically.

A grant can name:

- the granting player (a grant to themselves),
- another multiplayer player,
- an AI.

Management uses a **folder structure**. A subfolder inherits permissions from its parent. A grant on a parent folder covers the policies in its subfolders. Inheritance carries an explicit grant downward. It does not create a grant by itself.

Unit policies and build policies use this folder and grant model. An AI receives a build policy the same way it receives any other policy: an explicit grant whose effective permission includes parent-folder inheritance.

## Builder

- Visual drag-and-drop builder, with no code entry.
- The policy editor is a **modal that pauses the game**. While the modal is open, the simulation does not advance. Closing the modal resumes the game. Switching a finished policy during battle does not pause the game. Only the editor does.
- Block palette and canvas. Blocks are dragged and connected.
- The canvas edits the policy's state machine. The builder is laid out for about 5 to 7 states and will not save a policy with more than 7.
- Both rule kinds are created in this builder, not in two editors.
- Both variants are created in this builder. The policy is marked unit or build, global or per-unit (unit policies), and one-time or continuous.
- An invalid draft is shown clearly: a **red exclamation icon at the top right** of the editor, a **slight red background**, and a message that states the reason (for example "More than 7 states (this draft has 8). Remove 1 to save."). Saving is blocked while the draft is invalid.
- Block range. The first slice shipped `always`, HP, nearest-enemy distance, enemy in weapon range, recently under fire and `not` / `and` / `or`, with effects attack, retreat and hold. The condition catalog is now the long list described in [Built after the first slice](#built-after-the-first-slice-same-branch), and effects cover the unit command API. Build-policy blocks are still open (see [Open questions](#open-questions)):
  - Triggers, for example enemy in range or under fire.
  - States, for example HP under a threshold.
  - Actions, for example attack, defend, retreat, hold. Build policies add construction actions aimed at buildings and base expansion.
  - Links, for example if-then, while, and, or.
- A session produces a named policy that can be stored in a folder, granted, assigned, and switched at runtime.

## Policies

- Game and technical name: **Policy** (plural: policies).
- A policy is the stored result of the builder.
- Finished policies can be enabled and disabled at runtime without leaving the battle.
- Strategy changes mid-battle by turning policies off and others on, and by applying a per-unit policy from the radial menu.
- Enemy behavior, including base building when a build policy has been granted, is expressed as policies on the same engine.
- A policy does not run for a player or an AI who does not hold an effective grant.

## LLM-written policies (later)

Spec only, no code in the first slice. When the enemy AI is driven by the LLM strategic layer (`src/ai/llmStrategicController.js`), that LLM can also **write and apply unit policies**. It would emit the same policy JSON and use the same apply path as a human player, and it is bound by the same rules: it may only command policies on its own units. This depends on the engine, the grant model, and the enemy AI entry described below, so it is later work.

## Unifying enemy AI

Later work. The first slice leaves `src/enemy.js` and every `src/ai/*` module unchanged.

Every existing behavior that drives the enemy AI moves onto this script system. One behavior engine then serves player policies and enemy AI. Only the entry point differs.

- **Player:** policies they built, switchable at runtime, bound to their units or applied to their own base when they opt in.
- **Enemy:** shipped policies that reproduce today's AI behavior, plus any unit or build policy explicitly granted to that AI. The existing AI tick stays the entry. The content comes from the same engine.

### Current entry points (reference, unchanged)

The simulation tick in `src/updateGame.js` calls `updateEnemyAI` from `src/enemy.js`. `updateEnemyAI` runs only on the host, is skipped during replay, and throttles itself with `AI_UPDATE_FRAME_SKIP`. It then calls:

- `updateLlmStrategicAI` in `src/ai/llmStrategicController.js` for the optional strategic LLM layer.
- `computeLeastDangerAttackPoint` in `src/ai/attackCoordination.js` for the shared attack point.
- `updateAIPlayer` in `src/ai/enemyAIPlayer.js` once per AI faction (construction, production, logistics, repair, unit update).

Unit behavior goes from `updateAIUnit` (`src/ai/enemyUnitBehavior.js`) to `updateAIUnitInternal` in `src/ai/enemyUnitBehaviorCore.js`. The decision is spread across domain modules, including:

- `src/ai/enemyNavalBehavior.js` — ships
- `src/ai/enemyAirBehavior.js` — Apache and air
- `src/ai/enemyGroundCombatDecision.js` and `src/ai/enemyGroundTactics.js` — ground combat
- `src/ai/enemySupportBehavior.js` — ambulance and harvester hunters
- `src/ai/enemyStrategies.js` (`applyEnemyStrategies`) — retreat, workshop, harvester protection, group attack
- `src/ai/attackCoordination.js`, `src/ai/retreatLogic.js`, `src/ai/logistics.js`, `src/ai/crewHealing.js`, `src/ai/recoveryTanks.js` — coordination, retreat, and supply

Unification replaces those scattered decisions step by step with policies on the shared engine. The outer tick (`updateEnemyAI` → factions) can remain the AI entry. Player policies get their own entry into the same engine. Granted build policies for an AI base use that same entry. This document changes none of these paths.

## Visualization / UI

- The builder is its own readable surface: a block palette, a canvas, and visible connections, shown as a state machine of about 5 to 7 states.
- The editor is a modal. Opening it pauses the game.
- Triggers and state rules look different from each other. Unit policies and build policies look different from each other.
- Each policy appears with its name, active state, variant, scope, execution mode, and a short view of its rules.
- Enable and disable is a clear control during play.
- **Radial context menu.** In combat, right-click or long-press on a unit opens a radial context menu, in the same family as the factory build menu. The menu lists the per-unit policies available to apply to that unit. Choosing one applies it dynamically to that unit. A one-time policy starts immediately. Conditions inside the policy still gate effects. See [Radial menu behavior](#radial-menu-behavior-first-slice) for what the first slice does exactly.
- Build policies are applied to the player's own base from that player's base policy controls. Each multiplayer player opts in or out for their own base. The unit radial menu does not list build policies.
- The running state machine can be shown in game. The same trace can be exported for an external analysis tool.
- Folder management shows the tree and inherited permissions. Granting is an explicit action there.
- **Activity display.** Each policy card shows two counts: units that have it enabled and units it actively controls. A unit under active control carries a small bolt badge on its HUD (hover for the policy names), and the unit detail panel (long-press a unit in the build menu) shows each unit's automation status. Tooltips are custom, never the native `title`; scrolling uses custom scrollbars with one scroller per surface.
- Presentation follows the existing HUD and stays visual. The concrete layout is still open.

### Radial menu behavior (first slice)

- The menu lists **only per-unit policies**, plus one "Policies…" entry that opens the policy panel. Global policies are never listed, because they are already active once enabled.
- **The shipped "Attack while an enemy is in range" template is global, so it never appears in the radial menu.** It is switched on and off with its switch in the policy panel. The two retreat templates are per-unit and do appear.
- If the player has **no per-unit policy** and the unit carries no policy, the menu stays closed and a right-click behaves as it did before (including deselecting). The menu also has a **State machine** button that toggles the live view of the unit's policies.
- On desktop it opens on a **right-click** on one of the player's own programmable units. The click must land within half a tile of the unit's center and the pointer must stay within 6 px between press and release.
- On touch it opens after a **still half-second (500 ms) press on the unit center**. Moving more than 12 px before the half second is up cancels it.
- It is anchored on the unit it was opened on, and a choice applies to that unit only. Choosing an already applied policy removes it from the unit.
- Opening it does not pause the game.

## Open questions

These points are **not** decided:

- Whether a radial apply opened on one unit of a multi-unit selection applies to every selected unit. The first slice applies to the unit the menu was opened on (see the checklist).
- Whether shipped enemy policies are visible in the builder.
- Exactly how the LLM layer in `src/ai/llmStrategicController.js` plugs in. The direction is decided (it can write and apply unit policies, later); the integration is not.
- Whether existing harvester automation (see `havester-policies.md`) moves into this policy system.
- Evaluation interval, cooldowns, and the engine budget inside the simulation tick. The state-machine cap (at most 7 states) bounds the size of one policy. It does not set the tick budget.
- Save and load of runtime bindings, multiplayer sync, and replay transport. In the first slice the policy documents persist in `localStorage` and runtime bindings are not saved. Orders issued by remote clients are not hooked on the host yet.

## Out of scope for this document

- Build policies, the grant and folder UI, enemy AI migration, and LLM-written policies are not built yet.
- Balance numbers, and any condition the game has no real field for (skipped, see above).
