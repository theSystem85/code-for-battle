# 109 — Automation command completion waits

Status: implementation in progress. Extends specs 100–108; existing automation behavior remains the default.

## Authoring contract

Every `buildBuilding` and `buildUnits` action has an optional **Wait until produced** checkbox. Finite unit actions have **Wait until done**. Both views share the same `effect.waitForCompletion: true` projection and authoritative CFBL source. Missing/false means no completion wait. CFBL adds an optional suffix after the effect call:

```cfbl
build unit {
  scope global;
  run continuous;
  start 1;
  state 1 { do wait; if (always) goto 2; }
  state 2 { do buildUnits(unitType=tank,quantity=2,delivery=factoryRally) wait until produced; if (always) goto 3; }
  state 3 { do wait; }
}
```

Unit control uses `do moveForward(tiles=2) wait until done;` or `do attackNearestEnemy() wait until done;`. Completion mode is category-specific, with legal atomic insertion/removal in the ATV flyout. The existing `do wait;` means a state with no action and is a different operation.

Supported finite unit effects: moveForward, moveBackward, moveLeft, moveRight, retreat, attackNearestEnemy, takeoff, land, goToWorkshop, goToHospital, goToAmmoFactory. Persistent rotation, aim/follow, auto-fire, protection and defence intents have no natural completion; do not offer the modifier for these actions. No arbitrary identifiers or predicates are added. Initial-state effects retain existing semantics: they run when entered through a transition, not automatically when an automation is attached.

## Runtime contract

A pending completion wait blocks outgoing IF/ELSE/AFTER transitions, WHILE return/reassertion, and one-time terminal completion. It retains the current state and never reissues an accepted command. The next normal evaluation resumes only after the exact issued work succeeds. Rules and timers do not progress while waiting.

Production tracks an accepted order receipt, owner and source revision. All members of a unit stack must actually spawn; their rally/delivery behavior is separate. A building must exist at its valid placement and finish construction: queue acceptance or a blueprint becoming ready is insufficient. Other orders of the same type cannot fulfill this receipt. Refused orders use existing retry cadence without being counted as produced.

Unit waits freeze the issued movement destination, attack target or finite flight/service objective. Moving elsewhere, idle state, another target's death or a later manual order does not fulfill the original objective. Attack completion means destruction of the originally issued target. Manual orders retain priority; cancellation/interruption or unreachable work reports blocked/failed, never successful completion. Reapply/re-enable or an accepted behavior revision starts fresh work. Removing/revising/disabling the automation and actor destruction clean up its wait ownership without canceling unrelated orders.

Receipt/runtime state, exact typed identities and source revisions survive save/load and supported owner resync. Replay records outcomes and does not run live machines again. A restored wait must not enqueue or issue the work a second time. Missing/canceled receipts fail safely rather than unlock transitions.

## Performance and verification

Control polls only at its existing 150 ms simulation-time cadence; production evaluates at 1,000 ms. For 600 bound units this is at most 4,000 completion checks/second, independent of DPR. Use bounded receipt maps and lifecycle events/shared entity indexes; no parsing, whole-world scans or allocations per entity per render frame. Initialization and waits remain outside AI-specific logic.

Verify exact production stacks, placed/completed buildings, unrelated/canceled work, manual overrides, movement arrival, exact target destruction, one-time terminal waits, IF/ELSE/WHILE/AFTER blocking, save/resync/replay continuation, revision/lifecycle cleanup, DAV↔ATV persistence and illegal modifiers. Run focused differential/runtime and real production/movement browser coverage, full units, lint, build and documentation validation. Retain qualifying-hardware 75 FPS certification as open when only headless/software diagnostics are available.
