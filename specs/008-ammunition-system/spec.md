# Feature Specification: Ammunition Factory & Supply Truck System

**Feature Branch**: `008-ammunition-system`  
**Created**: 2025-11-06  
**Status**: Draft  
**Input**: User description: "Ammunition factory and supply truck system with ammo management for combat units"

---

## Overview

This specification defines a comprehensive ammunition management system for the RTS game, introducing limited ammunition for all combat units, an Ammunition Factory building for resupply, and an Ammunition Supply Truck for mobile field resupply. The system mirrors the existing gas station/tanker truck mechanics but manages ammunition instead of fuel. When destroyed, the Ammunition Factory creates a spectacular explosion with ammunition particles that deal collateral damage.

**Image Assets**:
- **Ammunition Factory (Building)**:
  - Map: `/public/images/map/buildings/ammunition_factory_map.webp`
  - Sidebar: `/public/images/sidebar/ammunition_factory_sidebar.webp`
- **Ammunition Supply Truck (Unit)**:
  - Map: `/public/images/map/units/ammunition_truck_map.webp`
  - Sidebar: `/public/images/sidebar/ammunition_truck_sidebar.webp`

---

## User Scenarios & Testing

### User Story 1 - Ammunition Depletion and Resupply (Priority: P0)

**As a** player  
**I want** my combat units to have limited ammunition that depletes during combat  
**So that** I must manage ammunition resources strategically and maintain supply lines

**Why this priority**: Core gameplay mechanic that fundamentally changes combat strategy and base management. Without this, the entire ammunition system has no purpose.

**Independent Test**: Can be fully tested by building combat units, engaging enemies until ammunition depletes (units stop firing), then verifying units cannot fire without ammunition. Delivers core resource management value.

**Acceptance Scenarios**:

1. **Given** a tank with full ammunition (42 rounds), **When** the tank fires at enemies, **Then** the ammunition count decreases by 1 per shot and the orange ammunition bar decreases proportionally

2. **Given** a rocket tank with full ammunition (21 rockets), **When** the rocket tank fires a 3-rocket burst, **Then** the ammunition count decreases by 3 and the orange ammunition bar decreases proportionally

3. **Given** a combat unit with 0 ammunition, **When** the unit is commanded to attack an enemy, **Then** the unit moves into firing range but does not fire, and a "No Ammunition" notification appears

4. **Given** a tank with depleted ammunition at an Ammunition Factory (within the same service radius as a hospital), **When** the unit remains stationary within range for 7 seconds per reload cycle, **Then** the ammunition bar refills gradually until reaching 100%, and the unit can fire again

5. **Given** multiple combat units with varying ammunition levels, **When** units are selected, **Then** each unit displays its current ammunition level via the orange ammunition bar on the left side of the HUD

---

### User Story 2 - Ammunition Factory Construction (Priority: P0)

**As a** player  
**I want** to build Ammunition Factories to resupply combat units  
**So that** I can maintain sustained combat operations from my base

**Why this priority**: Essential infrastructure for the ammunition system. Without the factory, there's no way to resupply units, making the system non-functional.

**Independent Test**: Can be fully tested by building an Ammunition Factory, positioning units within the same service radius as a hospital, and verifying ammunition replenishment occurs. Delivers core resupply infrastructure value.

**Acceptance Scenarios**:

1. **Given** the player has a Construction Yard and sufficient resources ($2000, 40MW power available), **When** the player selects and places the Ammunition Factory building, **Then** the factory is constructed with dimensions 3x3 tiles (same as Vehicle Factory), consumes 40MW power, and has 250 health

2. **Given** an Ammunition Factory exists on the map, **When** friendly combat units move within the same service radius used by the hospital of the factory, **Then** the units automatically begin ammunition replenishment (indicated by orange loading bar)

3. **Given** an Ammunition Factory is actively resupplying a unit, **When** the unit remains in range for the full reload duration (7 seconds), **Then** the unit's ammunition is fully replenished at no cost and the unit returns to combat-ready status

4. **Given** multiple combat units are within range of an Ammunition Factory, **When** resupply occurs, **Then** units are resupplied one at a time in a queue system (first-in-first-out), with visible orange progress bars

5. **Given** an Ammunition Factory exists, **When** the factory is destroyed, **Then** the building explodes with initial blast radius (2 tiles), followed by ammunition particles scattering in random directions for 5 seconds, destroying units/buildings on impact

---

### User Story 3 - Ammunition Supply Truck Deployment (Priority: P1)

**As a** player  
**I want** to build mobile Ammunition Supply Trucks  
**So that** I can resupply units in the field without retreating to base

**Why this priority**: Critical for maintaining offensive operations and field combat effectiveness. Without mobile resupply, units must constantly return to base, significantly hampering tactical flexibility.

**Independent Test**: Can be fully tested by producing an Ammunition Supply Truck, commanding it to resupply field units, and verifying ammunition transfer occurs. Delivers tactical field operations value.

**Acceptance Scenarios**:

1. **Given** the player has a Vehicle Factory and an Ammunition Factory, **When** the player builds an Ammunition Supply Truck (cost: $800), **Then** the truck is produced with 30 health, moves at 2x tank speed, has fuel tank (800L), and carries ammunition supply (500 rounds capacity)

2. **Given** an Ammunition Supply Truck with loaded ammunition, **When** the truck is within 1 tile of a friendly combat unit with depleted ammunition, **Then** the truck automatically begins resupplying that unit (7 seconds per full reload)

3. **Given** an Ammunition Supply Truck is selected and the player hovers over a friendly unit, **When** the unit needs ammunition, **Then** the cursor changes to "moveInto" cursor, and clicking commands the truck to move to that unit for resupply

4. **Given** an Ammunition Supply Truck with ammunition supply, **When** multiple units need resupply within 1 tile, **Then** the truck resupplies units one at a time, displaying orange progress bars, until supply is depleted or all units are resupplied

5. **Given** an Ammunition Supply Truck operating in the field, **When** the truck's fuel depletes, **Then** the truck stops moving and requires refueling from a tanker truck or gas station before resuming operations

6. **Given** an Ammunition Supply Truck is destroyed, **When** the wreckage would normally be registered, **Then** the truck leaves no towable wreck, triggers an immediate 2-tile radius blast, and launches ten random ammunition rounds that can damage any nearby vehicles or buildings regardless of ownership.

