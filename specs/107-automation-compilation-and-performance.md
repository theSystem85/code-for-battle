# 107 — Compile-on-edit execution and automation performance gates

Status: software implemented; final integrated validation is recorded in [release evidence](../docs/automation-release-evidence.md). Physical iOS keyboard/device verification and qualifying-hardware 75 FPS certification remain open. Read [099](099-automation-cfbl-program.md) and AGENTS.md performance rules. Dependencies: 100–102; incorporate 106 before final certification. Own compiled execution and measured runtime optimization. The reference semantics/tests in 102 are the oracle; do not redefine language behavior for speed.

## Evaluation and decision

Precompilation is recommended. Today the machine is already structured JSON rather than text evaluated on every tick, but `policyStep.js` searches states/transitions and walks condition trees, and the engine computes dependencies lazily. Introducing CFBL without a compilation boundary risks parsing at runtime. Compilation removes repeated resolution/catalog/default work and computes sensing requirements once. **Compilation alone will not make spatial/target scans cheap**; measure and optimize sensing as part of this package.

Compile each accepted saved behavior revision on save/import/load, including DAV-only edits; the draft may compile for validation outside gameplay but never installs itself. Prewarm derived data before the revision becomes executable. Use the existing controlled preparation lifecycle for match loading rather than lazily compiling the first time an entity evaluates. Metadata-only edits, view switching and unchanged source do not recompile.

## Compiled representation

Use inert arrays/typed arrays or immutable structured instructions, not generated JS. Conceptual artifact:

```text
CompiledProgram {
  automationId, behaviorRevision, languageVersion, catalogVersion,
  sourceIdentity,
  initialStateOffset,
  stateTable, orderedRuleTable, branchTargets,
  conditionInstructions, effectDescriptors, sensorDependencyMask,
  stateIndexToInternalId, branchIndexToInternalId
}
```

Resolve states/branches to numeric offsets; normalize parameter defaults, modes, comparison tolerance and capability flags once; compile AND/OR with short-circuit jumps and NOT with the existing boolean semantics; represent IF branch history, ELSE branch history, AFTER due time, WHILE origin/return and state-entry counts by stable bounded offsets. Opcode dispatch uses a small fixed instruction set and existing validated command adapters. Programs contain no entity objects/DOM/clock reads. Entities own only runtime state and intent.

Publish the exact representation/version with 100/101, with compile errors matching source ranges. Use source plus language/catalog version and behavior revision for cache identity; collision-check if using a noncryptographic hash. Store one compiled artifact per saved program revision, shared by bindings, and bounded editor drafts. Evict replaced/unreferenced artifacts and detach stale entity references. Never keep an unbounded cache of every keystroke.

Compilation completion atomically installs a new revision at an authoritative simulation boundary. If compiled asynchronously, validate revision freshness before install; stale compiler results cannot overwrite a newer source. A behavior edit resets affected runtime per 101. Save/import rejects compilation failure, leaving the last saved/executing artifact intact and reporting a reason. Reject resource-limit overflow rather than silently skip statements.

## Call-frequency and allocation audit

Before changing a hot path, document: call site/frequency, early-out behavior, count of bound entities/automations/rules/sensor queries, how work scales with total candidates, and where DPR affects rendering. Keep 150 ms unit/defence and 1,000 ms production cadences; do not lower responsiveness or change script behavior to hit a benchmark.

Representative worst-case arithmetic:

- 200 controlled units × 4 automations × (1000/150) ≈ 5,333 program evaluations/s.
- 40 defences × 4 automations × (1000/150) ≈ 1,067 evaluations/s.
- 20 enabled production automations × 1 pass/s = 20 evaluations/s.
- At 75 update frames/s, there may still be ~18,000 entity early-out checks/s before cadence gates; 60 Hz or a different fixed tick changes this count and must be recorded. Stress-document rule count is not the typical count—include both representative and wide/deep fixtures from 101.

A full candidate scan of 200 entities inside each of ~6,400 control evaluations would approach 1.28 million comparisons/s before conditions/effects; target queries repeated per leaf make it worse. Avoid multiplying repeated work by every binding. Simulation machine work is independent of DPR, but status/indicator/render additions must be tested at actual backing resolution. Do not construct a Map/Set, clone documents/runtimes or normalize bindings per entity per frame without measured justification.

