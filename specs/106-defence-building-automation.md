# 106 — Defence-building control automation

Status: software implemented; final integrated validation is recorded in [release evidence](../docs/automation-release-evidence.md). Physical iOS keyboard/device verification and qualifying-hardware 75 FPS certification remain open. Read [099](099-automation-cfbl-program.md). Dependencies: [100](100-cfbl-language-and-coverage.md), [101](101-automation-source-sync-and-migration.md), [102](102-automation-if-else-runtime.md); consume UI adapters from 103/104 and integrate with 107. Own defence capability metadata, adapters, binding/status UI and lifecycle. Do not build a second state-machine engine.

## Scope and bindings

Support existing defence types `turretGunV1`, `turretGunV2`, `turretGunV3`, `rocketTurret`, `teslaCoil`, `artilleryTurret`. Walls, production/service buildings, construction yards and mobile units are not defence-control targets. The new category is `control defence-building`, scope global or individual, execution once or continuous, using the same IF/ELSE/WHILE/AFTER semantics and seven indexed states.

Global defence automations attach only to the commanding owner's completed, living supported defences, including newly constructed buildings. Individual automations apply/remove through the existing friendly-building interaction pattern (radial menu/selection controls); right-click must preserve manual attack behavior and touch offers the same actions without requiring a mouse. Read-only inspection for foreign buildings must not allow apply/enable. Ownership changes remove old-owner bindings/intents; sales, destruction and restart tear them down. Re-enabling creates fresh runtimes; source revisions follow 101.

Use stable entity IDs and a typed `building` binding identity so collisions with unit IDs cannot misroute commands. Expose enabled/in-control counts, waiting/manual/inactive status, current numbered state, delay, WHILE hold and entries in the Automation panel and building inspection/state-machine viewer, following unit UI conventions. Counting/status refresh stays throttled outside frame rendering (existing 2/4 Hz patterns). Buildings in construction, wrecks and sold buildings show inactive and cannot run.

## Capability matrix

Implement the D entries defined by spec 100, using shared catalog capability metadata. Do not offer unit movement, body turning, takeoff, protect-follow, travel-to-service, production or crew/fuel/XP checks to a defence category.

| Action/measurement | Gun V1/V2/V3 | Rocket turret | Tesla coil | Artillery turret |
| --- | --- | --- | --- | --- |
| `holdFire`, `resumeFire`, `autoAttackInRange` | yes | yes | yes | yes |
| `aimNearestEnemy`, `fireAtLocked` | yes | yes | lock/fire without physical rotation | yes |
| `turretLeft`, `turretRight`, absolute `turretRotation` | yes | yes | unavailable | yes if existing rotating turret is measurable |
| `fireForward` | yes, existing weapon-compatible projectile | unavailable | unavailable | unavailable |
| HP, reload, money, power, building counts, enemy distance/visibility/range | yes | yes | yes | yes |
| Ammo | existing ammo fields only | existing ammo fields only | unavailable unless genuinely tracked | existing ammo fields only |

Verify each type against `buildingSystem.js` and current configuration before enabling it. Where source does not support a listed conditional capability (e.g. artillery turret rotation field), surface unavailability; do not simulate phantom ammo/rotation. Catalog coverage tests must list actual supported capabilities for all six types. For a global program, capability-dependent leaf measurements remain unavailable/false on incompatible buildings and effects safely refuse; UI help warns about the eligible subset. For an individual selected defence, hide/disable unsupported effects/modes with reasons. A stored generic global source remains representable without an entity being selected.

`enemyVisible`, `enemyInFireRange`, `enemyDistance`, legacy `enemyInRange` and `underFire`, `distance(kind=unit,...)`, `canAttack(kind=unit)` and `attacking(kind=unit|building)` use real sensor/combat semantics. Do not grant omniscience through a new adapter. Shared world visibility and allegiance decide eligible enemies. Preserve units' center-based coordinates; building center is `(tileX + width/2, tileY + height/2)` scaled by TILE_SIZE. Do not treat building tile coordinates as unit world-pixel coordinates.

## Commands and combat integration

Create a defence command adapter rather than call `unitCommandApi` on a building. Share pure selection helpers and run issuance under the existing automation-issued-order guard to avoid classifying automation actions as direct commands. Actions install bounded control intent into the existing defence update, which remains responsible for real range, min range, line of sight, target eligibility, alignment, power, ammo, reload, bursts, damage, sound and projectile construction.

