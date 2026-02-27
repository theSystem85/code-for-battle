# Feature Specification: Combat System Enhancements

**Feature Branch**: `006-combat-system-enhancements`  
**Created**: 2025-11-05  
**Status**: Implemented (Retrospective Documentation)  
**Input**: User description: "Hit zone damage system, recoil and muzzle flash effects, enemy retaliation, tank variants (V2/V3), rocket tank improvements, and target indicators"

**Note**: This is a retrospective specification documenting an already-implemented feature for the Code for Battle RTS game.

## Maintenance Updates

- 2026-02-01: Split `src/game/unitCombat.js` into focused submodules under `src/game/unitCombat/` to keep each file under 1k LOC while preserving existing combat behavior.
- 2026-01-31: Defensive turrets now require clear line-of-sight to targets before firing, matching player and AI behavior.
- 2026-02-06: Apache helicopters now hold max-range standoff positions in combat, ignore ground-unit pathfinding, and their rockets deal 3x damage to tanker and ammunition trucks.
- 2026-02-10: Apache helicopters now auto-return to helipads when rockets run dry, force landing alignment on the pad, reload to full before re-engaging the same target, and return to helipad after the target is destroyed.
- 2026-02-23: Player-commanded defensive buildings now support FIFO forced-target queues; queued targets render the existing red attack triangle with queue numbers while the buildings are selected.
- 2026-02-23: AGF now supports selected defensive buildings by enqueuing boxed enemy targets into forced-target FIFO queues; fixed forced-target assignment bug that made rocket/artillery turrets aim without firing when force-attacking enemies.

## User Scenarios & Testing

### User Story 1 - Hit Zone Damage System (Priority: P1)

As a player, I want tank damage to vary based on where the shot hits (front, side, rear), so that tactical positioning and flanking maneuvers provide meaningful combat advantages.

**Why this priority**: Core combat mechanic that adds tactical depth and rewards strategic positioning, transforming combat from simple DPS calculation to positional warfare.

**Independent Test**: Attack enemy tank from front (1.0x damage), side (1.3x damage), and rear (2.0x damage), verify damage differences and tactical impact.

**Acceptance Scenarios**:

1. **Given** a tank is hit from the front, **When** damage is calculated, **Then** base damage is multiplied by 1.0x (no modifier)
2. **Given** a tank is hit from the rear, **When** damage is calculated, **Then** base damage is multiplied by 2.0x (double damage)
3. **Given** a tank is hit from the side (left or right), **When** damage is calculated, **Then** base damage is multiplied by 1.3x (30% bonus)
4. **Given** hit zone system is active, **When** critical rear hit occurs, **Then** "critical_damage" sound plays for player units only
5. **Given** hit zones are calculated, **When** determining which zone, **Then** system uses angle between shooter and target facing direction
6. **Given** any tank type, **When** receiving hits, **Then** hit zone multipliers apply universally to all tank variants

---

### User Story 2 - Recoil & Muzzle Flash Effects (Priority: P2)

As a player, I want to see visual feedback when tanks fire (recoil animation and muzzle flash), so that combat feels more dynamic and impactful.

**Why this priority**: Polish feature that significantly enhances combat feel and visual satisfaction, though not affecting core mechanics.

**Independent Test**: Command tank to fire at enemy, verify gun barrel recoils backward up to 5 pixels and muzzle flash appears at barrel tip.

**Acceptance Scenarios**:

1. **Given** a tank fires a weapon, **When** shot is triggered, **Then** gun barrel begins recoil animation moving backward along barrel axis
2. **Given** recoil animation starts, **When** animating, **Then** barrel moves up to 5 pixels backward using dampened movement
3. **Given** recoil reaches maximum, **When** animation completes, **Then** barrel returns to normal position smoothly
4. **Given** gun fires, **When** projectile launches, **Then** muzzle flash renders at barrel tip with configurable offset
5. **Given** muzzle flash appears, **When** rendered, **Then** flash follows recoil movement (stays at barrel tip during recoil)
6. **Given** muzzle flash is shown, **When** brief display time elapses, **Then** flash disappears after 2-3 frames
7. **Given** recoil and flash are active, **When** tank uses image-based rendering, **Then** effects apply to gun barrel component specifically
8. **Given** recoil system is implemented, **When** using fallback rendering, **Then** recoil applies to turret visualization appropriately

