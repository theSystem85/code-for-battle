# Feature Specification: Advanced Unit Control

**Feature Branch**: `004-advanced-unit-control`  
**Created**: 2025-11-05  
**Status**: Implemented (Retrospective Documentation)  
**Input**: User description: "Remote control, guard mode, path planning, and attack group features for enhanced tactical unit management"

**Note**: This is a retrospective specification documenting an already-implemented feature for the Code for Battle RTS game.

## User Scenarios & Testing

### User Story 1 - Remote Control Feature (Priority: P2)

As a player, I want to directly control selected tanks using arrow keys and space bar, so that I can manually navigate tight situations, dodge incoming fire, and have precise control during critical moments.

**Why this priority**: Provides advanced tactical control for skilled players but not essential for basic gameplay. Enhances player agency and enables micro-management strategies.

**Independent Test**: Select a tank, use arrow keys to move forward/backward and turn left/right, press space to fire at maximum range.

**Acceptance Scenarios**:

1. **Given** one or more tanks are selected, **When** arrow up key is held, **Then** selected tanks move forward in their current facing direction
2. **Given** one or more tanks are selected, **When** arrow down key is held, **Then** selected tanks move backward in their current facing direction
3. **Given** one or more tanks are selected, **When** arrow left key is held, **Then** selected tanks rotate wagon left (counter-clockwise)
4. **Given** one or more tanks are selected, **When** arrow right key is held, **Then** selected tanks rotate wagon right (clockwise)
5. **Given** one or more tanks are selected, **When** space key is pressed, **Then** tanks fire at the farthest point within firing range in their current facing direction
6. **Given** remote control is active, **When** tanks move or turn, **Then** turrets continue tracking targets independently of wagon rotation
7. **Given** remote control keys are released, **When** player gives normal move/attack commands, **Then** units seamlessly transition back to standard control mode

**Automated Tests**

- Unit tests cover remote control action aggregation, clamping, snapshot application, and remote broadcast gating in `src/input/remoteControlState.js` to keep keyboard/remote inputs deterministic.

---

### User Story 2 - Guard Mode Feature (Priority: P2)

As a player, I want to assign combat units to guard other units, so that they automatically protect valuable units (like harvesters or key tanks) without requiring constant micro-management.

**Why this priority**: Provides automated defensive tactics, reduces micro-management burden, and enables strategic unit protection especially for resource gathering.

**Independent Test**: Select a combat unit, hold Cmd/Ctrl, click on friendly harvester, verify the combat unit follows and defends the harvester.

**Acceptance Scenarios**:

1. **Given** a combat unit is selected and Cmd/Ctrl key is held, **When** cursor hovers over friendly unit, **Then** cursor changes to guard cursor (guard.svg)
2. **Given** guard cursor is active, **When** player clicks on friendly unit, **Then** selected unit enters guard mode for that target
3. **Given** unit is in guard mode, **When** guarded unit moves, **Then** guarding unit follows at appropriate distance
4. **Given** unit is in guard mode, **When** enemy enters attack range, **Then** guarding unit attacks enemy automatically
5. **Given** unit is in guard mode attacking, **When** enemy moves away, **Then** guarding unit does not chase beyond guard range and returns to following guarded unit
6. **Given** unit is in guard mode, **When** given any other command (move, attack, new guard target), **Then** guard mode is cancelled and unit follows new orders
7. **Given** guarded unit is destroyed, **When** guard target becomes invalid, **Then** guarding unit reverts to idle state

---

### User Story 3 - Path Planning Feature (Priority: P2)

As a player, I want to queue multiple commands for my units using shift-click, so that I can set up complex patrol routes, attack sequences, or tactical maneuvers in advance.

**Why this priority**: Enables advanced tactical planning and reduces need for constant attention to individual units, though basic command-response gameplay works without it.

**Independent Test**: Select units, hold shift, click multiple locations and enemies in sequence, verify units execute commands in order.

**Acceptance Scenarios**:

1. **Given** units are selected and shift key is held, **When** player clicks on map location, **Then** move command is added to unit command queue without clearing previous commands
2. **Given** units have queued commands and shift is held, **When** player clicks on enemy, **Then** attack command is added to queue after current commands
3. **Given** units have queued move commands, **When** player shift-clicks to retreat location, **Then** retreat command is added to queue
4. **Given** units have queued commands, **When** executing queue, **Then** commands execute in order: first queued → last queued
5. **Given** units are executing queued commands, **When** player issues non-shift command, **Then** command queue is cleared and new command executes immediately
6. **Given** shift key is held, **When** dragging box around multiple enemies (AGF), **Then** attack group command is added to queue
7. **Given** units are selected with shift held, **When** clicking friendly units, **Then** friendly units are added to selection (does not queue command)

---

### User Story 4 - Attack Group Feature (Priority: P1)

As a player, I want to select multiple enemy units at once for my combat units to attack sequentially, so that I can efficiently eliminate groups of enemies without manually targeting each one.

**Why this priority**: Core tactical feature that significantly improves combat efficiency and reduces tedious micro-management during battles.

**Independent Test**: Select friendly combat units, click and drag red box around enemy group, verify selected units attack all marked enemies one by one.

**Acceptance Scenarios**:

1. **Given** friendly combat units are selected, **When** player clicks and holds left mouse button, **Then** red selection box begins drawing from click point
2. **Given** red selection box is being drawn, **When** box encompasses enemy units, **Then** enemy units within box are highlighted as targets
3. **Given** red box selection is released, **When** box contained enemy units, **Then** all enemies in box are marked with red triangular indicators above health bars
4. **Given** units have marked attack targets, **When** engaging enemies, **Then** units attack marked enemies one by one in order they were marked
5. **Given** marked enemy is destroyed, **When** target eliminated, **Then** red triangle disappears and attacking units move to next marked target
6. **Given** units are in AGF mode, **When** player gives any new command (move, attack, guard), **Then** AGF mode cancels and new command executes
7. **Given** units are attacking marked targets, **When** units are reselected, **Then** red attack indicators remain visible showing attack queue status
8. **Given** marked target moves, **When** during combat, **Then** red triangle indicator follows target unit position
9. **Given** AGF is combined with shift (PPF), **When** box selecting enemies with shift held, **Then** attack group command is queued after current commands

### Edge Cases

- What happens when remote control keys conflict with other shortcuts? (Remote control only active when combat units selected and no input fields have focus)
- Can harvesters use remote control? (Yes, remote control works for any selected unit capable of movement and rotation)
- What happens if guarded unit enters AGF mode? (Guarding unit maintains guard behavior, does not join AGF unless explicitly commanded)
- Can units guard multiple targets? (No, assigning new guard target replaces previous one)
- What if path planning queue becomes very long (50+ commands)? (No hard limit, but performance may degrade - practical limit around 20 commands)
- What happens when AGF targets are all out of range? (Units path to closest target, engage when in range, then move to next)
- Can remote control and guard mode be active simultaneously? (No, remote control input overrides guard mode temporarily)
- What if marked AGF targets are destroyed by other units? (Marked targets are automatically removed from queue when destroyed by any source)
- Can units in PPF queue mix move and attack commands? (Yes, any command type can be queued: move, attack, retreat, AGF)
- What happens to queued commands when unit is damaged and flees? (Retreat behavior overrides queue; queue is cleared when unit enters flee mode)
- What happens when multiple Apache helicopters are commanded to land on one helipad? (They distribute to nearby available helipads, ensuring each heli is assigned a distinct pad when possible and skipping only when no free pad exists.)

## Requirements

### Functional Requirements

**Remote Control Feature (RCF):**
- **FR-001**: System MUST allow forward movement when arrow up key is held with combat units selected
- **FR-002**: System MUST allow backward movement when arrow down key is held with combat units selected
- **FR-003**: System MUST rotate wagon left (counter-clockwise) when arrow left key is held with combat units selected
- **FR-004**: System MUST rotate wagon right (clockwise) when arrow right key is held with combat units selected
- **FR-005**: System MUST fire at maximum range in facing direction when space key is pressed with combat units selected
- **FR-006**: System MUST disable remote control when input fields have focus (prevent interference with typing)
- **FR-007**: System MUST allow turret to track targets independently during remote control wagon movement
- **FR-008**: System MUST seamlessly transition from remote control to standard control when normal commands issued