- `autoAttackInRange()` clears automation-owned suppression and requests the normal allowed in-range selection. It never chases/moves a building or bypasses manual forced targets.
- `aimNearestEnemy()` acquires/locks the nearest eligible target using stable deterministic tie-breaking and suppresses automatic firing while the aim-only intent is dominant. Normal turret tracking continues where applicable. Tesla stores a lock without pretending to rotate.
- `fireAtLocked()` requests one eligible weapon firing attempt at the lock; in a held state it may repeat at the automation cadence, but actual firing obeys the weapon cooldown/burst path. Missing/destroyed/unreachable/ineligible target refuses safely.
- `turretLeft()`/`turretRight()` install signed rotation intent until superseded/hold exit; actual continuous angular movement uses existing simulation-update speed, not a 150 ms jump. Rotational intent suppresses automatic target tracking while dominant and does not independently fire.
- `fireForward()` uses the gun's existing projectile behavior in its actual turret direction and obeys all weapon checks. Refuse on other weapon types rather than generate generic bullets.
- `holdFire()` suppresses firing without disabling health/power/service updates. `resumeFire()` removes automation-owned suppression/aim-only intent and resumes normal defensive behavior; it cannot cancel a manual hold-fire command.

Distinguish manual hold-fire/target queue from automation-owned intent. A manual attack, stop/hold-fire or target queue wins immediately and is recorded through the direct-order gate. Newly true WHILE can take over under the same documented conflict behavior as units; offer pause-until-order-done. Manual hold-fire is an explicit persistent manual override, not instantly complete because no target exists; suspend automation until a subsequent manual resume/attack or explicit owner release. A manual attack order is complete when its valid forced queue/target is exhausted under existing command rules; do not clear it merely because a target temporarily leaves range if existing commands retain it.

An intent records issuer/automation ID, revision and branch/hold identity so cleanup can remove only what that automation owns. WHILE exit clears its temporary suppression/rotation/aim intent and restores the prior manual/default control; do not execute the source state's effect on return globally (unit behavior must remain unchanged). Disabling/removing/revising/deleting an automation clears its owned ongoing intent. A one-time terminal action behaves like an issued command: its final hold-fire or aim/rotation intent remains until an explicit newer command, resume or removal of that automation's command ownership; do not clear the command in the same step that marks the machine finished. Automatic one-time binding cleanup must therefore retain a minimal final-intent owner record until superseded, without continuing to evaluate the finished machine. Save/restore includes it. This is distinct from temporary WHILE intent, which always clears at hold end.

Commands should return structured accepted/refused reasons reused in status/help: foreign owner, incomplete/dead building, unsupported capability, no valid target, low power, empty ammo, reload pending, or inactive/replay authority. A failed effect must not alter target/hold flags halfway through. Keep existing forced-target/manual behavior functional when no automation is applied.

## Simulation and lifecycle

Evaluate at the existing control interval (150 ms simulation time), early-out for buildings without bindings or active final intent. Gather enabled global defence programs only when store version changes. The defence automation pass runs before defensive combat consumes intent, once under the authoritative simulation context chosen in 101. Avoid independent timers or wall-clock callbacks. Reuse shared entity/spatial lookups from 107; no new buildings×units full scan per defence effect each frame. Rendering DPI does not multiply CPU machine work.

Preserve source/revision, runtime/intent, manual override and stable target references in save/restore/resync/replay. Source imported for a different owner never attaches automatically. Construction finalization attaches globals once using the shared building lifecycle; sale/destruction removes bindings and final intent without leaving stale target IDs. AI ownership can use the same validated adapter; it adds no LLM call or CFBL parse to an AI tick.

## Acceptance and handoff

Behavior tests cover all six building types, each supported action, missing capabilities, visibility/air/submerged eligibility, min/max range, line of sight, ammo/reload/power/burst checks, IF/ELSE, WHILE suppression return, simulation-time AFTER, one-time final intent, direct attack/manual hold-fire conflicts, global/individual owner isolation, new construction, sale/destruction and restore mid-hold/delay. Test existing manual attack and default firing with zero automations to detect regressions. Integration verifies a real turret firing through the existing projectile path; stubbing all weapon methods is insufficient.

UI tests cover category setup, per-building apply/remove, status counts, indexed live diagram and DAV↔ATV round-trip. Run all unit tests and lint. Spec 107 measures the hot-path delta and worst-case active defences; qualifying-hardware gate cannot be waived by functional tests. Handoff: capability matrix verified against real fields, adapter APIs/refusal codes, lifecycle hooks, authority/tie-break rules, final-intent serialization and benchmark scene.