---

### User Story 3 - Enemy Retaliation System (Priority: P1)

As a player, I want enemy units to always fight back when attacked, so that combat feels reactive and aggressive rather than passive.

**Why this priority**: Core AI behavior that ensures engaging combat and prevents exploitation of passive enemies, critical for balanced gameplay.

**Independent Test**: Attack enemy unit, verify it immediately retaliates by attacking back unless in flee mode (< 10% health).

**Acceptance Scenarios**:

1. **Given** an enemy unit is hit by bullet, **When** damage is applied, **Then** enemy tracks attacker and marks itself as "being attacked"
2. **Given** enemy is being attacked, **When** next AI update occurs (every 2s), **Then** enemy prioritizes retaliating against attacker
3. **Given** enemy is retaliating, **When** attacker is in range (< 15 tiles for units), **Then** enemy engages and fires back
4. **Given** enemy is hit by building (Tesla coil, turret), **When** attacked, **Then** enemy retaliates against building if in range (< 20 tiles)
5. **Given** enemy takes explosion damage, **When** AOE hit occurs, **Then** enemy retaliates against original shooter (not explosion center)
6. **Given** enemy is below 10% health, **When** in flee mode, **Then** retaliation is suppressed and unit continues fleeing to base
7. **Given** attacker moves out of range or is destroyed, **When** retaliation target becomes invalid, **Then** enemy resumes normal AI behavior
8. **Given** retaliation is active, **When** 5 seconds elapse with no new hits, **Then** "being attacked" flag resets and retaliation ends

---

### User Story 4 - Tank V2 & V3 Variants (Priority: P2)

As a player, I want access to upgraded tank variants with enhanced capabilities (aim-ahead prediction for V2, improved stats for V3), so that I can progress to more powerful units.

**Why this priority**: Provides unit progression and variety, though basic tanks are sufficient for core gameplay. Enhances strategic depth with unit specialization.

**Independent Test**: Build Tank V2, attack moving target, verify aim-ahead prediction hits target. Build Tank V3, verify it has V2 capabilities plus 30% more health.

**Acceptance Scenarios**:

1. **Given** Tank V2 is built, **When** engaging moving target, **Then** firing system calculates aim-ahead based on target velocity and direction
2. **Given** aim-ahead is active, **When** firing at moving target, **Then** projectile aims at predicted future position rather than current position
3. **Given** Tank V2 fires with aim-ahead, **When** target maintains trajectory, **Then** hit probability increases significantly vs non-predictive aiming
4. **Given** Tank V3 is built, **When** checking capabilities, **Then** unit has all Tank V2 features including aim-ahead
5. **Given** Tank V3 is compared to V1, **When** checking stats, **Then** V3 has 30% more health than standard tank
6. **Given** Tank V3 is purchased, **When** built, **Then** cost is 3000 credits (higher than V1/V2)
7. **Given** any tank variant, **When** in combat, **Then** hit zone system, recoil, and all other combat features apply equally

---

### User Story 5 - Rocket Tank Improvements (Priority: P2)

As a player, I want rocket tanks to fire multiple projectiles per volley with slower but more visible rockets, so that rocket units feel distinct from regular tanks.

**Why this priority**: Unit differentiation and variety, creates distinct tactical role for rocket units with area suppression capabilities.

**Independent Test**: Build rocket tank, command to attack, verify it fires 3 rockets per volley with visibly slower projectiles.

**Acceptance Scenarios**:

