# 099 — Automation and CFBL: program contract and delegation index

Status: specification ready for implementation; runtime features described here are not yet implemented.
Date: 2026-10-11. This document and specs 100–108 form one feature program. Implementing a spec number means reading this contract, that spec, and its declared dependencies. Do not implement adjacent specs implicitly.

## Product outcome

Automation is the defining feature of **Code for Battle**: players build state machines that control units or defence buildings, or automate unit/building production. The existing button editor is the **default automation view (DAV)**. The new guided text editor is the **automation text view (ATV)**. Both edit **CFBL (code-for-battle-language)** and share one draft and one execution model. A title-bar toggle switches views without saving, losing edits, changing enablement, or resuming the game. Phones show the entire Automation modal full screen; tablets including iPads retain a bounded modal.

The present task creates specs, a plan, and the requested documentation rename. The implementation, new UI, runtime changes, landing copy, and screenshots are follow-up work covered by the numbered specs.

## Binding decisions

1. CFBL source is authoritative for behavior. Automation ID, display title, owner, enabled status, category opt-ins, entity bindings, runtime progress, and editor preference are separate metadata. A display title is not a CFBL variable or state name. Both DAV and ATV generate source, including when ATV has never been opened. Interpreting request 7 as requiring only ATV to generate source would leave DAV changes without an authoritative representation, so the requirement applies to both views.
2. No variables, functions, arbitrary expressions, user-defined identifiers, or executable JavaScript. State declarations are automatically numbered 1 through n, in document order, with the existing maximum of seven states. Transitions and the initial-state selector use those numbers. Stable internal IDs remain invisible implementation metadata.
3. ATV is a guided text area with grammar-aware completions. An unfinished/fuzzy search query is transient UI input, not committed source. The user chooses an allowed option before a word becomes source. Numeric literals use bounded numeric entry; finite keyword/enum lists do not attempt to enumerate every number. Paste, IME, deletion, undo, and mid-document editing follow spec 104.
4. `else` is an optional alternative attached to an `if` rule. It tests the false branch of that IF predicate, never the absence of a fired rule. There is no standalone state fallback or `after … else`/`while … else`. The user confirmed IF/ELSE pairs during specification; spec 102 defines the exact behavior.
5. Preserve the implemented `if`, `while`, and `after` semantics, rule order, initial-state behavior, percentage/absolute modes, comparison tolerance, visibility, direct-order arbitration, build opt-ins, queue limits, factories, placement, and delivery orders. CFBL is another authoring UI for the same machine, not a replacement scheduler.
6. Compile on accepted behavior edits/import/load, outside the simulation loop. Execute bounded, inert instructions using the existing game command APIs. No `eval`, `Function`, dynamic script execution, per-frame parsing, or per-entity document normalization.
7. Documentation uses “Automation” for the feature and dialog. Existing `src/policies/*`, API names, storage keys, and test filenames remain accurate technical references until explicitly migrated. Unrelated privacy, cache, network, or security policy terminology is unaffected. Existing prompt-history entries are not rewritten, per AGENTS.md.

## Current implementation audit

Inspected source is the baseline; old specs include historical plans that are not all implemented.

| Surface | Actual current behavior / implementation reference |
| --- | --- |
| Model | `src/policies/policySchema.js`: schema v1; variants `unit`, `build`, `unitBuild`; `global`/`perUnit`; `oneTime`/`continuous`; max 7 states; `if`/`while`/`after` |
| Conditions | `policyConditions.js`, `policySensors.js`, `basePolicySensors.js`, `conditionRows.js`; numeric relative/absolute values, typed parameters, nested AND/OR/NOT, legacy atoms |
| Effects | `policyEffects.js`, `unitCommandApi.js`, `buildCommandApi.js`, `unitBuildCommandApi.js`; full catalog enumerated in spec 100 |
| Execution | `policyStep.js`; edge-triggered IF; held WHILE with optional UNTIL and return to source; AFTER uses simulation time and cancels when false or gated |
| Cadence | Unit evaluation at 150 ms; build evaluation at 1,000 ms; idle reassertion at 1,000 ms; build reassertion/retry at 2,000/5,000 ms |
| Editor | `src/ui/policies/policyEditorModal.js`: named states, mutable JSON draft, type/scope/execution/template controls, state diagram, rule builder; pauses simulation while editing |
| Supporting UI | `policyPanel.js`, `policyMachineView.js`, `policyMachineLayout.js`, `unitPolicyRadial.js`, `policyConflictBanner.js`, `productionTooltip.js` |
| Store | `policyStore.js`; localStorage `cfb-unit-policies-v1`; owned documents, enablement, unit bindings, separate building/unit production opt-ins |
| Defence | `src/game/buildingSystem.js`: existing hold-fire and forced targets/queues; manual commands in `src/input/attackGroupHandler.js` and mouse commands; no defence automation variant |
| Device layout | `src/ui/deviceLifecycle.js`: touch portrait also includes iPad; current max-width 640px editor CSS is insufficient to identify phones in landscape |
| Landing | `src/landing/`; EN/DE locales, feature sections and WebP screenshot pipeline; spec 090 documents routes |
| Integration risk | `updateGame.js` runs control simulation on the host and base production for the local owner before the host-only section. Automation documents/control mutations lack an explicit CFBL versioned save/replay/lockstep contract; generic entity serialization is not a source/opt-in contract |