7. **Given** an Ammunition Supply Truck with depleted ammunition supply, **When** the truck returns to an Ammunition Factory (within the same service radius as a hospital) and waits for 10 seconds, **Then** the truck's ammunition supply is fully replenished to 500 rounds capacity (indicated by top loading bar)

---

### User Story 4 - HUD Ammunition Display (Priority: P0)

**As a** player  
**I want** to see ammunition levels for all my combat units in the HUD  
**So that** I can make informed tactical decisions about engagement and resupply needs

**Why this priority**: Essential UI feedback for the ammunition system. Without visual indicators, players cannot manage ammunition strategically, undermining the entire feature.

**Independent Test**: Can be fully tested by selecting various combat units and verifying ammunition bars display correctly with accurate colors, positions, and percentages. Delivers critical gameplay feedback value.

**Acceptance Scenarios**:

1. **Given** any combat unit is selected, **When** viewing the unit HUD, **Then** an orange ammunition bar appears on the left side of the HUD (health bar on top, fuel bar on right, ammo bar on left)

2. **Given** a tank with 42/42 ammunition (full), **When** the unit HUD is displayed, **Then** the orange ammunition bar shows 100% filled

3. **Given** a rocket tank with 10/21 ammunition (approximately 48%), **When** the unit HUD is displayed, **Then** the orange ammunition bar shows approximately 48% filled

4. **Given** a combat unit with 0 ammunition, **When** the unit HUD is displayed, **Then** the orange ammunition bar is empty (0%) and may flash or pulse to indicate critical status

5. **Given** a unit is being resupplied at an Ammunition Factory or by a Supply Truck, **When** resupply is in progress, **Then** the orange ammunition bar gradually fills from current percentage to 100% over the 7-second duration

---

### User Story 5 - Helipad Ammunition Integration (Priority: P1)

**As a** player  
**I want** the Helipad to store and transfer ammunition to helicopters  
**So that** air units can be rearmed similar to how they refuel

**Why this priority**: Ensures consistency across all unit types and extends ammunition system to air units. Important for complete system coverage but air units can function with just fuel initially.

**Independent Test**: Can be fully tested by landing a helicopter at a helipad, resupplying ammunition via an Ammunition Supply Truck, then verifying the helicopter receives ammunition. Delivers air unit resupply value.

**Acceptance Scenarios**:

1. **Given** a Helipad building exists with no ammunition reserves, **When** an Ammunition Supply Truck resupplies the Helipad (within 1 tile range), **Then** the Helipad's ammunition reserve is filled to maximum capacity (1000 rounds), indicated by an orange bar in the building HUD

2. **Given** a helicopter (Apache) with depleted ammunition, **When** the helicopter lands at a Helipad with ammunition reserves, **Then** the helicopter's ammunition is gradually replenished over 10 seconds while grounded, draining the Helipad's reserves proportionally

3. **Given** a Helipad with insufficient ammunition reserves for a full reload, **When** a helicopter attempts to rearm, **Then** the helicopter receives partial ammunition (up to available reserves) and the Helipad reserves reach 0%

4. **Given** a Helipad requires ammunition resupply, **When** the player selects an Ammunition Supply Truck and hovers over the Helipad, **Then** the cursor changes to "moveInto" cursor, allowing the truck to be commanded to resupply the Helipad
5. **Given** a Helipad is occupied or reserved for another Apache, **When** the player hovers a selected Apache over that Helipad, **Then** the cursor shows a blocked state and additional Apaches cannot land there until it is free

---

### User Story 6 - Enemy AI Ammunition Management (Priority: P1)

**As a** player  
**I want** enemy AI to manage ammunition by building factories and supply trucks  
**So that** AI opponents face the same strategic constraints and the game remains balanced

**Why this priority**: Critical for game balance and challenge. Without AI ammunition management, human players face unfair disadvantage and AI becomes unrealistically powerful.

**Independent Test**: Can be fully tested by observing enemy AI behavior over a match: verify AI builds Ammunition Factories, produces Supply Trucks, resupplies units, and AI units stop firing when depleted. Delivers competitive balance value.

**Acceptance Scenarios**:

1. **Given** an enemy AI player with a Construction Yard and sufficient resources, **When** the AI establishes its base economy (power, barracks, vehicle factory), **Then** the AI builds at least one Ammunition Factory within the first 10 minutes of gameplay

---

## Automated Test Coverage Notes

- Unit command input should validate ammunition resupply and reload queueing for trucks, including queue metadata updates and pathing setup for resupply targets.

2. **Given** an enemy AI with an Ammunition Factory and Vehicle Factory, **When** the AI has active combat units in the field, **Then** the AI produces at least 1-2 Ammunition Supply Trucks to support field operations

3. **Given** enemy AI combat units with low ammunition (<20%), **When** the units are engaged in combat, **Then** the AI commands units to retreat toward the nearest Ammunition Factory or Supply Truck for resupply before re-engaging

4. **Given** enemy AI units with depleted ammunition, **When** the units are near an Ammunition Factory or Supply Truck, **Then** the units automatically resupply and the AI tactical behavior resumes normal combat operations after replenishment

5. **Given** enemy AI manages ammunition, **When** player destroys enemy Ammunition Factories, **Then** the AI prioritizes rebuilding ammunition infrastructure and becomes strategically weakened until resupply is restored

---

### User Story 7 - Ammunition Factory Destruction Effects (Priority: P2)

**As a** player  
**I want** destroying an Ammunition Factory to create a spectacular explosion with dangerous projectiles  
**So that** ammunition factories become high-value targets with dramatic destruction sequences

**Why this priority**: Adds tactical depth and visual spectacle. Makes ammunition infrastructure a strategic target but not essential for core functionality.

**Independent Test**: Can be fully tested by destroying an Ammunition Factory and verifying initial explosion radius, particle scatter pattern, collision damage, and visual effects. Delivers strategic targeting value.

**Acceptance Scenarios**:

1. **Given** an Ammunition Factory is reduced to 0 health, **When** the building is destroyed, **Then** an initial explosion occurs with blast radius of 2 tiles (smaller than gas station) dealing 100 damage to all units/buildings in range

2. **Given** an Ammunition Factory explosion is triggered, **When** the initial blast completes, **Then** 30-50 ammunition particles scatter randomly in all directions at varying velocities for 5 seconds