1. **Given** rocket tank fires, **When** volley is triggered, **Then** 3 projectiles launch instead of single projectile
2. **Given** 3 rockets fire, **When** damage is calculated, **Then** each rocket does proportionally less damage (balanced vs single shot)
3. **Given** rockets are fired, **When** traveling, **Then** projectiles move 4x slower than standard tank bullets
4. **Given** slow rockets, **When** observed by player, **Then** rockets are easily visible and trackable across map
5. **Given** rocket tank is built, **When** viewing unit, **Then** unit displays 3 static tubes on top (no rotating turret)
6. **Given** rocket tank engages, **When** aiming, **Then** entire wagon rotates to point at target (no independent turret)
7. **Given** rocket tank fires, **When** projectiles hit, **Then** explosions occur at impact points creating visual distinction from bullets
8. **Given** rocket tank targets an airborne Apache, **When** rockets reach the helicopter, **Then** they detonate on contact and apply damage immediately
9. **Given** rocket tank receives a move order after attacking, **When** the move command is issued, **Then** the burst is cancelled and the unit drives to the destination without firing at that point
10. **Given** rocket tank rockets are in flight, **When** they pass over other units or buildings, **Then** they do not detonate until reaching the designated target
11. **Given** rocket tank is ordered to attack a target outside its range, **When** the target is selected, **Then** the rocket tank advances until it reaches firing range
12. **Given** rocket tank has line-of-sight blocked by walls, **When** the target is within range, **Then** the rocket tank still fires rockets that arc over the obstruction

---

### User Story 6 - Target Indicators (Priority: P2)

As a player, I want to see visual indicators showing where my units are moving and attacking, so that I can track unit orders at a glance without constant micro-management.

**Why this priority**: Quality-of-life feature that improves clarity and reduces need to watch every unit, though basic gameplay works without it.

**Independent Test**: Command units to move and attack, verify green triangles appear at move destinations and red triangles appear above attack targets.

**Acceptance Scenarios**:

1. **Given** units are commanded to move, **When** move order is issued, **Then** green upside-down triangles appear at destination tiles
2. **Given** green indicators are shown, **When** units are selected, **Then** indicators remain visible showing active movement orders
3. **Given** units are commanded to attack, **When** attack order is issued, **Then** red upside-down triangles appear above target units
4. **Given** red indicators are shown, **When** attacker is selected, **Then** indicators remain visible showing active attack orders
5. **Given** units use AGF (attack group), **When** multiple targets marked, **Then** both red (attack) and green (move) indicators show as appropriate
6. **Given** indicators are visible, **When** units move during combat, **Then** indicators update position in real-time following targets
7. **Given** attack completes or target destroyed, **When** order finishes, **Then** indicator disappears automatically
8. **Given** unit is reselected, **When** viewing unit, **Then** active order indicators reappear showing current status
9. **Given** an enemy is hovered outside weapon range, **When** combat units are selected, **Then** the cursor changes to an out-of-range attack cursor
10. **Given** one or more defensive buildings are selected, **When** the player force-queues enemy targets, **Then** targets are stored and consumed in FIFO order.
11. **Given** defensive building target queues exist, **When** selected defensive buildings are visible, **Then** queued enemy targets display the red attack triangle with the queue position number.
12. **Given** defensive buildings are selected, **When** the player uses AGF box selection over enemies, **Then** those enemies are queued as forced targets in FIFO order for each selected defensive building.

### Edge Cases

