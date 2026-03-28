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