3. **Given** ammunition particles are flying from a destroyed factory, **When** a particle collides with a unit or building, **Then** the particle explodes on impact, dealing 30-50 damage and destroying the particle

4. **Given** an Ammunition Factory is destroyed, **When** the explosion and particle effects are rendered, **Then** visual effects include fire, smoke, flying debris particles (small orange/red projectiles), and impact explosions with sound effects

5. **Given** multiple units are near a destroyed Ammunition Factory, **When** ammunition particles scatter, **Then** up to 5-10 units/buildings may be destroyed or damaged by secondary particle impacts, creating chain reaction damage

---

### User Story 8 - Unit-Specific Ammunition Capacities (Priority: P0)

**As a** player  
**I want** different unit types to have appropriate ammunition capacities based on their role  
**So that** unit design reflects realistic combat capabilities and strategic trade-offs

**Why this priority**: Foundational balancing for the ammunition system. Without proper capacities, gameplay balance breaks and unit roles become meaningless.

**Independent Test**: Can be fully tested by building each unit type and verifying ammunition capacity matches specification. Delivers balanced unit design value.

**Acceptance Scenarios**:

1. **Given** a Tank V1 is produced, **When** the unit is created with full ammunition, **Then** the tank has 42 rounds capacity and fires 1 round per shot

2. **Given** a Tank V2 is produced, **When** the unit is created with full ammunition, **Then** the tank has 42 rounds capacity and fires 1 round per shot

3. **Given** a Tank V3 is produced, **When** the unit is created with full ammunition, **Then** the tank has 50 rounds capacity (20% more than V1/V2 due to burst fire mechanism) and fires 2 rounds per burst

4. **Given** a Rocket Tank is produced, **When** the unit is created with full ammunition, **Then** the rocket tank has 21 rockets capacity and fires 3 rockets per burst attack

5. **Given** a Howitzer is produced, **When** the unit is created with full ammunition, **Then** the howitzer has 30 rounds capacity (heavy artillery with limited ammunition)

6. **Given** an Apache helicopter is produced, **When** the unit is created with full ammunition, **Then** the Apache has 38 rounds capacity for its rapid-fire cannon

---

### Edge Cases

1. **Ammunition Factory destroyed while resupplying units**: If a factory explodes during active resupply, the resupply process is immediately cancelled, units retain partial ammunition received up to that point, and affected units may take damage from the explosion if within blast radius.

2. **Ammunition Supply Truck destroyed with full load**: When a loaded supply truck is destroyed, it explodes with a 1.5-tile blast radius (smaller than factory) and 10-15 ammunition particles scatter, each dealing 20 damage on impact. The truck's ammunition is lost.

3. **Unit runs out of ammunition during burst fire**: If a unit has insufficient ammunition to complete a burst (e.g., Rocket Tank with 1 rocket attempting 3-rocket burst), the unit fires only available rounds, then enters depleted state.

4. **Multiple units queued at Ammunition Factory**: When 5+ units queue for resupply, the factory resupplies units in order of arrival (FIFO). Units wait in queue and display "waiting" indicator. Maximum queue size is 10 units; additional units must wait for space.

5. **Ammunition Supply Truck with no ammunition supply**: If a supply truck's internal ammunition supply reaches 0 (after resupplying multiple units), the truck can still move but cannot resupply units until it returns to an Ammunition Factory to reload its own supply.

6. **Power outage affecting Ammunition Factory**: If the Ammunition Factory loses power (insufficient grid supply), resupply operations continue but at 50% speed (14 seconds instead of 7 seconds). Completely unpowered factories cannot resupply at all.

7. **Friendly fire from ammunition particles**: Ammunition particles from destroyed factories are indiscriminate and damage both friendly and enemy units/buildings within scatter range (5-tile radius from factory). Players must position factories away from critical infrastructure.

8. **Unit ordered to attack with 0 ammunition**: Unit pathfinds to attack position but upon reaching firing range, displays "No Ammunition" notification instead of firing. Unit then idles in position unless given new orders or ammunition becomes available.

9. **Ammunition Supply Truck runs out of fuel while resupplying**: If a supply truck depletes fuel during an active resupply operation, the resupply completes for the current unit, then the truck becomes immobilized and requires tanker truck refueling before resuming operations.

10. **Helipad with no ammunition when helicopter lands**: If a helicopter lands at a helipad with 0 ammunition reserves, the helicopter remains grounded but cannot rearm. Player must send an Ammunition Supply Truck to resupply the helipad first, then the helicopter can rearm.

11. **Save/Load with partial ammunition states**: When saving and loading games, all unit ammunition levels, Ammunition Supply Truck cargo levels, and Helipad reserves are preserved accurately. Resupply operations in progress are cancelled on load and must be reinitiated.

12. **Ammunition Factory built before Vehicle Factory**: If the player builds an Ammunition Factory before having a Vehicle Factory, the Ammunition Supply Truck build button remains locked/grayed out until both prerequisites (Vehicle Factory + Ammunition Factory) exist.

---

## Requirements

### Functional Requirements - Core Ammunition System

#### FR-001: Unit Ammunition Tracking
**Priority:** P0  
**Description:** All combat units maintain an ammunition counter that tracks current ammunition vs. maximum capacity. Ammunition decreases with each shot fired and cannot go below 0. Units with 0 ammunition cannot fire weapons.

#### FR-002: Ammunition Depletion on Fire
**Priority:** P0  
**Description:** When a combat unit fires its weapon, the ammunition counter decreases by the appropriate amount based on weapon type: 1 round for single-shot weapons (tanks), 2 rounds for burst weapons (Tank V3), 3 rounds for multi-projectile weapons (Rocket Tank).

#### FR-003: Ammunition Bar HUD Display
**Priority:** P0  
**Description:** Selected combat units display an orange ammunition bar on the left side of the selection HUD. The bar width is 1/3 of the HUD rectangle width. Bar fill percentage represents current ammunition / maximum ammunition ratio.

#### FR-004: Combat Disabled When Depleted
**Priority:** P0  
**Description:** Units with 0 ammunition cannot execute attack commands. When commanded to attack, unit moves to firing position but does not fire, and displays "No Ammunition" notification to player.

#### FR-005: Ammunition Persistence
**Priority:** P0  
**Description:** Unit ammunition levels persist through save/load cycles, unit selection/deselection, and map scrolling. Ammunition state is stored in unit object and serialized with game state.

---

### Functional Requirements - Ammunition Factory Building