**Guard Mode Feature (GMF):**
- **FR-009**: System MUST display guard cursor (guard.svg) when Cmd/Ctrl held and hovering over friendly unit with combat unit selected
- **FR-010**: System MUST assign guard target when Cmd/Ctrl + click on friendly unit
- **FR-011**: System MUST make guarding unit follow guarded unit at appropriate distance
- **FR-012**: System MUST make guarding unit attack enemies that enter range automatically
- **FR-013**: System MUST prevent guarding unit from chasing enemies beyond guard range
- **FR-014**: System MUST return guarding unit to following guarded unit after enemy moves out of range
- **FR-015**: System MUST cancel guard mode when any new command is issued to guarding unit
- **FR-016**: System MUST cancel guard mode when guarded unit is destroyed
- **FR-017**: System MUST support guard mode for all combat unit types

**Path Planning Feature (PPF):**
- **FR-018**: System MUST add commands to queue when shift key is held during command input
- **FR-019**: System MUST support queuing move commands (shift + click empty tile)
- **FR-020**: System MUST support queuing attack commands (shift + click enemy)
- **FR-021**: System MUST support queuing retreat commands (shift + click retreat location)
- **FR-022**: System MUST support queuing AGF commands (shift + drag red box around enemies)
- **FR-023**: System MUST execute queued commands in order: first queued → last queued
- **FR-024**: System MUST clear command queue when non-shift command is issued
- **FR-025**: System MUST not interfere with expand selection feature (shift + click friendly units adds to selection)
- **FR-026**: System MUST persist command queue when units are reselected
- **FR-027**: System MUST clear command queue when unit enters flee/retreat mode

**Attack Group Feature (AGF):**
- **FR-028**: System MUST display red selection box when dragging with friendly combat units selected
- **FR-029**: System MUST mark all enemy units within red box with red triangular indicators
- **FR-030**: System MUST position red triangles above enemy health bars
- **FR-031**: System MUST make triangles bounce slightly for visibility
- **FR-032**: System MUST make attacking units engage marked targets sequentially
- **FR-033**: System MUST remove red triangle when marked target is destroyed
- **FR-034**: System MUST make red triangle follow target as it moves
- **FR-035**: System MUST cancel AGF mode when any new command is issued
- **FR-036**: System MUST persist red indicators when attacking units are reselected
- **FR-037**: System MUST work with path planning (shift + red box queues AGF command)
- **FR-038**: System MUST support AGF for all combat unit types

**Integration:**
- **FR-039**: System MUST disable remote control when guard mode is manually active
- **FR-054**: Mobile layouts MUST provide a control group UI that allows tapping group numbers to select groups and long-press (or assign mode toggle) to assign selected units to groups 1-9.