Use shared stable entity-ID indexes and existing spatial query/visibility structures. Rebuild/update indexes only at the established world epoch/lifecycle boundary; reuse arrays/objects after initialization. Share base money/count/loss measurements once per gated base pass, and control-entity measurements/nearest eligible target per entity evaluation/appropriate world epoch rather than once per leaf or binding. Cache keys include entity/category/owner, parameters, visibility/target version and evaluation time where needed; never reuse one entity's shared sensor view after another entity overwrote it. Defaults and capability checks are prepared, not scanned from metadata repeatedly.

Do not retain destroyed targets, cache negative/no-enemy results forever, or make target tie-breaking depend on Map insertion artifacts that differ across peers. Preserve simulation-time delays/gates and stable owner/id tie-breaking. Reassertion and burst behavior use real game time. Keep trace/state-machine UI polling at 2/4 Hz when visible, with bounded trace buffers and no per-frame source formatting. Tests may inspect richer debug traces, but production tracing must not allocate a full history per evaluation.

## Benchmarks and acceptance evidence

First capture the existing implementation before edits, then compare compiled execution to the reference stepper and the whole game with equivalent scripts. Record exact commit/source version, browser/device, settings, counts, script fixtures, map/save seed, canvas backend, effective DPR, display rate and warm/cold conditions. Never lower resolution, effects, water detail, entity count, audio or evaluation cadence in the after run.

| Scenario | What must be measured |
| --- | --- |
| No automation, idle and scrolling | constant early-out cost, no parser/compile work, baseline FPS preserved |
| 200 units / 40 defences / 4 bindings each plus production | control/defence/base CPU, sensing queries, allocations/GC, command rate |
| Reference 64 KiB / 7-state stress programs from 101 and larger real records | compiler time/memory and size-bounded stepping; classify as stress, not typical play |
| No enemies vs dense targets, multiple checks per binding | dependency-mask skips and shared query reuse |
| IF/ELSE cycles, held aim/fire/turning, many simultaneous AFTER expiries | worst-case rule/effect cadence and frame spikes |
| Production batches / 100-queue cap / deliveries / blocked placement | no duplicate work or queue floods, retry cost |
| First load and rapid edits/imports/undo | compile/install latency, stale-result rejection, cache boundedness |
| Editor open while allowed simulation continues in relevant mode | input responsiveness and no compiler pollution of game-loop CPU |
| Replay/resync and equivalent peer inputs | bit-equivalent machine/control outcomes, no double execution |

Track separately compiler duration, interpreter evaluation duration, target/sensor duration and overall update/render CPU. Initial engineering budgets on reference hardware: compile p95 ≤50 ms for the reference stress document, aggregate automation CPU p95 ≤1 ms per game update in the representative active scene, and zero CFBL parsing/compilation in update/render/AI hot paths. Measure larger records separately; these fixtures are not new compatibility-breaking admission caps. These budgets guide investigation; the binding release gate is the repository's stricter full-game requirement: independently measured ≥75 FPS, 13.333 ms frame deadline, FPS and frame-time p95/p99/max/missed deadlines, update/render CPU, backend/DPR, GPU timing where available and memory/GC evidence for cold first traversal, repeated full-map scrolling, selected layered units, firing, movement and procedural water.

A microbenchmark speedup or average FPS does not certify a full-game frame deadline. Run at least five comparable baseline/after passes and document raw outputs/variation. Headless/software rendering, throttled sessions and displays below 75 Hz provide diagnostic results only; leave qualifying-hardware checks explicitly open. Application-caused missed deadlines block certification. Existing game hitches discovered here are measured/reported and addressed within the required gate; do not mislabel them as a pass because automation itself is fast.

Testing: compiled/reference differential state/effect/traces over deterministic world sequences, depth/limit stress, no-op/cadence assertions, allocation/identity checks at relevant boundaries, save/revision swap, sensor invalidation and authority duplication checks. Run `npm run test:unit`, `npm run lint:fix:changed`, `npm run lint` plus focused existing performance scripts (discover actual names before documenting commands). Add a reproducible benchmark entry and raw result location, not invented outputs. Handoff to 108: compilation architecture/measurement, representative save/fixtures, exact commands and evidence, unresolved hardware checks and cache/resource budgets.
