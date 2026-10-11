# 101 — Authoritative CFBL source, synchronized drafts, and migration

Status: software implemented; final integrated validation is recorded in [release evidence](../docs/automation-release-evidence.md). Physical iOS keyboard/device verification and qualifying-hardware 75 FPS certification remain open. Read [099](099-automation-cfbl-program.md) and [100](100-cfbl-language-and-coverage.md). Dependency: 100. Coordinate runtime-version changes with 102 and compilation integration with 107.

## Outcome and owned surfaces

Every automation has one authoritative CFBL source whether authored in DAV or ATV. Saving/editing/importing never leaves independently editable JSON and text versions. Own `policyStore.js` integration, a new shared editor draft controller, legacy adapters and save/replay/network payload contracts. Audit `src/saveGame.js`, `src/replaySystem.js`, `src/network/lockstepManager.js`, `lockstepSync.js`, command broadcast, snapshots and hashes; current sources do not establish a complete automation-document contract. Both views subscribe to this draft controller, not directly to two different stores.

## Data contract

Recommended persisted record (conceptual, versioned):

```text
AutomationRecord {
  recordVersion: 2,
  id, ownerId, displayName,
  languageVersion: 1,
  source: canonical CFBL,
  behaviorRevision: monotonically increasing integer
}
AutomationSession {
  enabledAutomationIds, buildingBuildOptInOwners, unitBuildOptInOwners,
  entityBindings, runtimeSnapshots, orderSequence
}
EditorDraft {
  automationId, baseRevision, draftRevision, source, astProjection,
  identityMap, diagnostics, viewPreference, undoHistory
}
```

Compiled artifacts, machine JSON projections, lexer tokens, flyout query text and DOM are derived/session-only data. Never deserialize a compiled artifact as trusted authoritative behavior. Store user-facing display names as metadata (existing length 60); changing a name must not recompile behavior or reset runtimes. `entityBindings` identify entity kind and ID, automation ID, source/global origin, runtime and control arbitration state. Preserve owner normalization `player` → `player1`. Category opt-ins and enablement remain independent from source.

The identity map relates source indexes and AST rule nodes to invisible stable IDs for runtime/traces. A pure edit/view switch must preserve it. Persist or include an identity map in session snapshots where necessary; validate it against source structure. New identities must be deterministic on all simulation peers for the same authoritative edit command. Imported standalone source gets generated internal IDs; users never enter them.

## Shared editing transactions

1. Opening the editor creates a private source-backed draft and pauses through the current pause owner. Runtime continues to reference the last saved program; draft source is not executed. Preserve the pre-open pause state and network pause rules. Do not unpause a game paused by another subsystem.
2. DAV submits a typed operation (`setEffect`, `insertState`, `setCondition`, `setElseTarget`, etc.). The controller applies it to a parsed draft projection, prints canonical source, parses/validates it, then atomically publishes source and projection under one revision. It must generate CFBL in the background even if ATV has never been opened.
3. ATV submits an allowed token/structural edit through the same controller. A committed edit produces a grammar-valid source. Multi-step operations use generated legal defaults and whole-construct insertion so dangling keyword fragments do not enter source. Numeric queries and incomplete searches stay transient. Semantically unfinished operations may stay in UI staging, but cannot replace the last accepted shared source.
4. Both views receive the same revision synchronously after a successful transaction. There is no delayed bidirectional “sync text ↔ JSON” loop. Active input selection, composition, scroll and focus survive projection updates. Re-render changed controls/lines rather than rebuilding every input on each keystroke.
5. Switching views changes only viewPreference. A pending query is dismissed and its committed source remains visible. A DAV staging field retains its pending value locally and exposes a clear “choose/finish this value” message before switching if necessary; no silent commit/rounding. Prefer legal defaults and bounded controls so this is rare.
6. One shared undo/redo history records accepted source operations and identity-map changes, across view switches. Typing a flyout query does not create source history entries. Undo restores both views and selection context; redo is invalidated by a new accepted operation.
7. Save checks metadata, source grammar, category/capability rules and baseRevision. Apply one atomic store mutation. Cancel/close drops unsaved changes. If another edit/import changed baseRevision, show a concrete stale-version conflict; never overwrite silently. Restore the latest saved revision or explicitly reapply reviewed edits.

No invalid pasted source or partially composed IME text becomes a persisted record or executable program. Errors are displayed beside the selection or field, with the existing Save disabled/error treatment where applicable. Source copied/exported is always the shared accepted source, not the fuzzy query.

## Migration and behavior preservation

- Read `cfb-unit-policies-v1` without modifying/removing it. Validate each record using its legacy version, convert state order/names into source indexes, preserve original initial-state identity and transition targets, normalize catalog defaults, and convert metadata/enablement/opt-ins.
- Existing state names cease to be required or editable. Preserve them only in an optional nonbehavioral migration audit/backup, not as CFBL identifiers. An automation's display title remains unchanged. Names never determine state numbering.
- Write a versioned automation store only after the whole converted payload has been validated and persistence succeeds. Keep the legacy payload as a recovery backup; failed writes leave the old store intact and keep a usable in-memory session. Loading twice is idempotent, not duplicate importing.
- Do not silently delete malformed legacy entries, repair unknown effect names, round fractional production quantities, substitute targets, or default away unsupported fields. Quarantine/report the specific entry; migrate valid entries independently; provide backup/export data and a repair explanation.
- Disabled entries stay disabled, opt-outs stay opted out, per-unit/global source remains distinct, one-time finished bindings stay finished, and active delays/holds retain simulation-time progress when restoring the same behavior revision.
- Loading source plus a valid runtime snapshot rebuilds the projection/compiler first, then maps runtime IDs/indexes and validates references. Include current state, previous predicate bits, pending due times, hold return/transition, entered counts, finished state, order arbitration and retry/delivery state needed for equivalent continuation.
- Existing current-session edits already replace machine documents/reset bindings in some paths. Define the new behavior explicitly: a saved behavior change installs a new revision and resets only bindings using that automation to its initial state, clearing its old timers/holds/intents without cancelling an independent manual order. A metadata-only rename, view switch or no-op canonical edit does not reset. A resumed matching snapshot is not an edit and does not reset.

