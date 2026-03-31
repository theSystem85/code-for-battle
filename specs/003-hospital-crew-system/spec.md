# Feature Specification: Hospital & Crew System

**Feature Branch**: `003-hospital-crew-system`  
**Created**: 2025-11-05  
**Status**: Implemented (Retrospective Documentation)  
**Input**: User description: "Hospital building with 4-person tank crew system (driver, gunner, loader, commander), crew casualties, crew restoration, and ambulance unit for field recovery"

**Note**: This is a retrospective specification documenting an already-implemented feature for the Code for Battle RTS game.

## User Scenarios & Testing

### Automated Tests

- Unit tests cover hospital crew healing progression, role order updates, money deductions, and ambulance medic refills/refill timer resets within the hospital service radius.
- The hospital service radius is also the parity target for other base support buildings such as gas stations and ammunition factories.

### User Story 1 - Tank Crew System (Priority: P1)

As a player, I want my tanks to have individual crew members that can be killed when taking hits, so that combat has more strategic depth with unit capability degradation rather than just health loss.

**Why this priority**: Core mechanic that transforms damage from simple health depletion into tactical capability loss, requiring strategic decisions about crew restoration vs unit replacement. This is the foundation upon which the hospital and ambulance systems are built.

**Independent Test**: Build a tank, have it take damage from enemies, verify crew members can be individually killed (15% chance per hit) and tank capabilities degrade accordingly.

**Acceptance Scenarios**:

1. **Given** a freshly built tank, **When** viewed, **Then** the tank displays 4 colored crew indicators: driver (blue, top-left), gunner (red, top-right), loader (yellow, bottom-left), commander (green, bottom-right)
2. **Given** a tank takes damage, **When** each hit is processed, **Then** there is a 15% probability each crew member is killed independently
3. **Given** the driver is killed, **When** player issues movement commands, **Then** the tank cannot move its wagon but can still rotate turret and fire at targets within range
4. **Given** the gunner is killed, **When** engaging enemies, **Then** the tank cannot rotate turret independently but can fire by rotating entire wagon to aim
5. **Given** the loader is killed, **When** attempting to fire, **Then** the tank cannot fire any weapons at all
6. **Given** the commander is killed, **When** player gives orders, **Then** the tank becomes unresponsive to player commands but autonomously defends itself and retreats to base if needed
7. **Given** a crew member is killed, **When** the death event occurs, **Then** appropriate sound plays (driverIsOut.mp3, gunnerIsOut.mp3, loaderIsOut.mp3, commanderIsOut.mp3)

---

### User Story 2 - Hospital Building (Priority: P1)

As a player, I want to build a hospital where my damaged tanks can restore killed crew members, so that I can repair veteran units without replacing them entirely and continue using experienced units.

**Why this priority**: Essential infrastructure for crew system - without it, crew casualties would be permanent and the system would be purely punishing rather than strategic. This unlocks the ambulance unit and provides base-level crew restoration.

**Independent Test**: Build a hospital (4000 credits), move a tank with missing crew to the 3 tiles below it, verify crew restoration occurs over time at 100 credits per person.

**Acceptance Scenarios**:

1. **Given** sufficient resources (4000 credits and 50MW available power), **When** player builds a hospital, **Then** a building is placed with 200 health and -50MW power consumption
2. **Given** a tank with missing crew members, **When** positioned on any of the 3 tiles directly below the hospital, **Then** crew restoration begins automatically
3. **Given** crew restoration is active, **When** 10 seconds elapse per crew member, **Then** one crew member is restored and 100 credits are deducted
4. **Given** multiple crew members need restoration, **When** at hospital, **Then** crew members are restored one at a time in specific order: driver → commander → loader → gunner
5. **Given** player has insufficient funds, **When** crew restoration is in progress, **Then** restoration pauses until sufficient funds become available
6. **Given** hospital is built, **When** checking vehicle factory build menu, **Then** ambulance unit becomes available for construction
7. **Given** hospital is destroyed, **When** checking build menu, **Then** ambulance build option becomes disabled/unavailable