#### FR-006: Ammunition Factory Construction
**Priority:** P0  
**Description:** Ammunition Factory can be constructed from the buildings menu when player has a Construction Yard. Building dimensions: 3x3 tiles (same as Vehicle Factory). Cost: $2000. Build time: 60 seconds. Health: 250. Armor: 2. Power consumption: 40MW.

#### FR-007: Ammunition Factory Build Protection Zone
**Priority:** P0  
**Description:** Ammunition Factory has a 3-tile wide protection zone at the bottom (same as Vehicle Factory) preventing unit/building placement directly below the structure.

#### FR-008: Ammunition Factory Resupply Zone
**Priority:** P0  
**Description:** Ammunition Factory provides ammunition resupply to friendly combat units within the same service radius used by the hospital (measured from factory edge to unit center). Resupply zone is automatically calculated and units within range are eligible for resupply.

#### FR-009: Ammunition Resupply Process
**Priority:** P0  
**Description:** When a combat unit with <100% ammunition remains stationary within the same service radius as a hospital of an Ammunition Factory for 7 seconds, the unit's ammunition is fully replenished at no cost. Orange loading bar displays resupply progress.

#### FR-010: Ammunition Factory Queue System
**Priority:** P1  
**Description:** Multiple units within range are resupplied one at a time in first-in-first-out order. Maximum queue size: 10 units. Queued units display "waiting" indicator. Factory processes one unit every 7 seconds until queue is empty.

#### FR-011: Power-Dependent Resupply Speed
**Priority:** P1  
**Description:** Ammunition Factory resupply speed depends on power availability. Full power: 7 seconds per unit. Partial power (>50%): 14 seconds per unit. No power (<50%): resupply disabled until power restored.

#### FR-012: Ammunition Factory Explosion (Initial Blast)
**Priority:** P2  
**Description:** When Ammunition Factory is destroyed (health reaches 0), an initial explosion occurs with 2-tile blast radius dealing 100 damage to all units/buildings within radius. Explosion visual includes fire, smoke, and screen shake effect.

#### FR-013: Ammunition Factory Explosion (Particle Scatter)
**Priority:** P2  
**Description:** After initial blast, 30-50 ammunition particles scatter randomly in all directions from factory center. Particles travel at varying velocities (0.5-2.0 tiles/second) for 5 seconds. Each particle is rendered as a small orange/red projectile sprite.

#### FR-014: Ammunition Particle Collision Damage
**Priority:** P2  
**Description:** When an ammunition particle collides with a unit or building, the particle explodes dealing 30-50 damage (random) to the target and the particle is destroyed. Collision detection uses standard projectile collision system.

#### FR-015: Ammunition Factory Image Assets
**Priority:** P0  
**Description:** Ammunition Factory uses image assets: `/public/images/map/buildings/ammunition_factory_map.webp` for map rendering and `/public/images/sidebar/ammunition_factory_sidebar.webp` for build button.

---

### Functional Requirements - Ammunition Supply Truck Unit

#### FR-016: Ammunition Supply Truck Production
**Priority:** P1  
**Description:** Ammunition Supply Truck can be produced from Vehicle Factory when both Vehicle Factory AND Ammunition Factory exist. Cost: $800. Build time: 40 seconds. Health: 30. Armor: 1. Speed: 2x Tank V1 speed (0.66). No turret (turretRotationSpeed: 0).

#### FR-017: Ammunition Supply Truck Fuel System
**Priority:** P1  
**Description:** Ammunition Supply Truck has fuel tank capacity of 800L with consumption rate of 200L/100km. Fuel depletes during movement. Blue fuel bar displays at bottom of HUD (same as other units). Cannot move when fuel reaches 0.

#### FR-018: Ammunition Supply Truck Cargo Capacity
**Priority:** P1  
**Description:** Ammunition Supply Truck carries ammunition cargo with capacity of 500 rounds. Cargo is represented by orange loading bar at top of unit HUD (same style as harvester ore bar). Cargo depletes when resupplying units.

#### FR-019: Ammunition Supply Truck Auto-Resupply
**Priority:** P1  
**Description:** When Ammunition Supply Truck with cargo >0 is within 1 tile of a friendly combat unit with <100% ammunition, truck automatically begins resupplying that unit. Resupply takes 7 seconds to fully replenish unit. Truck cargo decreases by amount transferred.

#### FR-020: Ammunition Supply Truck Manual Command
**Priority:** P1  
**Description:** When Ammunition Supply Truck is selected and player hovers over friendly unit needing ammunition, cursor changes to "moveInto" cursor. Left-clicking commands truck to pathfind to target unit and resupply. Command queuing supported via Shift+Click.

#### FR-021: Ammunition Supply Truck Reload at Factory
**Priority:** P1  
**Description:** When Ammunition Supply Truck with depleted cargo (<100%) parks within the same service radius as a hospital of Ammunition Factory for 10 seconds, truck's cargo is fully replenished to 500 rounds. Orange top bar displays reload progress.

#### FR-022: Ammunition Supply Truck Multi-Target Resupply
**Priority:** P1  
**Description:** Ammunition Supply Truck resupplies multiple units within 1-tile range one at a time until truck cargo is depleted or all units are fully supplied. Units are prioritized by lowest ammunition percentage first.

#### FR-023: Ammunition Supply Truck Destruction
**Priority:** P2  
**Description:** When Ammunition Supply Truck is destroyed, it leaves no towable wreck, triggers a 2-tile radius ammunition blast that damages all nearby units/buildings, and fires exactly ten random rounds (rockets, bullets, or artillery shells) in random directions that can damage any vehicles or buildings they strike regardless of ownership.

#### FR-024: Ammunition Supply Truck Image Assets
**Priority:** P1  
**Description:** Ammunition Supply Truck uses image assets: `/public/images/map/units/ammunition_truck_map.webp` for unit rendering and `/public/images/sidebar/ammunition_truck_sidebar.webp` for build button.

---

### Functional Requirements - Helipad Ammunition Integration

#### FR-025: Helipad Ammunition Reserve Storage
**Priority:** P1  
**Description:** Helipad building stores ammunition reserves with capacity of 1000 rounds. Reserve level is displayed via orange bar in Helipad building HUD (below health bar). Initial reserve is 0 when Helipad is built.

