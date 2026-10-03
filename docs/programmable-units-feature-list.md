# Programmable units — feature list

Status: planned, not implemented. This document is the starting specification.

## Goal / overview

The player can program units. Alongside direct orders, the player defines how units behave in battle.

Behavior is created in a visual drag-and-drop builder. Source code is not required. Construction is block-based: triggers, states, and actions are blocks the player connects.

Those scripts are called **policies**. The same behavior engine runs player policies and enemy AI. Only the entry point differs.

A policy is also a small state machine: the engine runs it as one, and the game can show that machine. Two variants exist. Unit policies target units. Build policies target buildings and base expansion.

## Core concepts

- **Programmable unit:** A unit can run policies that control its behavior.
- **Policy:** A stored behavior script built from blocks and executed as a state machine. Players build policies themselves. Enemy AI uses policies on the same engine.
- **Block:** The smallest piece in the builder (trigger, condition, state, action, link).
- **Two rule kinds** in the same builder:
  - **Conditional triggers:** A condition fires an action when it becomes true. Example: "If an enemy is in range, attack."
  - **State rules:** A rule holds while a state remains true. Example: "Defend while hit points are under 50%."
- **Two variants:** **Unit policies** target units. **Build policies** target buildings and base building / base expansion.
- **Two scopes:** **Global** policies are always active. **Per-unit** policies are applied to a unit mid-battle.
- **Two execution modes:** **One-time** and **continuous**.
- **Runtime switch:** Finished policies can be turned on and off during play, so strategy can change in the middle of a battle.
- **Explicit grant:** A policy is shared with the granting player, another multiplayer player, or an AI only as an explicit act.
- **One engine:** Player policies and enemy behavior, including base building, run on the same script system.

| | Trigger | State rule |
| --- | --- | --- |
| Evaluation | The condition becomes true and fires an action | Holds while the state is true |
| Example | Enemy in range → attack | HP under 50% → defend |
| End | The action has fired | The state is no longer true |

## Policy variants

### Unit policies

Unit policies target units. They describe combat and other unit behavior.

A global unit policy is always active for its owner. A per-unit policy is applied to one unit during the battle, from the radial menu in [Visualization / UI](#visualization--ui).

### Build policies

Build policies are a second variant alongside unit policies.

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
- Starting block range (the catalog is still open; see [Open questions](#open-questions)):
  - Triggers, for example enemy in range or under fire.
  - States, for example hit points under a threshold.
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

## Unifying enemy AI

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
- **Radial context menu.** In combat, right-click or long-press on a unit opens a radial context menu, in the same family as the factory build menu. The menu lists the per-unit policies available to apply to that unit. Choosing one applies it dynamically to that unit. A one-time policy starts immediately. Conditions inside the policy still gate effects.
- Build policies are applied to the player's own base from that player's base policy controls. Each multiplayer player opts in or out for their own base. The unit radial menu does not list build policies.
- The running state machine can be shown in game. The same trace can be exported for an external analysis tool.
- Folder management shows the tree and inherited permissions. Granting is an explicit action there.
- Presentation follows the existing HUD and stays visual. The concrete layout is still open.

## Open questions

These points are **not** decided:

- Which unit types are programmable in the first slice.
- Whether several policies can be active on one owner at once, and how conflicts and priority are resolved.
- Whether a radial apply opened on one unit of a multi-unit selection applies to every selected unit. The decided target is the unit the menu was opened on.
- Whether shipped enemy policies are visible in the builder.
- How the LLM layer in `src/ai/llmStrategicController.js` relates to the engine: it stays above the engine, or it later emits policies itself.
- Whether existing harvester automation (see `havester-policies.md`) moves into this policy system.
- Evaluation interval, cooldowns, and the engine budget inside the simulation tick. The state-machine cap (at most 7 states) bounds the size of one policy. It does not set the tick budget.
- Save and load, multiplayer sync, and replay transport. The in-memory documents (policy, activation, grant, per-player build opt-in, state-machine trace) are specified here. Their transport is not.

## Out of scope for this document

- No implementation, and no change to AI, UI, or simulation code.
- No fixed block catalog and no balance numbers.