---

### User Story 3 - Ambulance Unit (Priority: P2)

As a player, I want to build ambulance units that can restore crew members in the field without requiring tanks to return to base, so that I can maintain combat effectiveness during extended operations and reduce downtime.

**Why this priority**: Provides tactical flexibility and field support, though not essential for basic crew system functionality. Enhances strategic depth by allowing forward medical support.

**Independent Test**: Build a hospital (unlocks ambulance), build an ambulance (500 credits), command it to restore crew on a damaged tank, verify crew restoration occurs in 2 seconds per person.

**Acceptance Scenarios**:

1. **Given** a hospital exists, **When** viewing vehicle factory build menu, **Then** ambulance unit becomes available for 500 credits with 25 health
2. **Given** an ambulance is built, **When** deployed, **Then** unit starts with 10 people on board (100% loading bar) and operates at the reduced mobility setting (base speed 0.175 with a 4.0x street multiplier, reflecting a 65% slowdown from the prior configuration)
3. **Given** an ambulance is selected, **When** hovering over friendly unit with missing crew, **Then** cursor changes to "moveInto" cursor indicating restoration is possible
4. **Given** ambulance is commanded to restore unit, **When** within 1 tile range, **Then** restoration begins taking 2 seconds per crew member
5. **Given** restoration is in progress, **When** crew transfers, **Then** ambulance loading bar decreases proportionally and unit crew indicators appear
6. **Given** ambulance runs out of crew (0% loading bar), **When** empty, **Then** ambulance must return to hospital to reload, similar to harvester refinery mechanics
7. **Given** crew restoration completes, **When** finished, **Then** appropriate sound effects play and both units can resume normal operations

---

### User Story 4 - AI & Crew Management (Priority: P1)

As a player, I want enemy AI units to have the same crew system and for AI to manage crew casualties intelligently, so that the game remains balanced and challenging.

**Why this priority**: Critical for game balance - AI must have same capabilities and limitations to provide appropriate challenge and fair gameplay.

**Independent Test**: Let AI units take damage and lose crew, verify AI units behave identically to player units and AI manages crew restoration appropriately.

**Acceptance Scenarios**:

1. **Given** an AI unit is built, **When** deployed, **Then** it has 4 crew members with same capabilities as player units
2. **Given** an AI unit takes damage, **When** crew member dies, **Then** AI unit suffers identical capability loss as player units
3. **Given** AI has hospital and ambulances, **When** units have missing crew, **Then** AI sends damaged units to hospital or ambulances for restoration
4. **Given** AI unit with dead commander, **When** operating, **Then** AI unit operates autonomously for self-defense and retreat (not player-controllable behavior)
5. **Given** AI manages multiple damaged units, **When** prioritizing restoration, **Then** AI sends units back to hospital before continuing battle (strategic crew management)

### Edge Cases