## Save, replay, AI and multiplayer

Automation behavior is simulation input. Owner edits/enables/applies/remove/opt-ins must be recorded with language version, canonical source/revision or stable content reference and deterministic simulation tick/sequence. Commands come from the commanding owner, reject foreign owners and invalid source before scheduling, and apply atomically on all relevant peers. Source alone does not grant enablement.

Preserve the actual authority split in `updateGame.js`: control simulation is inside the host-only section; local-owner base production runs before it. The binding execution contract is:

| Mode/category | Execution authority | Other participants |
| --- | --- | --- |
| Single-player, all categories | local simulation | none |
| Multiplayer, unit/defence control | host simulation for every eligible owner's entity | owner sends validated source/control inputs; remote clients render authoritative state and do not step these bindings |
| Multiplayer, building/unit production | commanding owner's normal production system (host for host-owned production) | existing production/placement/spawn commands replicated once; do not run that owner's producer again on another peer |
| Replay | recorded authoritative inputs/outputs through existing replay dispatch | disable live authoring/production; never execute both recorded effect commands and live source-derived effects |

Enrich source/edit/apply commands so a remote owner's control program reaches the host; remote UI has source and can inspect relayed authoritative status. Production retains existing opt-in/local-party AI/replay locks; enabling arbitrary AI production is not part of this feature. If a supported lockstep path consumes these commands, feed tick-stamped authoritative **outputs** into its existing input dispatch rather than adding another independent interpreter authority. Tag origin/revision/sequence to suppress loops/double broadcasts. A full conversion of the game to peer-wide automation simulation is out of scope. Inspection must verify which routing is active in current sessions and adapt to it, not assume that the mere presence of `lockstepManager.js` means all peers execute `updateGame.js` logic.

The acceptance criterion is identical authoritative gameplay state and no duplicate orders. Source validation/compiler runs outside the hot tick; execution authorities must have the agreed revision before it executes. Handle incompatible CFBL versions as explicit session incompatibility/rejected edit, not silent client-only automation.

Save/export includes records needed by entity and base runtimes, bindings and enablement/opt-ins; loading/import regenerates derived artifacts. Replay includes behavior inputs and authoritative effects/status required by its existing command-driven execution, and never reads the viewer's unrelated local automations to drive the recorded match. Resync snapshots include authoritative revisions/source and runtime progression from the responsible executor. Hash behavior revisions and authoritative gameplay state as required by the active sync path; compare normalized runtime snapshots only where both peers hold the same authoritative snapshot. A remote renderer's nonexecuting runtime is not a locally stepped peer runtime. Avoid hashing editor state or platform-dependent object addresses. Existing AI/LLM control owners use the same validated APIs/owner checks; new arbitrary AI production is out of scope. Do not parse CFBL in every AI decision. Network framing/chunking and bounded payloads use existing transport conventions.

Keep current product limits (7 states, condition depth four and catalog value domains). Do not introduce lower rule-count/source-size limits that reject a schema-valid current DAV automation merely to meet a benchmark. Parsing/compilation work must be bounded by finite document size, use cancellation/stale-revision checks and iterative traversal where width is large, and avoid unbounded recursion. Transport may chunk source using existing bounded messages. Use 7 states × 32 rules/state, up to 256 condition nodes per rule, and a 64 KiB source as an initial reproducible stress fixture, **not new product admission limits**. Inventory larger real records too. If measured evidence makes an additional product limit necessary, report the compatibility conflict and proposed migration/user experience before changing this contract; never silently trim source.

## Acceptance and handoff

- DAV-only creation persists canonical CFBL; ATV creation produces the identical machine; edit one view, switch repeatedly and compare source/revision/projection.
- Legacy named states, non-first initial state, cross/self references, disabled/global/per-unit entries and both production opt-ins survive migration. Repeated loading, full localStorage, corrupt record, unsupported version and mixed valid/invalid entries have meaningful recovery coverage.
- One shared undo/redo history spans both editors. Cancel leaves records and behavior untouched. Save revision conflicts are detected. Metadata rename and no-op edits preserve runtimes.
- Save/restore mid-delay, mid-hold, after one-time completion and mixed unit-production deliveries matches uninterrupted execution. Two-peer edit/apply and resync produce identical hashes without duplicate construction or spawn orders. Replay remains independent of local automation data.
- Use existing relevant suites and add behavior tests for these actual lifecycle risks. Run `npm run test:unit`, changed-file lint fix and full lint before commit; integration/E2E scenarios are required release evidence in 108 even though repository-wide mandatory E2E is disabled.

Handoff: store schema/version, transactional controller exports, identity mapping, migration fixtures, authority decision with inspected call sites, command/save payload contracts and snapshot tests. UI agents can consume controller mocks while this package is in progress; final integration requires its real APIs.