#### FR-026: Helipad Resupply by Ammunition Supply Truck
**Priority:** P1  
**Description:** Ammunition Supply Truck can resupply Helipad ammunition reserves by parking within 1 tile for 10 seconds. Truck transfers ammunition cargo to Helipad reserves up to maximum capacity (1000 rounds). Transfer is automatic when in range.

#### FR-027: Helicopter Ammunition Replenishment
**Priority:** P1  
**Description:** When helicopter (Apache) lands at Helipad with <100% ammunition, helicopter automatically draws ammunition from Helipad reserves. Transfer takes 10 seconds for full reload. Helipad reserves decrease by amount transferred to helicopter.

#### FR-028: Helipad Insufficient Reserves Handling
**Priority:** P1  
**Description:** If Helipad ammunition reserves are insufficient for full helicopter reload, helicopter receives partial ammunition (up to available reserves). Helipad reserves reach 0%. Player must resupply Helipad before helicopter can fully rearm.

#### FR-029: Helipad Ammunition Reserve Persistence
**Priority:** P1  
**Description:** Helipad ammunition reserves persist through save/load cycles and are stored in building object state. Reserve levels are accurately restored when game is loaded.

---

### Functional Requirements - AI Ammunition Management

#### FR-030: AI Ammunition Factory Construction
**Priority:** P1  
**Description:** Enemy AI players prioritize building Ammunition Factory after establishing core infrastructure (Construction Yard, Power Plant, Barracks, Vehicle Factory). AI builds factory within first 10 minutes if resources permit. Factory placement follows same logic as Refinery placement (near base center, accessible to units).

#### FR-031: AI Ammunition Supply Truck Production
**Priority:** P1  
**Description:** Enemy AI produces 1-2 Ammunition Supply Trucks per Ammunition Factory to support field operations. AI production priority: after initial harvesters and first combat units. AI maintains minimum 1 supply truck per active combat group.

#### FR-032: AI Unit Ammunition Monitoring
**Priority:** P1  
**Description:** AI continuously monitors ammunition levels of all combat units. When unit ammunition falls below 20%, unit is flagged for resupply. When unit ammunition reaches 0%, unit immediately retreats toward nearest resupply point (Factory or Supply Truck).

#### FR-033: AI Resupply Retreat Logic
**Priority:** P1  
**Description:** AI combat units with <20% ammunition automatically retreat from active combat toward nearest Ammunition Factory or Supply Truck. Units pathfind to resupply point, wait for replenishment, then return to previous assignment (attack, defend, patrol).

#### FR-034: AI Supply Truck Deployment
**Priority:** P1  
**Description:** AI Ammunition Supply Trucks are assigned to follow AI attack groups at safe distance (3-5 tiles behind front line). When AI units need resupply, supply truck moves forward to resupply units, then retreats to safe position.

#### FR-035: AI Ammunition Factory Rebuilding
**Priority:** P1  
**Description:** If AI Ammunition Factory is destroyed, AI prioritizes rebuilding within 2 minutes if resources and power permit. Destroyed factory is treated as critical infrastructure loss (same priority as Power Plant rebuild).

#### FR-036: AI Ammunition Supply Truck Replacement
**Priority:** P1  
**Description:** AI tracks Ammunition Supply Truck count. If truck is destroyed, AI queues replacement truck production within next 3 production cycles. AI ensures minimum 1 active supply truck exists while combat operations are ongoing.

---

### Functional Requirements - Unit Ammunition Specifications

#### FR-037: Tank V1 Ammunition Capacity
**Priority:** P0  
**Description:** Tank V1 has maximum ammunition capacity of 42 rounds. Fires 1 round per shot. Starts with full ammunition (42/42) when produced. Cost per unit: $1000. Fuel: 1900L tank, 450L/100km consumption.

#### FR-038: Tank V2 Ammunition Capacity
**Priority:** P0  
**Description:** Tank V2 has maximum ammunition capacity of 42 rounds. Fires 1 round per shot. Starts with full ammunition (42/42) when produced. Cost per unit: $2000. Fuel: 1900L tank, 450L/100km consumption. Armor: 2.

#### FR-039: Tank V3 Ammunition Capacity
**Priority:** P0  
**Description:** Tank V3 has maximum ammunition capacity of 50 rounds. Fires 2 rounds per burst. Starts with full ammunition (50/50) when produced. Cost per unit: $3000. Fuel: 1900L tank, 450L/100km consumption. Armor: 3.

#### FR-040: Rocket Tank Ammunition Capacity
**Priority:** P0  
**Description:** Rocket Tank has maximum ammunition capacity of 21 rockets. Fires 3 rockets per burst attack. Starts with full ammunition (21/21) when produced. Cost per unit: $2000. Fuel: 1900L tank, 450L/100km consumption. Armor: 1.

#### FR-041: Recovery Tank Ammunition Capacity
**Priority:** P0  
**Description:** Recovery Tank has NO ammunition system (non-combat support unit). Unit has repair functionality but does not require ammunition. Cost per unit: $3000. Fuel: 1900L tank, 450L/100km consumption. Armor: 3.

#### FR-042: Howitzer Ammunition Capacity
**Priority:** P0  
**Description:** Howitzer has maximum ammunition capacity of 30 rounds. Fires 1 round per shot (artillery shell). Starts with full ammunition (30/30) when produced. Cost per unit: $2500. Fuel: 1900L tank, 450L/100km consumption. Armor: 2.

#### FR-043: Apache Helicopter Ammunition Capacity
**Priority:** P0  
**Description:** Apache helicopter has maximum ammunition capacity of 38 rounds (rapid-fire cannon). Fires in continuous bursts. Starts with full ammunition (38/38) when produced. Cost per unit: $3000. Fuel: 5200L tank, 120L/100km consumption.

#### FR-044: Ambulance & Tanker Truck (No Ammunition)
**Priority:** P0  
**Description:** Ambulance and Tanker Truck units do NOT have ammunition systems (non-combat support units). These units are excluded from ammunition mechanics. Ambulance cost: $500, fuel: 75L tank, 25L/100km. Tanker Truck cost: $300, fuel: 700L tank, 150L/100km.

---

### Functional Requirements - Visual & Audio Feedback

