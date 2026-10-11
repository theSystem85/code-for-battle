# 102 — IF/ELSE pairs and state-machine execution semantics

Status: specified, not implemented. User confirmed IF/ELSE pairs. Read [099](099-automation-cfbl-program.md), [100](100-cfbl-language-and-coverage.md), and the [101](101-automation-source-sync-and-migration.md) contracts. Dependency: 100; coordinate shared IDs/store adapters with 101. Own schema/stepper behavior, not editor implementation or performance rewriting.

## Representation and validation

An IF rule gains one optional `else` target. Conceptual projection:

```text
{ id, kind: 'if', when, to, elseTo?: stateId, elseId?: internalRuleId }
```

CFBL writes `if (condition) goto N; else goto M;`. The alternative is part of that IF, not a separate unconditional transition in the source state's rule array. Give branches distinct stable internal trace/previous-value IDs; `elseId` is generated, never a user token. Validate targets, IF-only applicability, unique IDs and one alternative per IF. Schema versioning/migration belongs to 101; old IF without ELSE remains valid with unchanged semantics.

Reject standalone ELSE, ELSE after WHILE/AFTER, ELSE with a predicate/delay/UNTIL, duplicate ELSE, and unknown targets. There is no `else if` terminal; several ordered IF pairs express decision priorities. DAV may provide consecutive IF rules with optional alternatives.

## Exact stepping behavior

Evaluate only the current state's ordered rule list, and select at most one transition per eligible evaluation. For a pair compute predicate `p` once. IF branch truth is `p`; ELSE branch truth is `!p`. Each branch fires on a false→true edge exactly like current IF, treating unobserved branch history on entry as false. A false predicate can therefore take ELSE on the first evaluation after state entry. If p stays true after an IF edge has been observed without transition, ELSE is still false: lack of a fired transition does not mean the condition is false.

Order is significant. At a pair's position, test the appropriate branch's edge. If it fires, take its target and stop scanning. Otherwise continue to the next rule. In `if (A) goto 2; else goto 3; if (B) goto 4;`, the first pair chooses 2 or 3 on initial evaluation regardless of B. Warn/help about an early always-covering pair when later rules are unlikely to execute; do not reorder rules automatically. A delayed rule higher in the list may start its timer and scanning may continue, matching current AFTER behavior.

Transition entry resets prior-rule bits/timers as the existing engine does, increments entry counts, and executes the destination effect once. An IF/ELSE self-transition is still a transition and may execute each evaluation after the entry reset; show a cycle notice rather than imposing new behavior. For `run once`, IF or ELSE finishes only when the target has no outgoing rules. Continuous terminal states remain terminal until a behavior edit/reapply; there is no implicit loop.

| Gate / runtime situation | IF and ELSE | WHILE | AFTER |
| --- | --- | --- | --- |
| Open, not held | evaluate edges in rule order | evaluate edge, enter and hold target | arm/cancel/fire by simulation time |
| Direct order running | frozen, including branch-history writes | newly true condition can take over, preserving current conflict behavior | frozen; pending timers cleared |
| Owner paused until order ends | no evaluation/history changes | no evaluation | no evaluation; preserve existing pause behavior, with gate transitions cancelling pending where existing engine does |
| Held target | no outgoing rules or ELSE evaluation | test originating UNTIL (or NOT WHEN), return/finish or reassert held effect | no outgoing rules |
| Finished | no effects/transitions | no effects/transitions | no effects/transitions |

Do not change the existing distinction between `orderRunning` cancellation and the early-return `paused` gate: current paused runtime is returned unchanged; specify/test the exact gate sequence through the engine rather than rewriting the two gates as equivalent. Timers use simulation time, never wall clock. The hold exits to its originating source state, increments that state's count, does not execute its entry effect, and one-time WHILE finishes on return. Existing IF/WHILE/AFTER fixtures must stay behaviorally unchanged.

For multiple automations, preserve existing dominant-command sequence arbitration. A selected ELSE effect has exactly the same authority as its paired IF; it must not create a new per-frame override tier. Do not leak a branch's control into another owner's entity. The conflict banner can identify ELSE and still offers pause-until-direct-order-complete.

## Traces, diagrams and errors

Trace exposes branch `if`/`else`, pair/source rule identity, source/target state index, gate, event and completion. Existing IDs remain available internally for binding runtime. UI summaries render two edges with their shared predicate: `if …` and `else (same IF is false)`, not a fabricated user condition. The machine viewer highlights the chosen edge and state, handles self/cross edges, and counts ELSE entries. Distinguish blue IF and a high-contrast green/teal ELSE with text labels; color alone is insufficient.

Runtime rejects/detects a corrupt unresolved target as an inert invalid binding with a reason instead of throwing from `target.id` during gameplay. Validate before installing programs; this is a defensive last guard, not repeated normalization each tick.

## Acceptance

Pure step tests cover first true/false evaluation, predicate changes, constant truth, self-transition, ordered competing IF pairs, absent ELSE compatibility, invalid ELSE syntax, one-time/continuous terminal outcomes, timer interactions, WHILE hold/return, all gates and conflicting direct orders. Each category U/B/P/D uses the same branch semantics. Differential tests from 100 compare old programs without ELSE against the unchanged reference behavior. Runtime traces and machine diagrams distinguish branches. Invalid programs never execute partially.

Run focused `policyStep`, `policyAfterRule`, `policyEngine`, `basePolicies`, `unitBuildPolicies` suites plus new branch cases, then all unit tests and required lint. Handoff: schema projection and IDs, stepping tests/reference traces, rule descriptions/edge-label contract, and command-priority semantics for UI/defence/performance packages.