## Implementation Notes (2026-01-30)
- `src/input/unitCommands.js` is now a thin delegator bundling domain modules (`movementCommands.js`, `attackCommands.js`, `supportCommands.js`, `airCommands.js`, `utilityHelpers.js`, `utilityQueue.js`) under 1k LOC each to keep advanced control logic maintainable without changing behavior or tests.
- **FR-040**: System MUST allow guard mode to coexist with AGF (guards don't join AGF)
- **FR-041**: System MUST allow PPF to queue any combination of move/attack/retreat/AGF commands
- **FR-042**: System MUST maintain feature independence (each can be used without others)
- **FR-047**: System MUST show the out-of-range attack cursor only when a combat unit is selected and the hovered enemy is beyond direct firing range.
- **FR-048**: When out-of-range cursor is shown, the cursor overlay MUST display the current distance to target (above center) and selected unit max range (below center).
- **FR-049**: The out-of-range cursor overlay text MUST render in red and update immediately on mouse move when entering or exiting direct firing range.
- **FR-050**: Cursor MUST switch between attack and out-of-range states based on the closest selected combat unit's distance to the hovered enemy.
- **FR-051**: Hover range checks MUST consider each selected combat unit and mark out-of-range only when none are within firing range.
- **FR-052**: System MUST display numbered PPF-style waypoint markers for the active movement path and allow toggling that visualization on/off via the W key
- **FR-053**: When multiple Apache helicopters are ordered to land on a helipad, the system MUST assign each helicopter to a distinct available helipad (prioritizing those nearest the clicked helipad) so no two helis are assigned to the same pad during a group landing command.
- **FR-054**: System MUST allow Apache helicopters to receive helipad landing commands while they remain selected (standard command input should not require deselection).
- **FR-055**: On touch layouts, Apache helipad landing commands MUST not be blocked by idle remote-control input, and initiating remote control while grounded MUST trigger an automatic takeoff before movement.
- **FR-056**: While an Apache is selected, idle remote-control updates MUST NOT override an active helipad landing sequence (no forced hover state during commanded landing).
- **FR-057**: When an Apache auto-returns to a helipad due to ammo depletion, it MUST remain in auto-return state until full reload is complete and MUST auto-takeoff to resume attacking its stored target when that target is still alive.
- **FR-058**: Apache helipad-approach movement MUST rotate into heading first and then move forward toward the assigned pad, avoiding backward drift during return.
- **FR-059**: Apache landing resolution MUST reject occupied helipads at touchdown time (not only at command assignment time) to prevent multiple helicopters from claiming one pad.
- **FR-060**: If an Apache is auto-returning for resupply and its assigned helipad becomes unavailable before touchdown, the system MUST clear that stale assignment and reroute the Apache to another currently free helipad.
- **FR-061**: Cheat ammo commands applied to selected Apache helicopters MUST update Apache combat ammo (`rocketAmmo`) as the primary source of truth, even when compatibility fields (e.g. `maxAmmunition`) exist on the same unit object.
- **FR-062**: Apache combat/autoreturn logic MUST ignore stale remote-control state after a short inactivity timeout so old `remoteControlActive` flags cannot block ammo-empty auto-return to helipad.
- **FR-063**: Automated E2E coverage MUST verify the Apache ammo-empty lifecycle end-to-end (auto-return intent, refill, relaunch, and target-resume) including stale remote-control-state regression protection, using durable state checks that do not rely on a single-frame grounded transition.
- **FR-064**: When a move command target is unreachable by pathfinding, the system MUST abort that unit's move command instead of leaving it pending.
- **FR-065**: When one or more human-controlled selected units receive an unreachable move command, the system MUST show a user notification indicating the move was aborted.
- **FR-066**: For direct player-issued move commands, pathfinding MUST treat the clicked destination as strict and MUST NOT auto-retarget to a nearby passable tile when the destination tile itself is blocked.
- **FR-067**: In strict destination mode, partial/fallback paths that do not terminate on the clicked destination tile MUST be rejected (including when the destination is enclosed by occupied neighboring tiles).
- **FR-068**: Strict-destination movement MUST still allow any reachable long-distance destination, and pathfinding for those commands MUST not be cut short by pathfinding-limit fallback that would produce false unreachable results or truncated route visualization.
- **FR-069**: Defense buildings selected by the player (turretGun variants, rocket turret, artillery turret, tesla coil) MUST show attack/out-of-range attack cursor states while hovering enemy targets, matching unit attack cursor behavior.
- **FR-070**: AGF forced-target queues for defense buildings MUST preserve queued FIFO behavior and allow artillery/rocket turrets to fire at queued targets even when direct line-of-sight is blocked by buildings.
- **FR-071**: When AGF assigns multiple queued attack targets, the renderer MUST draw a red ordered chain line from the selected attacker to each queued target in sequence.
- **FR-072**: With defensive buildings selected, a normal click on an enemy target (without force-attack modifier) MUST assign forced attack targeting, and newly added targets MUST be inserted at the front of the forced-attack queue (newest-first).
- **FR-073**: For defensive-building forced targeting, a newly added target MUST become the immediate active target (queue position 1), and the prior active target MUST be moved to the front of the remaining queue.
- **FR-074**: When one or more units are selected and the move cursor is active, the UI MUST display the straight-line air distance from the closest selected unit to the hovered target point below the cursor in meters.


**Logistics Symmetry:**
- **FR-043**: System MUST allow selecting eligible units and clicking a friendly supply provider (ambulance, tanker truck, recovery tank, ammunition truck) to queue service from that provider while keeping the requesting units in place; the provider must travel to them.
- **FR-044**: System MUST allow dragging a selection box with any supply provider selected to enqueue every serviceable friendly unit in that box for the appropriate service type.
- **FR-045**: Cursor MUST switch to the move-into indicator when hovering a supply provider capable of serving the currently selected units.
- **FR-046**: Supply provider queues MUST add new service requests in LIFO order when already serving other targets.

### Key Entities

- **Remote Control State**: Real-time keyboard input processing for direct unit manipulation (arrow keys + space)
- **Mobile Control Group Panel**: Touch-friendly UI for assigning and selecting control groups without a hardware keyboard.
  
- **Guard Assignment**: Relationship between guarding unit and guarded target with following and defensive behavior
  
- **Command Queue**: Ordered list of pending commands for each unit, executed sequentially when shift-queued
  
- **Attack Group Markers**: Visual indicators (red triangles) tracking multiple marked enemy targets for sequential elimination
  
- **Guard Cursor**: Visual indicator (guard.svg) showing guard mode availability when Cmd/Ctrl held

- **Red Selection Box**: Visual indicator for AGF target selection, rendered during drag operation

## Success Criteria

### Measurable Outcomes

**Remote Control Feature:**
- **SC-001**: Player can navigate tank forward, backward, and rotate using arrow keys with immediate response (< 50ms input lag)
- **SC-002**: Player can fire at maximum range in facing direction using space key
- **SC-003**: Remote control works for all unit types capable of movement
- **SC-004**: Turrets continue tracking enemies independently during remote control wagon movement
- **SC-005**: Remote control disabled when typing in input fields (no interference)

**Guard Mode Feature:**
- **SC-006**: Guard cursor (guard.svg) appears immediately when Cmd/Ctrl held over friendly unit with combat unit selected
- **SC-007**: Guarding unit follows guarded target maintaining visual proximity (within 3-5 tiles)
- **SC-008**: Guarding unit automatically engages enemies within range without player input
- **SC-009**: Guarding unit returns to following after enemy moves out of range (does not chase)
- **SC-010**: Guard mode cancels when any new command issued or target destroyed
- **SC-011**: Multiple units can guard the same target simultaneously

**Path Planning Feature:**
- **SC-012**: Player can queue up to 20 commands without performance degradation
- **SC-013**: Queued commands execute in exact order they were assigned
- **SC-014**: Visual indicators (green triangles) show queued movement destinations when unit selected
- **SC-015**: Shift + click on friendly units adds to selection (does not queue command)
- **SC-016**: Command queue clears immediately when non-shift command issued
- **SC-017**: PPF works seamlessly with move, attack, retreat, and AGF commands

**Attack Group Feature:**
- **SC-018**: Red selection box renders in real-time during drag operation
- **SC-019**: All enemies within box are marked with red triangular indicators above health bars
- **SC-020**: Red triangles bounce slightly for visibility (animation at ~0.5 Hz)
- **SC-021**: Attacking units eliminate marked targets one by one without further player input
- **SC-022**: Red indicators remain visible when attacking units reselected (persistent status)
- **SC-023**: Red triangles follow moving targets accurately (updated every frame)
- **SC-024**: AGF works with shift-queuing (PPF integration)

**Performance & Integration:**
- **SC-025**: All four features maintain 60fps with 100+ units active
- **SC-026**: Remote control input latency < 50ms for responsive feel
- **SC-027**: Guard mode pathfinding updates at reasonable interval (every 2-3 seconds) without performance impact
- **SC-028**: Command queue supports mixed command types without conflicts
- **SC-029**: Features work independently and in combination without breaking each other

**Usability:**
- **SC-030**: Players can combine features tactically (e.g., guard + PPF, AGF + PPF)
- **SC-031**: Visual feedback for each feature is clear and unambiguous
- **SC-032**: Features enhance gameplay without requiring mastery (optional advanced tactics)
- **SC-033**: Keyboard shortcuts don't conflict with existing game controls
- **SC-034**: Features work identically for all combat unit types (tanks, rocket tanks, etc.)
- **SC-035**: Selected player units show numbered movement waypoints, and the W key toggles that waypoint visualization on/off

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

- **FR-075**: When only supply units (ambulance, tanker truck, ammunition truck, recovery tank) are selected, friendly airstrip tiles MUST be treated as valid move-command targets for cursor feedback and click handling (move cursor + green movement indicator, no move-blocked state).