#### FR-045: Ammunition Bar Color & Position
**Priority:** P0  
**Description:** Ammunition bar uses orange color (#FFA500) to distinguish from health (red/green gradient) and fuel (blue). Bar is positioned on the left side of unit HUD, width is 1/3 of HUD rectangle, height matches fuel bar height.

#### FR-046: Ammunition Depletion Warning
**Priority:** P1  
**Description:** When unit ammunition falls below 25%, ammunition bar pulses/flashes orange to warn player. When ammunition reaches 10%, bar flashes red-orange rapidly. When ammunition reaches 0%, bar becomes empty and displays critical warning icon.

#### FR-047: Resupply Progress Indicator
**Priority:** P1  
**Description:** During ammunition resupply (at Factory or by Supply Truck), orange ammunition bar gradually fills from current level to 100% over resupply duration. Smooth fill animation provides visual feedback of progress.

#### FR-048: No Ammunition Notification
**Priority:** P1  
**Description:** When player commands unit with 0 ammunition to attack, notification appears in center-top of screen: "No Ammunition - Resupply Required". Notification auto-dismisses after 3 seconds. Sound effect: "ammo_depleted.mp3".

#### FR-049: Ammunition Factory Explosion Sound
**Priority:** P2  
**Description:** Ammunition Factory destruction triggers explosion sound effect: "ammo_factory_explosion.mp3" (deep boom) followed by "ammo_scatter.mp3" (crackling, popping sounds for 5 seconds during particle scatter phase). Volume scales with distance from camera center.

#### FR-050: Ammunition Particle Impact Effects
**Priority:** P2  
**Description:** When ammunition particle collides with unit/building, visual impact includes small explosion sprite (orange flash), smoke puff, and impact sound "ammo_impact.mp3". Particle is destroyed after impact. Collision detection uses existing projectile collision system.

---

### Key Entities

- **Combat Unit (Extended)**: 
  - New attributes: `ammunition` (current rounds), `maxAmmunition` (capacity), `ammoPerShot` (consumption rate)
  - Relationships: Can be resupplied by Ammunition Factory or Ammunition Supply Truck
  - Behavior: Fires weapon only if `ammunition > 0`, decreases ammunition by `ammoPerShot` on each attack

- **Ammunition Factory (Building)**:
  - Attributes: `type: 'ammunitionFactory'`, `width: 3`, `height: 3`, `cost: 2000`, `health: 250`, `armor: 2`, `powerConsumption: 40`, `resupplyRange: 2`, `resupplyDuration: 7000`
  - Relationships: Resupplies combat units within range, reloads Ammunition Supply Trucks
  - Behavior: Queues units for resupply, explodes with particle scatter on destruction

- **Ammunition Supply Truck (Unit)**:
  - Attributes: `type: 'ammunitionTruck'`, `health: 30`, `speed: 0.66`, `cost: 800`, `fuelCapacity: 800`, `fuelConsumption: 200`, `ammoCargo: 500`, `maxAmmoCargo: 500`, `resupplyRange: 1`, `resupplyDuration: 7000`
  - Relationships: Resupplies combat units and Helipads, reloads at Ammunition Factory
  - Behavior: Auto-resupplies units in range, manual command via "moveInto" cursor, explodes on destruction if carrying cargo

- **Helipad (Extended)**:
  - New attributes: `ammoReserve` (current stored ammunition), `maxAmmoReserve: 1000` (capacity)
  - Relationships: Stores ammunition for helicopters, resupplied by Ammunition Supply Trucks
  - Behavior: Transfers ammunition to landed helicopters, depletes reserves during transfer

- **Ammunition Particle (Projectile)**:
  - Attributes: `type: 'ammoParticle'`, `damage: 30-50`, `velocity: 0.5-2.0`, `lifetime: 5000`, `size: 4`
  - Relationships: Created by Ammunition Factory explosion, collides with units/buildings
  - Behavior: Travels in random direction, explodes on collision, destroys self after lifetime

---

## Success Criteria

### Measurable Outcomes

#### SC-001: Ammunition Depletion Rate
**Measurement:** Average combat duration before units deplete ammunition  
**Target:** Tank V1 depletes ammunition after 42 shots (~84 seconds of continuous combat at 0.5 shots/sec), Rocket Tank depletes after 7 bursts (~42 seconds)

#### SC-002: Ammunition Factory Coverage
**Measurement:** Percentage of player matches where Ammunition Factory is built  
**Target:** 95%+ of matches lasting >10 minutes include at least 1 Ammunition Factory construction

#### SC-003: Ammunition Resupply Frequency
**Measurement:** Number of resupply operations per match per combat unit  
**Target:** Average 3-5 resupply operations per combat unit during 20-minute match, indicating active ammunition management

#### SC-004: HUD Ammunition Bar Visibility
**Measurement:** User testing - percentage of players who correctly identify ammunition levels  
**Target:** 90%+ of players correctly interpret ammunition bar status (full, low, depleted) within first 5 minutes of gameplay

#### SC-005: Ammunition Supply Truck Production Rate
**Measurement:** Percentage of matches where players produce Ammunition Supply Trucks  
**Target:** 70%+ of matches include at least 1 Ammunition Supply Truck production within first 15 minutes

#### SC-006: Ammunition Factory Explosion Impact
**Measurement:** Average secondary damage from ammunition particle scatter  
**Target:** Ammunition Factory destruction causes 2-5 additional unit/building casualties from particle impacts in 60%+ of destruction events

#### SC-007: AI Ammunition Management Effectiveness
**Measurement:** AI resupply rate - percentage of AI units successfully resupplied when depleted  
**Target:** AI successfully resupplies 80%+ of depleted combat units within 2 minutes of ammunition depletion

#### SC-008: System Performance Impact
**Measurement:** Frame rate with ammunition system active (100+ units, multiple resupply operations)  
**Target:** <5% frame rate decrease compared to baseline, maintain 60fps with 3 AI players and active ammunition management

#### SC-009: Ammunition Strategic Impact
**Measurement:** User survey - percentage of players who consider ammunition management important to strategy  
**Target:** 85%+ of players report ammunition management significantly affects tactical decisions and base planning

#### SC-010: Unit Ammunition Balance
**Measurement:** Combat effectiveness - time-to-kill ratio with vs. without ammunition limits  
**Target:** Units achieve 70-85% of previous kill efficiency (before ammunition system), indicating meaningful but not crippling resource constraint

#### SC-011: Helipad Ammunition Integration
**Measurement:** Percentage of helicopter sorties requiring ammunition resupply  
**Target:** Apache helicopters deplete ammunition in 60%+ of combat sorties lasting >90 seconds, requiring Helipad resupply

#### SC-012: Ammunition Truck Field Effectiveness
**Measurement:** Distance combat units travel for resupply (factory vs. field truck)  
**Target:** Units with access to Ammunition Supply Trucks travel 50% less distance for resupply compared to factory-only resupply

#### SC-013: AI Ammunition Factory Priority
**Measurement:** Time to AI Ammunition Factory construction  
**Target:** AI builds first Ammunition Factory within 6-10 minutes in 90%+ of matches with sufficient resources

#### SC-014: Ammunition Factory Queue Efficiency
**Measurement:** Average wait time for units in resupply queue  
**Target:** Average queue wait time <15 seconds per unit when 3-5 units are queued

#### SC-015: Particle Collision Accuracy
**Measurement:** Percentage of ammunition particles that successfully collide with valid targets  
**Target:** 40-60% of scattered particles hit units/buildings (remaining particles fly off-map or expire), creating unpredictable but dangerous destruction zone

#### SC-016: Ammunition Bar Readability
**Measurement:** A/B testing - percentage of users who prefer orange left-side bar vs. alternatives  
**Target:** 80%+ of users find orange left-side ammunition bar intuitive and visually distinct from health/fuel bars

#### SC-017: Resupply Timing Balance
**Measurement:** Percentage of combat time spent resupplying vs. engaging  
**Target:** Combat units spend 10-15% of active combat time resupplying ammunition (not so frequent as to be tedious, not so rare as to be ignorable)

#### SC-018: Ammunition Notification Clarity
**Measurement:** User testing - percentage of players who notice and respond to "No Ammunition" notification  
**Target:** 95%+ of players acknowledge notification and take resupply action within 10 seconds of first occurrence

#### SC-019: AI Ammunition Truck Survival Rate
**Measurement:** Average lifespan of AI Ammunition Supply Trucks  
**Target:** AI supply trucks survive 8-12 minutes on average, indicating reasonable protection by AI but vulnerability to player targeting

#### SC-020: Save/Load Ammunition State Integrity
**Measurement:** Percentage of save/load cycles that accurately restore ammunition states  
**Target:** 100% of save/load operations preserve all unit ammunition levels, truck cargo, and Helipad reserves with zero data loss

---

## Dependencies

- **src/buildings.js** - Building configuration, add Ammunition Factory definition
- **src/units.js** - Unit creation, add ammunition properties and Ammunition Supply Truck definition
- **src/config.js** - Add ammunition system constants (capacities, costs, durations, resupply ranges)
- **src/gameState.js** - Extend unit and building objects with ammunition properties
- **src/rendering/unitRenderer.js** - Add orange ammunition bar rendering (left side of HUD)
- **src/rendering/buildingRenderer.js** - Add ammunition Factory explosion and particle rendering
- **src/game/combatSystem.js** - Integrate ammunition depletion on weapon fire
- **src/game/buildingSystem.js** - Add Ammunition Factory resupply zone logic
- **src/ai/enemyStrategies.js** - Add AI ammunition management behaviors (factory construction, truck deployment, resupply retreat)
- **src/ai/enemyAIPlayer.js** - Integrate ammunition monitoring and resupply prioritization
- **src/input/inputHandler.js** - Add "moveInto" cursor for Ammunition Supply Truck commands
- **src/ui/notifications.js** - Add "No Ammunition" notification display
- **src/sound.js** - Add sound effects (ammo_depleted.mp3, ammo_factory_explosion.mp3, ammo_scatter.mp3, ammo_impact.mp3)
- **src/game/helipadLogic.js** - Extend Helipad with ammunition reserve storage (250 rounds) and transfer logic to landed helicopters
- **src/game/unitCombat.js** - Implement Apache-specific ammo checking using `rocketAmmo` field, enforce 180ms volley delay
- **src/input/cheatSystem.js** - Support ammo manipulation for both `ammunition` and `rocketAmmo` fields, handle Apache helicopters correctly
- **src/saveGame.js** - Serialize/deserialize ammunition states, truck cargo, Helipad reserves
- **public/images/map/buildings/ammunition_factory_map.webp** - Ammunition Factory map sprite
- **public/images/sidebar/ammunition_factory_sidebar.webp** - Ammunition Factory build button sprite
- **public/images/map/units/ammunition_truck_map.webp** - Ammunition Supply Truck map sprite
- **public/images/sidebar/ammunition_truck_sidebar.webp** - Ammunition Supply Truck build button sprite

---

## Testing Approach

### Manual Testing

1. **Ammunition Depletion Test**: Build Tank V1, engage enemies, verify ammunition decreases from 42 to 0, verify unit stops firing at 0
2. **Ammunition Factory Construction Test**: Build Ammunition Factory, verify cost ($2000), power consumption (40MW), placement (3x3 tiles), health (250)
3. **Ammunition Resupply Test**: Move depleted unit within the same service radius as a hospital of factory, verify orange bar fills over 7 seconds, verify ammunition restored to max
4. **Ammunition Supply Truck Production Test**: Build supply truck, verify cost ($800), verify requires Vehicle Factory + Ammunition Factory
5. **Field Resupply Test**: Command supply truck to depleted unit, verify truck moves to unit, verify resupply occurs within 1 tile
6. **HUD Ammunition Bar Test**: Select various units, verify orange bar appears on left, verify fill percentage matches ammunition level
7. **Ammunition Factory Explosion Test**: Destroy factory, verify initial blast (2 tiles), verify 30-50 particles scatter, verify particles damage units on impact
8. **Helipad Integration Test**: Resupply helipad with supply truck, land Apache, verify ammunition transfer from helipad to helicopter
9. **AI Ammunition Management Test**: Observe AI over 20-minute match, verify AI builds factory, produces trucks, resupplies units
10. **Multi-Unit Queue Test**: Send 5+ units to factory simultaneously, verify units queue, verify one-at-a-time resupply, verify queue indicators

### Automated Testing (if implemented)

- Unit tests for ammunition depletion calculations (ammo per shot, burst fire logic)
- Unit tests for resupply distance calculations (within the same service radius as a hospital for factory, within 1 tile for truck)
- Unit tests for Ammunition Supply Truck cargo management (depletion, reload at factory)
- Integration tests for ammunition particle collision detection and damage application
- State serialization tests for save/load ammunition integrity
- AI behavior tests verifying factory construction priority and resupply retreat logic

### Performance Testing

- Frame rate benchmarks with 100+ units actively managing ammunition
- Memory profiling for ammunition particle systems (50 particles x 3 AI factories simultaneously destroyed)
- Render performance for 10+ units with ammunition bars displayed concurrently
- Pathfinding load testing for AI units retreating to resupply points (50+ units simultaneously)

### User Acceptance Testing

- Playtest sessions to validate ammunition bar visibility and intuitiveness
- Feedback collection on ammunition management gameplay feel (too tedious vs. engaging)
- Balance testing to ensure ammunition depletion rates feel fair and strategic
- AI competitiveness testing to verify AI ammunition management provides appropriate challenge

---

## Implementation Notes

### Ammunition System Architecture
- Ammunition tracking is added as properties to existing unit objects: `ammunition`, `maxAmmunition`, `ammoPerShot`
- Apache helicopters use separate `rocketAmmo`/`maxRocketAmmo` fields for ammunition tracking
- Resupply logic reuses gas station/tanker truck patterns for consistency
- Ammunition particles use existing projectile collision system for efficiency
- Combat system (unitCombat.js) handles ammo depletion with unit-type-specific checks
- Apache volley state prevents firing when `rocketAmmo === 0` with user notifications
- Helipad resupply transfers ammunition from building reserves to landed helicopters over time

### Configuration Values
All ammunition values are defined in `config.js` as exportable constants for easy tuning:
```javascript
export const AMMO_RESUPPLY_TIME = 7000 // ms
export const AMMO_FACTORY_RANGE = 2 // tiles
export const AMMO_TRUCK_RANGE = 1 // tiles
export const AMMO_TRUCK_CARGO = 500 // rounds
export const HELIPAD_AMMO_RESERVE = 250 // rounds (50% of truck cargo)
export const UNIT_AMMO_CAPACITY = {
  tank_v1: 42,
  'tank-v2': 42,
  'tank-v3': 50,
  rocketTank: 21,
  howitzer: 30,
  apache: 38
}
export const AMMO_FACTORY_PARTICLE_COUNT = 40 // average
export const AMMO_PARTICLE_DAMAGE = 40 // average
```

### Apache Helicopter Ammunition System
Apache helicopters use a separate `rocketAmmo` field instead of `ammunition` for technical reasons:
- Units store `maxRocketAmmo` and `rocketAmmo` properties (set to 38 rounds)
- Combat system checks `rocketAmmo` instead of `ammunition` for Apache units
- Ammo depletion sets `apacheAmmoEmpty = true` and `canFire = false` when rockets depleted
- Helipad logic transfers ammunition from helipad reserves to landed Apache helicopters
- Cheat system handles both `ammunition` and `rocketAmmo` fields appropriately
- Apache volley firing controlled by 180ms delay between rockets (50% slower cadence), with 30% shorter cooldown to start the next volley (8.4s base reload)

### Visual Design Consistency
- Ammunition bar uses same styling as existing fuel bar (orange instead of blue)
- Resupply progress animations match existing harvester unloading animations
- Ammunition Factory explosion reuses gas station explosion framework with modified parameters
- Particle scatter effects adapted from existing bullet/rocket projectile rendering

### AI Integration Points
- AI ammunition monitoring hooks into existing unit state tracking (same pattern as health/fuel monitoring)
- AI factory construction priority inserted between Refinery and advanced buildings
- AI resupply retreat logic uses same pathfinding as harvester return-to-refinery behavior
- AI supply truck deployment follows same escort patterns as ambulance/recovery tank AI

### Performance Considerations
- Ammunition bar rendering only occurs for selected units (not all units on map)
- Particle scatter limited to 30-50 particles with 5-second lifetime to prevent lag
- Resupply queue system prevents excessive simultaneous resupply calculations
- AI ammunition checks throttled to 3-second intervals (not every frame)

### Balance Philosophy
- Ammunition capacities scaled to provide ~60-90 seconds of continuous combat before depletion
- Resupply time (7 seconds) is fast enough to not feel tedious but long enough to be tactically significant
- Ammunition Factory cost ($2000) is accessible but meaningful (same tier as Ore Refinery)
- Ammunition Supply Truck is cheap ($800) to encourage field resupply usage

### Known Limitations
- Ammunition particle scatter is pseudo-random (not physics-simulated) - particles follow straight trajectories
- No ammunition manufacturing/cost per resupply - factories provide infinite ammunition (gameplay simplification)
- Helipad ammunition reserves do not decay over time (only through helicopter resupply)
- AI does not dynamically adjust Ammunition Factory placement based on combat hotspots (places near base center)

### Implementation Status Updates (2025-11-07)
- ✅ Apache helicopter ammunition system fully implemented with `rocketAmmo` field
- ✅ Combat system properly checks Apache ammo before firing rockets
- ✅ Apache volley delay tuned to 180ms with a 30% faster volley reload cycle (8.4s base)
- ✅ Helipad ammunition transfer logic implemented in helipadLogic.js
- ✅ Cheat system updated to handle both `ammunition` and `rocketAmmo` fields
- ✅ False "out of ammo" notifications for Apache helicopters fixed
- ✅ Apache helicopters with rockets can now fire continuously without false ammo warnings

### Future Enhancement Opportunities
- Ammunition manufacturing cost (per resupply operation costs small amount of money)
- Different ammunition types (armor-piercing, explosive, incendiary) with tactical trade-offs
- Ammunition trucks as priority targets for AI (actively hunted to disrupt enemy supply lines)
- Advanced AI supply chain management (dedicated supply convoys, forward ammunition depots)
- Unit-specific ammunition consumption rates based on accuracy/fire rate (veterans use less ammo)

---

## References

- Existing gas station/tanker truck implementation: `src/buildings.js`, `src/units.js`, `src/game/fuelSystem.js` (if exists)
- Harvester resupply mechanics: `src/game/harvesterSystem.js` (pattern for queue system)
- Gas station explosion effects: `src/game/explosionSystem.js` or `src/rendering/effectsRenderer.js`
- AI resource management: `src/ai/enemyAIPlayer.js`, `src/ai/enemyStrategies.js`
- HUD bar rendering: `src/rendering/unitRenderer.js` (health bar, fuel bar patterns)
- Projectile collision system: `src/game/bulletCollision.js`, `src/game/bulletSystem.js`
- Real-time strategy balance principles: "The Art of Game Balance" - ammunition as consumable resource constraint