The actual programmable control-unit set is tank aliases/V1/V2/V3, rocket tank, howitzer, Apache, F-35, ambulance, tanker, ammunition truck, and recovery tank. Production supports more unit types. Do not silently expand control to all producible units, including harvesters or naval units, just because older feature documents discuss them. Separate later work may extend that set.

## Numbered implementation packages

| Spec | Deliverable | Implementation dependencies |
| --- | --- | --- |
| [100](100-cfbl-language-and-coverage.md) | Shared grammar, catalog, typed AST, parser/printer, completion-context API, coverage fixtures | 099 contract |
| [101](101-automation-source-sync-and-migration.md) | Authoritative source store, shared draft transactions, legacy migration, save/replay/network lifecycle | 100 |
| [102](102-automation-if-else-runtime.md) | IF/ELSE schema and pure stepping, traces and arbitration | 100; store adapters agreed with 101 |
| [103](103-automation-default-view-and-state-indexes.md) | DAV source adapter, automatic indexes, ELSE controls, title toggle host | 101, 102 |
| [104](104-automation-text-view.md) | Guided text area, fuzzy completions, flyouts, highlighting, input/accessibility behavior | 100, 101, 102; host contract from 103 |
| [105](105-automation-phone-fullscreen.md) | Phone-only full-screen shell, safe areas and keyboard viewport | 099; integrate both views after 103/104 |
| [106](106-defence-building-automation.md) | Defence catalogs, sensors, commands, binding UI, lifecycle and simulation integration | 100, 101, 102; UI adapters from 103/104 |
| [107](107-automation-compilation-and-performance.md) | Compiled execution integration, shared sensing, deterministic benchmarking | 100, 101, 102; certify all categories after 106 |
| [108](108-automation-documentation-landing-and-release.md) | User language manual, examples/tutorial, EN/DE landing section, real screenshots, release evidence | 103–107 |

Spec 100 already defines the full language and vocabulary in documentation; its implementation package implements that contract. Spec 099 is the coordination document, not a code package. A range such as “100–102” includes each listed package in dependency order.

## Cross-package ownership and constraints

- Specs 100/101 own grammar/catalog and source persistence, respectively. Other agents propose additions through those APIs. Do not fork a second keyword list, parser, JSON source of truth, or store.
- Spec 102 owns branch stepping. Spec 107 owns hot-loop integration and performance changes. Stage the 102 reference implementation/tests before 107 optimizes it.
- Spec 103 owns shared editor shell/header and DAV. Spec 104 owns ATV internals. Spec 105 owns device classification and sizing; coordinate CSS selectors before integration.
- Spec 106 owns defence adapters and capability additions. It must extend the shared catalog, not duplicate a unit engine or create a defence-only DSL.
- Keep existing module paths where practical; user-facing renaming does not authorize a broad runtime-file refactor. Persisted legacy fields/keys require explicit migration, never blind replacement.
- Follow AGENTS.md: prompt/change records, all unit tests for code implementations, changed-file lint fix, full lint before commits, WebP 85% binary asset requirement, hot-loop and qualifying-hardware 75 FPS gates. Do not merge main into feature branches.

## Program acceptance

Every current template and valid DAV feature round-trips through CFBL without changing behavior; both views edit the same source; all supported categories accept IF/ELSE; legacy data survives; phones and tablets are distinguished even with keyboard/orientation changes; illegal tokens cannot be committed through any input path; defence behavior uses real command/combat rules; gameplay executes compiled artifacts without editor/parser work. Spec 108 is complete only when user docs, real screenshots, integration tests, and qualifying-hardware performance evidence are present. Headless tests cannot mark the hardware gate passed.

Execution sequencing, agent handoffs, verification commands, and release checklist: [Implementation plan](../docs/automation-implementation-plan.md).