- What happens when rear hit occurs on already low-health tank? (Damage applies normally, may result in one-shot kill)
- Can hit zones be exploited by circling enemies? (Yes, this is intended tactical gameplay - positioning matters)
- What if recoil animation is interrupted by death? (Animation stops immediately, no visual artifacts)
- What happens when enemy retaliates but player unit already died? (Retaliation target becomes invalid, enemy resumes normal behavior)
- Can Tank V2 aim-ahead handle erratic movement patterns? (Prediction assumes straight-line trajectory, fails if target changes course)
- What if rocket tank fires at very close range? (All 3 rockets hit almost instantly, maximum damage output at close range)
- What happens to indicators when unit enters guard mode? (Guard mode indicators override attack indicators)
- Can indicators stack if multiple units attack same target? (Each attacking unit shows its own red indicator on shared target)
- What if muzzle flash position is misconfigured? (Falls back to default offset, may look slightly off but doesn't break)
- How does retaliation interact with unit levels? (Level bonuses (range, armor, fire rate) apply during retaliation combat)

## Requirements

### Functional Requirements

**Hit Zone Damage System:**
- **FR-001**: System MUST calculate hit angle between shooter direction and target facing direction
- **FR-002**: System MUST apply 1.0x damage multiplier for frontal hits (facing within ±45° of shot direction)
- **FR-003**: System MUST apply 2.0x damage multiplier for rear hits (rear arc ±45° from directly behind)
- **FR-004**: System MUST apply 1.3x damage multiplier for side hits (left/right arcs between front and rear)
- **FR-005**: System MUST play "critical_damage" sound only for player units hit from behind
- **FR-006**: System MUST apply hit zone calculations to all tank types universally
- **FR-007**: System MUST calculate hit zones using unit rotation/facing data at time of impact

**Recoil & Muzzle Flash:**
- **FR-008**: System MUST animate gun barrel recoil up to 5 pixels backward along barrel axis when firing
- **FR-009**: System MUST use dampened movement for smooth recoil animation (ease-out)
- **FR-010**: System MUST return barrel to normal position after recoil completes
- **FR-011**: System MUST render muzzle flash at barrel tip with configurable offset from tankImageConfig.json
- **FR-012**: System MUST make muzzle flash follow barrel during recoil (maintain position at tip)
- **FR-013**: System MUST display muzzle flash for 2-3 frames only (brief flash)
- **FR-014**: System MUST apply recoil to gun barrel component specifically in image-based rendering
- **FR-015**: System MUST apply appropriate recoil visualization in fallback rendering mode
- **FR-016**: System MUST cache and reuse muzzle flash graphics for performance

**Enemy Retaliation System:**
- **FR-017**: System MUST track last attacker when unit takes damage from any source (bullets, Tesla, explosions)
- **FR-018**: System MUST mark unit as "being attacked" when damaged with timestamp
- **FR-019**: System MUST prioritize retaliation target during AI update cycles (every 2s)
- **FR-020**: System MUST check retaliation range: 15 tiles for unit attackers, 20 tiles for building attackers
- **FR-021**: System MUST suppress retaliation when unit is in flee mode (< 10% health)
- **FR-022**: System MUST clear retaliation state after 5 seconds of no new damage
- **FR-023**: System MUST clear retaliation target when attacker is destroyed or moves out of range
- **FR-024**: System MUST attribute explosion damage to original shooter for retaliation purposes
- **FR-025**: System MUST integrate retaliation with existing AI target selection priority system

**Tank V2 & V3 Variants:**
- **FR-026**: System MUST implement aim-ahead prediction for Tank V2 calculating target future position
- **FR-027**: System MUST use target velocity and direction vectors for aim-ahead calculation
- **FR-028**: System MUST fire projectiles at predicted position rather than current position
- **FR-029**: System MUST give Tank V3 all Tank V2 capabilities including aim-ahead
- **FR-030**: System MUST give Tank V3 30% more health than Tank V1 base health
- **FR-031**: System MUST set Tank V3 cost at 3000 credits
- **FR-032**: System MUST apply all combat features (hit zones, recoil, retaliation) to V2/V3 equally

**Rocket Tank Improvements:**
- **FR-033**: System MUST fire 3 projectiles per volley when rocket tank attacks
- **FR-034**: System MUST reduce individual rocket damage proportionally (3 rockets = balanced vs 1 tank bullet)
- **FR-035**: System MUST make rocket projectiles travel 4x slower than standard tank bullets
- **FR-036**: System MUST render rocket tank with 3 static tubes on top (no rotating turret)
- **FR-037**: System MUST make rocket tank rotate entire wagon to aim (no independent turret rotation)
- **FR-038**: System MUST create explosion effects at rocket impact points
- **FR-039**: System MUST detonate rocket tank projectiles when they reach airborne targets, applying damage immediately
- **FR-040**: System MUST cancel rocket tank burst fire when a move command is issued, preventing rockets from firing at the move destination
- **FR-041**: System MUST ensure rocket tank rockets ignore mid-flight collisions so they detonate only at the intended target
- **FR-042**: System MUST move rocket tanks toward targets until they are within rocket firing range
- **FR-043**: System MUST allow rocket tanks to fire at targets in range even when line-of-sight is blocked

**Target Indicators:**
- **FR-044**: System MUST display green upside-down triangles at movement destination tiles
- **FR-045**: System MUST display red upside-down triangles above attack target units
- **FR-046**: System MUST show indicators only when attacking/moving unit is selected
- **FR-047**: System MUST update indicator positions in real-time as targets move
- **FR-048**: System MUST remove indicators when orders complete or targets are destroyed
- **FR-049**: System MUST restore indicators when unit is reselected (persistent order visualization)
- **FR-050**: System MUST support both red and green indicators simultaneously during AGF mode
- **FR-051**: System MUST render indicators above health bars but below other HUD elements
- **FR-052**: System MUST show a distinct attack cursor when a hovered target is out of range for selected units
- **FR-060**: System MUST let selected defensive buildings append new forced attack targets to a FIFO queue when additional force-attack orders are issued.
- **FR-061**: System MUST automatically promote the next queued forced target when the current forced target becomes invalid or out of range.
- **FR-062**: System MUST render queue order numbers inside the existing red target-indicator triangle for queued forced targets while defensive buildings are selected.
- **FR-063**: System MUST include selected defensive buildings in AGF box-attack commands and enqueue selected enemy targets into each building's forced-target FIFO queue without duplicating already-queued targets.
- **FR-064**: System MUST resolve force-attack target selection for defensive buildings against enemy objects (units/buildings/factories) before falling back to ground targets.

**Integration & Performance:**
- **FR-053**: System MUST maintain 60fps with 100+ units using all combat enhancements simultaneously
- **FR-054**: System MUST integrate combat enhancements with unit leveling system (bonuses apply)
- **FR-055**: System MUST save and load all combat states through save/load system
- **FR-056**: System MUST apply combat enhancements to both player and AI units equally

**Line-of-Sight & Obstructions:**
- **FR-057**: Tank projectiles MUST respect building collision for all parties; shots cannot pass through allied or enemy structures.
- **FR-058**: Tank combat AI MUST seek alternate positions when buildings block line-of-sight and resume firing only after a clear lane is available.
- **FR-059**: Defensive turret guns MUST not fire when a building blocks the line-of-sight to their target.

### Key Entities

- **Hit Zone**: Angular region around tank defining damage multiplier (front 1.0x, side 1.3x, rear 2.0x)

- **Recoil Animation State**: Temporary animation data tracking gun barrel displacement and return timing

- **Muzzle Flash**: Brief visual effect rendered at gun barrel tip with configurable offset, follows recoil

- **Retaliation Target**: Reference to attacking unit/building with timestamp, expires after 5s or target invalidation

- **Aim-Ahead Calculation**: Predictive targeting computation using target velocity and direction for Tank V2/V3

- **Target Indicator**: Visual marker (red/green triangle) showing active movement or attack orders, persists when selected

- **Rocket Volley**: Group of 3 projectiles fired simultaneously from rocket tank, each with reduced damage

## Success Criteria

### Measurable Outcomes

**Hit Zone Damage System:**
- **SC-001**: Rear hits consistently deal 2x damage compared to frontal hits in controlled tests
- **SC-002**: Side hits consistently deal 1.3x damage compared to frontal hits
- **SC-003**: Critical damage sound plays only for player units hit from behind (not AI units)
- **SC-004**: Hit zone calculations work accurately across all tank facing directions (360°)
- **SC-005**: Players observe and utilize flanking tactics for damage advantage
- **SC-006**: Hit zone system applies uniformly to all tank types without exceptions

**Recoil & Muzzle Flash:**
- **SC-007**: Gun barrel recoils exactly 5 pixels maximum backward when firing
- **SC-008**: Recoil animation uses smooth dampened movement (no jerky motion)
- **SC-009**: Muzzle flash renders at barrel tip and follows recoil accurately
- **SC-010**: Flash displays for 2-3 frames only (brief, realistic)
- **SC-011**: Recoil applies specifically to gun barrel in 3-component rendering system
- **SC-012**: Visual effects do not cause performance degradation (maintains 60fps)

**Enemy Retaliation System:**
- **SC-013**: Enemy units retaliate within 2 seconds of being attacked (next AI update cycle)
- **SC-014**: Retaliation prioritizes attacker over other potential targets 100% of time (unless fleeing)
- **SC-015**: Units below 10% health flee instead of retaliating (flee mode suppression works)
- **SC-016**: Retaliation state clears after 5 seconds of no new damage
- **SC-017**: Retaliation works for bullet, Tesla coil, and explosion damage sources
- **SC-018**: Range checks work correctly (15 tiles for units, 20 tiles for buildings)

**Tank V2 & V3 Variants:**
- **SC-019**: Tank V2 aim-ahead increases hit rate on moving targets by 40-60% vs non-predictive
- **SC-020**: Aim-ahead prediction calculates future position accurately for straight-line movement
- **SC-021**: Tank V3 has 30% more health than Tank V1 (measurable stat difference)
- **SC-022**: Tank V3 costs exactly 3000 credits at build time
- **SC-023**: Both V2 and V3 apply aim-ahead to all projectile types
- **SC-024**: All combat features work identically on V1, V2, and V3 variants

**Rocket Tank Improvements:**
- **SC-025**: Rocket tank fires exactly 3 projectiles per volley consistently
- **SC-026**: Rockets travel 4x slower than tank bullets (visually trackable)
- **SC-027**: Total rocket volley damage is balanced with single tank shot (3 rockets ≈ 1 tank shot)
- **SC-028**: Rocket tank displays 3 static tubes (no rotating turret visual)
- **SC-029**: Entire wagon rotates to aim rockets (observable behavior)
- **SC-030**: Explosions appear at all 3 rocket impact points

**Target Indicators:**
- **SC-031**: Green triangles appear at movement destinations when units selected
- **SC-032**: Red triangles appear above attack targets when attackers selected
- **SC-033**: Indicators update position at 60fps as targets move (smooth tracking)
- **SC-034**: Indicators disappear immediately when orders complete (< 100ms)
- **SC-035**: Indicators reappear when units are reselected showing active orders
- **SC-036**: Both red and green indicators display simultaneously during AGF without conflict

**Performance & Integration:**
- **SC-037**: All combat enhancements maintain 60fps with 100+ active combat units
- **SC-038**: Hit zone calculations add < 5% CPU overhead vs simple damage model
- **SC-039**: Recoil and muzzle flash animations add < 3% GPU overhead
- **SC-040**: Retaliation system integrates with existing AI priority without conflicts
- **SC-041**: Combat enhancements work seamlessly with unit leveling (bonuses apply correctly)
- **SC-042**: All combat states save and load correctly without data loss

**Tactical Depth:**
- **SC-043**: Players demonstrate flanking behavior to exploit rear hit zones
- **SC-044**: Tank V2/V3 variants provide meaningful upgrade path and tactical choices
- **SC-045**: Rocket tanks fulfill distinct tactical role vs regular tanks (area suppression)
- **SC-046**: Enemy retaliation creates reactive combat requiring player attention
- **SC-047**: Visual indicators reduce micro-management burden by 30-40% during large battles
- **SC-048**: Combat feels more dynamic and impactful with visual effects (player satisfaction)

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]  
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Additional Behavior - Apache Rockets (Priority: Bugfix)

As a player, I want Apache air-to-air rockets to avoid harming ground units or buildings so that aerial duels do not cause collateral ground damage.

**Acceptance Scenarios**

1. **Given** an Apache fires at an airborne Apache, **When** the rocket detonates, **Then** only the airborne target is damaged and no ground units within the blast area lose health.
2. **Given** an Apache fires at an airborne Apache, **When** the rocket detonates above a building, **Then** that building receives no damage from the airburst.

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

### Follow-up: Air Target Eligibility for Enemy Ground Units

- Enemy ground units that are not rocket-capable anti-air (e.g., `tank`, `tank_v1`, `tank-v2`, `tank-v3`, `howitzer`) must not retain, reacquire, or path toward airborne `apache`/`f22Raptor` targets.
- Rocket-capable anti-air units (`rocketTank`) and air units (`apache`, `f22Raptor`) may still target airborne `apache`/`f22Raptor` targets.
- If a target transitions from grounded to airborne and becomes invalid for the attacker, the attacker must clear the target assignment on the next AI update tick.