- What happens when a tank with dead commander is given orders? (Cannot be controlled by player, operates autonomously for self-defense and retreat only)
- How does AI handle crew casualties? (AI units have same crew system and AI manages restoration by sending units to hospital/ambulances)
- What happens if hospital is destroyed while restoring crew? (Restoration stops immediately, crew member in progress remains missing, must find alternative restoration)
- Can ambulances restore their own crew? (No, ambulances don't have crew system - they only carry cargo capacity of 10 people)
- What happens to crew status when unit is sold? (Units with missing crew cannot be sold - only fully operational or fully repaired units can be sold)
- What if player has insufficient funds during restoration? (Restoration pauses until funds become available, progress is not lost)
- What happens when tank with missing crew levels up? (Level and experience are preserved independently of crew status)
- What if multiple tanks need restoration simultaneously at hospital? (They queue up, one processes at a time on the 3 restoration tiles)
- Can ambulance restore crew while moving? (No, ambulance must be within 1 tile range and stationary for restoration to begin)
- What happens when ambulance is destroyed with crew on board? (Crew cargo is lost, no experience or resources recovered)

## Requirements

### Functional Requirements

**Crew System:**
- **FR-001**: System MUST give every tank 4 crew members: driver (blue, top-left), gunner (red, top-right), loader (yellow, bottom-left), commander (green, bottom-right)
- **FR-002**: System MUST display crew members as colored mannequin indicators in HUD corners
- **FR-003**: System MUST calculate 15% probability per crew member per hit that crew member is killed
- **FR-004**: System MUST disable wagon movement when driver is killed while preserving turret rotation and firing capabilities
- **FR-005**: System MUST disable independent turret rotation when gunner is killed, allowing firing only by rotating wagon
- **FR-006**: System MUST disable all weapon firing when loader is killed
- **FR-007**: System MUST disable player control when commander is killed, enabling only autonomous defense and retreat behavior
- **FR-008**: System MUST play appropriate death sound for each crew member type (driverIsOut.mp3, gunnerIsOut.mp3, loaderIsOut.mp3, commanderIsOut.mp3)
- **FR-009**: System MUST apply crew system equally to all tank types (tank_v1, tank_v2, tank_v3)

**Hospital Building:**
- **FR-010**: System MUST allow building hospital for 4000 credits with 200 health and -50MW power consumption
- **FR-011**: System MUST make hospital standard building size (dimensions determined by asset image)
- **FR-012**: System MUST designate 3 tiles directly below hospital as crew restoration zones
- **FR-013**: System MUST restore crew members when tank is positioned on any restoration zone tile
- **FR-014**: System MUST restore crew at rate of 1 person per 10 seconds at cost of 100 credits per person
- **FR-015**: System MUST restore crew in fixed order: driver → commander → loader → gunner
- **FR-016**: System MUST pause restoration when player has insufficient funds (< 100 credits)
- **FR-017**: System MUST unlock ambulance unit in vehicle factory build menu when hospital is built
- **FR-018**: System MUST disable ambulance build option when no hospitals exist for player
- **FR-019**: System MUST prevent multiple simultaneous restorations per restoration tile (one tank per tile at a time)

**Ambulance Unit:**
- **FR-020**: System MUST allow building ambulance for 500 credits with 25 health when hospital exists
- **FR-021**: System MUST make ambulance move 3x faster than tank on streets, 1.5x faster on grass
- **FR-022**: System MUST give ambulance capacity of 10 crew members (100% loading bar when full)
- **FR-023**: System MUST show "moveInto" cursor when selected ambulance hovers over friendly unit with missing crew
- **FR-024**: System MUST restore crew at 2 seconds per person when ambulance is within 1 tile range
- **FR-025**: System MUST decrease ambulance loading bar proportionally during crew transfer (10% per person)
- **FR-026**: System MUST add crew mannequin indicators to target unit as restoration progresses
- **FR-027**: System MUST allow ambulance to reload at hospital when empty (0% loading bar)
- **FR-028**: System MUST apply same hospital reload mechanics to ambulance as used for harvester at refinery
- **FR-029**: System MUST prevent ambulance from restoring crew when cargo is empty

**AI Integration:**
- **FR-030**: System MUST apply crew system to AI units identically to player units
- **FR-031**: System MUST enable AI to build hospitals when needed for crew management
- **FR-032**: System MUST enable AI to build and manage ambulances when hospital exists
- **FR-033**: System MUST make AI send damaged units (missing crew) to hospital for restoration before continuing combat
- **FR-034**: System MUST make AI prioritize crew restoration for valuable/veteran units

**Save/Load:**
- **FR-035**: System MUST preserve crew status (alive/dead for each member) through save/load operations, including partially crewed units that must not be reset to full crew on load
- **FR-036**: System MUST maintain backward compatibility for saves without crew system (initialize with full crew)
- **FR-037**: System MUST preserve ambulance cargo count through save/load
- **FR-038**: System MUST preserve hospital restoration state through save/load

### Key Entities

- **Tank Crew**: 4-person team (driver, gunner, loader, commander) with individual survival states and capability impacts
  - **Driver**: Controls wagon movement; death disables movement but preserves turret function
  - **Gunner**: Controls turret rotation; death disables independent turret but allows wagon-based aiming
  - **Loader**: Enables weapon firing; death disables all weapons
  - **Commander**: Enables player control; death disables player commands, unit operates autonomously
  
- **Hospital Building**: Infrastructure building providing stationary crew restoration (10s per person, 10 credits), unlocks ambulance production

- **Ambulance Unit**: Mobile support vehicle carrying up to 10 crew members for field restoration (2s per person), requires hospital to unlock and reload

- **Crew Restoration Process**: Time-based medical treatment restoring dead crew members to tanks
  - **Hospital Method**: Stationary, slower (10s/person), requires positioning on restoration tiles
  - **Ambulance Method**: Mobile, faster (2s/person), requires within 1 tile range

- **Restoration Zones**: 3 tiles directly below hospital where tanks can receive crew restoration

## Success Criteria

### Measurable Outcomes

**Crew System:**
- **SC-001**: Players observe immediate crew casualties (15% per hit per crew member) with corresponding capability loss during combat
- **SC-002**: Tank without driver cannot move wagon but can still rotate turret and fire at enemies within range
- **SC-003**: Tank without gunner can fire by rotating entire wagon instead of turret (visible behavioral change)
- **SC-004**: Tank without loader cannot fire any weapons until crew member is restored
- **SC-005**: Tank without commander ignores player commands and operates autonomously (defensive/retreat behavior only)
- **SC-006**: Players can identify missing crew at a glance by empty mannequin indicators in HUD corners
- **SC-007**: Appropriate sound effects play for each crew death type (4 unique sounds)

**Hospital Building:**
- **SC-008**: Hospital restores one crew member every 10 seconds at 10 credits cost when tank is positioned correctly
- **SC-009**: Crew restoration follows fixed order (driver → commander → loader → gunner) predictably
- **SC-010**: Hospital unlocks ambulance build option immediately when constructed
- **SC-011**: Up to 3 tanks can restore crew simultaneously (one per restoration tile)

**Ambulance Unit:**
- **SC-012**: Ambulance restores one crew member every 2 seconds when within 1 tile range (5x faster than hospital)
- **SC-013**: Ambulance moves 3x faster than tank on streets (tactical mobility advantage for field support)
- **SC-014**: Ambulance loading bar accurately reflects cargo (10% per person, 100% = 10 people)
- **SC-015**: Players can quickly dispatch ambulances to frontline for crew restoration without units returning to base
- **SC-016**: Ambulance reloads at hospital similar to harvester at refinery (familiar mechanics)

**AI & Balance:**
- **SC-017**: AI units experience identical crew system mechanics (fair gameplay balance)
- **SC-018**: AI intelligently manages crew casualties by sending units to hospital before resuming combat
- **SC-019**: AI builds hospitals when multiple units have crew casualties
- **SC-020**: AI utilizes ambulances for field support when available

**Performance & Integration:**
- **SC-021**: System maintains 60fps performance with multiple simultaneous crew restorations
- **SC-022**: Crew system integrates seamlessly with existing unit leveling (levels preserved through crew loss)
- **SC-023**: Crew status persists correctly through save/load operations
- **SC-023a**: A unit saved with any missing crew members loads back with the same missing roles (no automatic full-crew reset)
- **SC-024**: Legacy saves without crew data load successfully with full crew initialized
- **SC-025**: Hospital and ambulance construction integrated into existing building/unit production systems
- **SC-026**: Power system correctly accounts for hospital power consumption (-50MW)

**Strategic Depth:**
- **SC-027**: Players make meaningful decisions between crew restoration vs unit replacement
- **SC-028**: Veteran units with high levels become worth preserving through crew restoration
- **SC-029**: Ambulance provides tactical advantage in extended operations away from base
- **SC-030**: Crew casualties create tactical variety beyond simple health depletion (unit degradation mechanics)

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
