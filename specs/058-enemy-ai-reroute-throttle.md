# Enemy AI Reroute Throttle (Harvester Under Attack)

## Summary
Enemy AI units must not reroute more often than once every 2 seconds when reacting to combat pressure. The observed symptom was rapid path flicker on attacked enemy harvesters caused by repeated retreat reroutes in tight update loops.

## Requirements
- Enemy harvester retreat routing must be throttled to **>= 2000 ms** between reroutes when the retreat target is unchanged.
- The retreat handler should reuse the current retreat plan during the cooldown window instead of recalculating a new path every AI update.
- Retreat state consistency must be preserved while throttled:
  - `isRetreating` remains true
  - `retreatIssuedByPlayer` remains false
  - `moveTarget` remains the active retreat target
  - ore/harvest state remains cleared while retreating

## Implementation Notes
- Add a shared reroute cooldown constant in `src/ai/retreatLogic.js`.
- Track the last AI reroute timestamp per unit (`lastAiRerouteTime`).
- In `handleHarvesterRetreat`, skip path recomputation when:
  - retreat target is unchanged,
  - the unit already has an active retreat path,
  - and reroute cooldown has not elapsed.

## Acceptance Criteria
- Under sustained attack, selected enemy harvesters no longer exhibit rapid path-line flickering.
- AI retreat reroutes are limited to at most once every 2 seconds for a stable retreat target.
- Existing retreat behavior still triggers and works when no route exists, target changes, or cooldown expires.

## Follow-up Root Cause (2026-03-28)
- A second conflict remained after adding the reroute cooldown: harvester economy automation could still issue ore/unload routing while `isRetreating` was active.
- This created a retreat-vs-economy command tug-of-war where paths were overwritten rapidly and the harvester appeared to flicker in place.

## Follow-up Requirement
- While `isRetreating` is true on a harvester, retreat logic must be the sole owner of movement intent.
- Harvester economy loops (ore targeting, unloading, deferred ore-search scheduling) must not issue competing movement/path updates until retreat ends.

## Follow-up Root Cause 2 (2026-03-28)
- Retreat exit and retreat re-entry could happen back-to-back because `recentlyDamaged` remained true for several seconds after retreat ended.
- That allowed a stop-retreat frame to immediately re-trigger retreat without a new nearby threat, producing another reroute loop.

## Follow-up Requirement 2
- When a harvester exits retreat, apply a short re-engage cooldown for damage-only retreat triggers.
- Nearby active threats must still be able to bypass this cooldown and force immediate retreat.

## Follow-up Root Cause 3 (2026-03-28)
- AI-controlled units were also subject to the generic attack-move reroute path in `unitMovement.js`, which is intended for direct/player control behavior.
- This introduced a second AI path owner that could rewrite AI movement/attack routes in parallel with enemy AI systems.

## Follow-up Requirement 3
- For AI-controlled units, disable generic attack-move reroute handling in `unitMovement` and keep reroute ownership in dedicated AI systems.

## Follow-up Root Cause 4 (2026-03-28)
- Damage-only harvester retreat checks could still trigger while the harvester was already productively engaged at ore (harvesting/unloading/at assigned ore tile), causing turn-around loops with no useful economy output.

## Follow-up Requirement 4
- Suppress damage-only retreat triggers when a harvester is already doing useful economy work at ore/refinery.
- Nearby active threats remain the primary immediate retreat trigger.

## Follow-up Root Cause 5 (2026-03-28)
- Combat tanks could still reroute too aggressively because path updates were triggered from transient distance-trend noise even when the target tile had not changed and the route was clear.

## Follow-up Requirement 5
- Combat path recalculation should not trigger on short-term distance oscillation alone.
- Recalculation should primarily occur on initial-path need, throttle expiry with real target movement, or explicit blockage/stuck flows.

## Follow-up Root Cause 6 (2026-03-28)
- Harvester ore approach used a tight arrival threshold, allowing micro-overshoot/turning feedback around ore tiles where harvest start did not trigger quickly enough.

## Follow-up Requirement 6
- Accept a wider ore arrival proximity and clear active move/path intent when near ore so harvest starts reliably instead of oscillating.

## Follow-up Root Cause 7 (2026-03-28)
- Interrupted harvesting could leave stale ore-tile reservation state, so the harvester could keep re-targeting the same ore tile while never legally entering harvest state.
- Combined with near-tile path recalculation, this produced repeated same-target reroutes and turn-around loops on the ore tile.

## Follow-up Requirement 7
- Harvest interruption paths must always release ore-tile harvest reservations.
- Harvester state should track and clear active harvest reservation ownership explicitly to avoid reservation leaks.
