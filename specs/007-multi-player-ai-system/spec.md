# Multi-Player & AI System

**Branch:** `007-multi-player-ai-system`  
**Status:** Implemented  
**Created:** 2025-11-05  
**Last Updated:** 2026-02-27

---

## Overview

This specification documents the comprehensive multi-player AI system that powers computer-controlled opponents in Code for Battle. The system supports up to 4 parties (1 human player + 3 AI players), each with independent resource management, base building, unit production, and strategic decision-making. AI players exhibit distinct behaviors including aggressive expansion, defensive positioning, and adaptive combat tactics.

## Testing Notes

- AI party synchronization should clear queued commands and reset utility targets when a remote party disconnects, ensuring AI reactivation takes immediate control of units owned by that party.

---

## User Stories

### User Story 1: Four-Party Gameplay
**Priority:** P0  
**As a** player  
**I want** to compete against up to 3 AI opponents simultaneously  
**So that** I can experience challenging multi-party RTS battles

**Acceptance Criteria:**
- [x] Game supports exactly 4 parties (player at index 0, AI at indices 1-3)
- [x] Each party has independent resources, buildings, and units
- [x] AI parties are assigned distinct starting positions on the map
- [x] AI players have unique identifiers and color coding
- [x] Victory/defeat detection works correctly in multi-party scenarios
- [x] Game state properly tracks all 4 parties throughout the match

---

### User Story 2: AI Resource & Energy Management
**Priority:** P0  
**As a** game designer  
**I want** AI players to manage their economy like human players  
**So that** AI opponents face the same resource constraints and strategic choices

**Acceptance Criteria:**
- [x] AI players start with same initial resources as human player
- [x] AI builds power plants to generate energy
- [x] AI tracks power supply and demand for all buildings
- [x] AI prioritizes power plant construction when energy is insufficient
- [x] AI manages money for unit production and building construction
- [x] AI income increases through ore harvesting and refinery operations
- [x] Power shortages disable AI building functionality appropriately

---

### User Story 3: AI Base Building & Expansion
**Priority:** P1  
**As a** player  
**I want** AI opponents to construct functional bases  
**So that** I face organized adversaries with proper infrastructure

**Acceptance Criteria:**
- [x] AI constructs initial base buildings (Construction Yard, Power Plant, War Factory)
- [x] AI builds defensive structures (Gun Turrets, SAM Sites)
- [x] AI places turrets at strategic positions around its base
- [x] AI builds economy buildings (Ore Refineries, Silos) when needed
- [x] AI expands base area when resources permit
- [x] AI building placement avoids overlaps and invalid positions
- [x] AI maintains balanced building ratios (defense, economy, production)

---

### User Story 4: AI Unit Production & Army Management
**Priority:** P0  
**As a** player  
**I want** AI opponents to build diverse armies  
**So that** combat encounters are varied and challenging

**Acceptance Criteria:**
- [x] AI produces vehicles from War Factories
- [x] AI builds mix of unit types (tanks, rocket tanks, harvesters, apache helicopters)
- [x] AI production queues units at factories
- [x] AI respects production costs and prerequisites
- [x] AI army composition adapts to game state (early/mid/late game)
- [x] AI replaces destroyed units to maintain army strength
- [ ] AI maintains a one-apache-per-helipad ratio and only commits helicopters against targets lacking rocket tank or rocket turret protection
- [x] AI also tries to resotre wrecks (using recovery tanks) from any party to maintain army strength

---

### User Story 5: AI Strategic Behavior & Tactics
**Priority:** P1  
**As a** player  
**I want** AI opponents to make strategic decisions  
**So that** gameplay feels dynamic and requires tactical thinking

**Acceptance Criteria:**
- [x] AI units automatically engage nearby enemy targets
- [x] AI units pursue retreating enemies when advantageous
- [x] AI sends attack groups toward player base periodically
- [x] AI defends its own base when under attack
- [x] AI harvesters return to base when damaged or threatened
- [x] AI rebuilds critical structures when destroyed
- [x] AI adapts strategy based on current game state (winning/losing)
- [x] AI Apache helicopters immediately target enemy helicopters within firing range and resume their prior objectives after the threat is destroyed or disengaged
- [x] AI F22 Raptors acquire enemy targets via air combat behavior and initiate takeoff when grounded so produced F22 units actively join attacks

---

### User Story 6: AI Difficulty & Balancing
**Priority:** P2  
**As a** player  
**I want** AI opponents to provide appropriate challenge  
**So that** games are engaging without being frustrating

**Acceptance Criteria:**
- [x] AI reaction times feel natural (not instant, not sluggish)
- [x] AI makes occasional suboptimal decisions (realistic behavior)
- [x] AI economy scales at reasonable pace (not too fast/slow)
- [x] AI unit production ramps up over time
- [x] Multiple AI opponents coordinate implicitly through game state
- [x] AI is beatable by skilled players but challenging for beginners

---

## Functional Requirements

### Core AI Framework

#### FR-001: Party System Architecture
**Priority:** P0  
**Description:** Game state maintains array of exactly 4 parties with party index 0 always being human player and indices 1-3 being AI-controlled players. Each party object contains resources, buildings, units, and strategic state.

#### FR-002: AI Update Cycle
**Priority:** P0  
**Description:** AI decision-making runs at consistent intervals (default 3000ms) to simulate planning delays and prevent instant reactions. Update cycle processes economy, construction, production, and combat decisions in sequence.

#### FR-003: Party Resource Tracking
**Priority:** P0  
**Description:** Each AI party tracks money independently with initial value matching human player. Resources are spent on construction and production, earned through ore harvesting and refineries.

#### FR-004: AI State Persistence
**Priority:** P1  
**Description:** AI strategic state (current focus, last decisions, timers) persists across update cycles to enable long-term planning and avoid erratic behavior.

---

### Energy Management

#### FR-005: Power Supply Calculation
**Priority:** P0  
**Description:** AI calculates total power supply from all owned Power Plants (100 power each). Power demand calculated from all owned buildings with power requirements.

#### FR-006: Power Plant Priority
**Priority:** P0  
**Description:** When power demand exceeds supply by threshold (>80%), AI prioritizes Power Plant construction above other buildings to prevent brownouts.

#### FR-007: Power Shortage Handling
**Priority:** P1  
**Description:** When AI experiences power shortage, building construction and unit production slow or halt appropriately. AI detects shortage and queues additional Power Plants.

---

### Base Construction

#### FR-008: Construction Yard Management
**Priority:** P0  
**Description:** AI starts with one Construction Yard. If destroyed, AI attempts to rebuild using MCV if available. Construction Yard enables all building placement.

#### FR-009: War Factory Construction
**Priority:** P0  
**Description:** AI constructs War Factory as early priority to enable vehicle production. Typically constructed within first 2 build cycles after initial Power Plant.

#### FR-010: Ore Refinery Construction
**Priority:** P1  
**Description:** AI builds Ore Refinery to process harvested ore into money. Places refinery near ore fields when possible for harvester efficiency.

#### FR-011: Defensive Structure Placement
**Priority:** P1  
**Description:** AI constructs Gun Turrets and SAM Sites at strategic positions around base perimeter. Turret placement prioritizes coverage of entry points and high-value buildings.

#### FR-012: Building Placement Algorithm
**Priority:** P0
**Description:** AI places buildings near existing structures to create compact base layout. Validates tile availability, checks for overlaps, ensures buildings are on valid terrain.

#### FR-012a: Building Spacing Rules
**Priority:** P0
**Description:** Enemy AI keeps a default 2-tile gap to neighboring structures during placement; defensive structures may touch other defensive structures and wall segments may be contiguous. A 1-tile gap is only allowed after all nearby 2-gap options have been checked and blocked.

#### FR-013: Building Prerequisites
**Priority:** P0
**Description:** AI respects technology tree prerequisites (e.g., Advanced structures require Tech Center). Builds prerequisite structures before advanced ones.

---

### Unit Production

#### FR-014: Vehicle Production Queue
**Priority:** P0  
**Description:** AI queues vehicles (Tanks, Rocket Tanks, Harvesters, Apache Helicopters, Howitzers) at War Factory. Production prioritizes economy (harvesters) early, transitions to combat units mid-game.

#### FR-015: Unit Cost Validation
**Priority:** P0  
**Description:** AI checks money availability before queuing units. Deducts costs immediately on queue to prevent over-spending. Handles production failures gracefully.

#### FR-016: Production Timing
**Priority:** P1  
**Description:** AI spaces production commands to avoid flooding queues. Allows factories to complete current production before queuing next batch. Maintains steady unit flow.

#### FR-017: Harvester Production
**Priority:** P1
**Description:** AI produces replacement harvesters when existing ones are destroyed or insufficient for optimal income. Targets 2-3 active harvesters per refinery.

#### FR-018: Automated Building Repairs
**Priority:** P1
**Description:** AI players monitor their structures for damage and queue repairs using the same 10-second post-attack cooldown enforced on the human player. When available funds fall below a low-budget threshold, AI must prioritize repairing critical infrastructure (construction yard, power plants, refineries, vehicle factories/workshops, radar) before restoring non-essential defenses or tech buildings.

#### FR-019: Army Composition
**Priority:** P1  
**Description:** AI maintains balanced army composition: ~70% combat vehicles (tanks, rocket tanks, apache), ~20% heavy units (howitzers, tank-v3), ~10% support units (harvesters, ambulances, tankers). Adjusts ratios based on game phase and threat assessment.

#### FR-019a: Enemy F22 Attack Activation
**Priority:** P1  
**Description:** AI-controlled F22 Raptors must use air-strike target selection and, when grounded, set takeoff intent immediately after target acquisition so they do not remain idle on the runway once produced.

---

### Strategic Decision Making

#### FR-020: Threat Assessment
**Priority:** P1  
**Description:** AI detects enemy units near its base by proximity checking. Assigns threat levels based on enemy unit count and types. Triggers defensive responses when threat exceeds threshold.

#### FR-021: Attack Wave Generation
**Priority:** P1  
**Description:** AI periodically assembles attack groups (5-15 units) and sends toward enemy base locations. Attack frequency increases as AI army size grows. Groups prefer mixed unit compositions.

#### FR-022: Base Defense Priority
**Priority:** P1  
**Description:** When AI base is under attack, units retreat toward home base and engage attackers. Defensive turrets provide fire support. AI temporarily halts offensive operations during defense.

#### FR-023: Expansion Strategy
**Priority:** P2  
**Description:** AI expands base area by placing buildings progressively farther from Construction Yard. Secures ore fields by placing refineries and defensive structures nearby.

#### FR-024: Critical Structure Rebuilding
**Priority:** P1  
**Description:** AI detects destruction of critical buildings (Power Plant, War Factory, Refinery) and prioritizes rebuilding them. Rebuilds at original location if possible, otherwise finds new suitable position.

---

### Combat Behavior

#### FR-025: Automatic Target Engagement
**Priority:** P0  
**Description:** AI units automatically detect and engage enemy units within weapon range. Target selection prioritizes closest threats, then high-value targets (harvesters, damaged units).

#### FR-026: Pursuit Logic
**Priority:** P1  
**Description:** AI units pursue fleeing enemies up to maximum chase distance (5-10 tiles). Pursuit terminates if unit strays too far from assigned area or encounters stronger resistance.

#### FR-027: Retreat Behavior
**Priority:** P1  
**Description:** Damaged AI units (health < 30%) attempt to retreat toward friendly base or nearby defensive structures. Retreat overrides offensive commands temporarily.

#### FR-028: Focus Fire Coordination
**Priority:** P2  
**Description:** Multiple AI units in same area implicitly coordinate targeting by prioritizing same enemies. Creates focus fire effect without explicit communication system.

#### FR-029: Anti-Air Targeting
**Priority:** P1  
**Description:** AI Rocket Tanks and SAM Sites prioritize aircraft targets when detected. Ground units ignore aircraft to let specialized anti-air units handle them.

---

### Harvester Management

#### FR-030: Harvester Pathfinding
**Priority:** P1  
**Description:** AI harvesters automatically pathfind to nearest ore field, collect ore, and return to refinery. Pathfinding avoids combat zones and enemy base areas when possible.

#### FR-031: Harvester Protection
**Priority:** P1  
**Description:** When AI harvester is attacked, nearby combat units move to protect it. Harvester attempts to flee toward base while escort engages attackers.

#### FR-032: Ore Field Assignment
**Priority:** P2  
**Description:** AI assigns harvesters to different ore fields to maximize collection efficiency. Harvesters avoid clustering at same ore patch.

#### FR-033: Harvester Replacement
**Priority:** P1  
**Description:** AI tracks harvester count and produces replacements when destroyed. Ensures minimum 1 harvester per refinery to maintain economy.

---

### AI-to-AI Interaction

#### FR-034: Multi-AI Coordination
**Priority:** P2  
**Description:** Multiple AI players indirectly coordinate through shared enemy detection. All AI parties target human player, creating implicit alliance against human.

#### FR-035: Resource Competition
**Priority:** P2  
**Description:** AI players compete for ore fields on map. First AI to secure ore field with refinery gains economic advantage. AI avoids building too close to other AI bases.

#### FR-036: Combat Between AI Players
**Priority:** P2  
**Description:** AI players can engage each other if units encounter in neutral territory, but prioritize human player as primary target. Reduces AI-vs-AI conflicts to keep focus on player.

---

### Performance & Optimization

#### FR-037: AI Update Throttling
**Priority:** P1  
**Description:** AI decision-making throttled to run at 3-second intervals (configurable) to reduce CPU load. Prevents performance degradation with multiple active AI players.

#### FR-038: Unit Count Limits
**Priority:** P1  
**Description:** AI respects global unit count limits (typically 100-200 units total across all parties). Prevents infinite unit production that could cause performance issues.

#### FR-039: Spatial Queries Optimization
**Priority:** P2  
**Description:** AI uses spatial partitioning or proximity checks to efficiently find nearby units/buildings. Avoids O(n²) distance calculations every frame.

---

### AI Configuration & Tuning

#### FR-040: Difficulty Settings (Future)
**Priority:** P2  
**Description:** System designed to support difficulty levels (Easy/Medium/Hard) that adjust AI reaction times, production speed, and decision quality. Currently operates at single difficulty.

#### FR-041: AI Personality Variants (Future)
**Priority:** P2  
**Description:** Framework supports different AI personality types (aggressive, defensive, economic) with different strategic priorities. Currently all AI players use same strategy.

#### FR-042: Configurable Timing Parameters
**Priority:** P2  
**Description:** AI timing parameters (update interval, attack frequency, build delays) are configurable constants rather than hardcoded values for easy tuning.

---

### Integration & Coordination

#### FR-043: Game State Integration
**Priority:** P0  
**Description:** AI system reads from and writes to centralized gameState object. AI decisions affect units, buildings, and resources through standard game systems (same as player actions).

#### FR-044: Enemy System Integration
**Priority:** P0  
**Description:** AI integrates with enemy unit behavior system (src/enemy.js, src/ai/enemyUnitBehavior.js) to control unit movement and combat actions. All AI units follow same behavioral rules.

#### FR-045: Building System Integration
**Priority:** P0  
**Description:** AI uses standard building placement and construction systems (src/game/buildingSystem.js). AI construction follows same validation rules as player building.

#### FR-046: Production Queue Integration
**Priority:** P0  
**Description:** AI queues units through standard production system (src/productionQueue.js). Production timing and costs enforced by same system used for player.

#### FR-047: Victory Condition Integration
**Priority:** P0  
**Description:** AI defeat occurs when all AI buildings and units are destroyed (same as player defeat). Game ends when only one party remains with buildings.

---

## Success Criteria

### SC-001: Multi-Party Game Initialization
**Measurement:** Game successfully initializes with 4 parties (1 human, 3 AI)  
**Target:** 100% of games start with all 4 parties active and properly initialized

### SC-002: AI Economic Viability
**Measurement:** AI players sustain economy for entire match duration  
**Target:** AI maintains positive income and builds economy structures in 90%+ of matches

### SC-003: AI Base Development
**Measurement:** AI constructs functional base with key buildings  
**Target:** AI builds Construction Yard, Power Plant, War Factory, Refinery within first 5 minutes in 95%+ of matches

### SC-004: AI Power Management
**Measurement:** AI maintains adequate power supply for its buildings  
**Target:** AI experiences <10% time in power shortage state, builds additional Power Plants when needed

### SC-005: AI Unit Production Rate
**Measurement:** AI produces steady stream of combat units  
**Target:** AI produces 10+ units within first 10 minutes, production rate increases over time

### SC-006: AI Harvester Operations
**Measurement:** AI harvesters successfully collect ore and generate income  
**Target:** AI harvesters complete 20+ ore collection cycles per match, maintain 2+ active harvesters mid-game

### SC-007: AI Defensive Structure Placement
**Measurement:** AI places turrets in strategically sound positions  
**Target:** AI builds 4+ defensive structures positioned around base perimeter by mid-game

### SC-008: AI Attack Wave Execution
**Measurement:** AI sends organized attack groups toward player base  
**Target:** AI launches 3+ attack waves per match with 5+ units per wave

### SC-009: AI Base Defense Response
**Measurement:** AI units respond to base attacks appropriately  
**Target:** When player attacks AI base, 80%+ of nearby AI units engage within 5 seconds

### SC-010: AI Target Engagement
**Measurement:** AI units automatically engage enemy targets in range  
**Target:** 95%+ of AI units engage enemies within weapon range within 2 seconds of detection

### SC-011: AI Retreat Behavior
**Measurement:** Damaged AI units attempt to retreat  
**Target:** 70%+ of AI units with health <30% execute retreat toward base

### SC-012: AI Harvester Protection
**Measurement:** AI responds to harvester attacks with escorts  
**Target:** When harvester attacked, nearby combat units move to intercept within 5 seconds in 60%+ of cases

### SC-013: AI Critical Structure Rebuilding
**Measurement:** AI rebuilds destroyed critical buildings  
**Target:** AI rebuilds Power Plant within 60 seconds of destruction in 80%+ of cases

### SC-014: AI Performance Impact
**Measurement:** Frame rate with 3 active AI players  
**Target:** Maintain 60fps with 3 AI players, <5% frame time increase from AI decision-making

### SC-015: AI Update Frequency
**Measurement:** AI decision cycle timing consistency  
**Target:** AI updates execute every 3000ms ±500ms, no skipped cycles under normal load

### SC-016: AI Memory Usage
**Measurement:** Memory footprint of AI state data  
**Target:** AI state for all 3 players <10MB total memory usage

### SC-017: AI vs AI Interaction
**Measurement:** Multiple AI players coexist without conflicts  
**Target:** AI players avoid building on each other's bases, compete for resources peacefully

### SC-018: AI Match Completion
**Measurement:** AI players remain functional until defeated  
**Target:** AI continues making decisions and producing units until all buildings destroyed in 100% of matches

### SC-019: AI Army Composition Balance
**Measurement:** Ratio of different vehicle types in AI army  
**Target:** AI maintains balanced mix of light tanks, rocket tanks, and heavy units in armies of 20+ units

### SC-020: AI Production Cost Management
**Measurement:** AI avoids overspending and maintains positive money balance  
**Target:** AI money balance stays positive 85%+ of match duration, no production queue failures due to insufficient funds

### SC-021: AI Building Placement Validity
**Measurement:** AI building placement success rate  
**Target:** 95%+ of AI building placement attempts succeed without overlaps or invalid position errors

### SC-022: AI Turret Coverage
**Measurement:** Turret placement provides base defense coverage  
**Target:** AI turrets provide overlapping fire coverage for 70%+ of base perimeter by late game

### SC-023: AI Strategic Adaptation
**Measurement:** AI adjusts strategy based on game state  
**Target:** AI increases attack frequency when ahead, focuses on defense when behind (observable behavioral changes)

### SC-024: AI Victory Capability
**Measurement:** AI can defeat human player in some matches  
**Target:** Skilled AI defeats inexperienced human players in 40-60% of test matches

### SC-025: AI Pathfinding Integration
**Measurement:** AI units navigate map using pathfinding system  
**Target:** AI units reach destinations via valid paths in 95%+ of movement commands, handle blocked paths gracefully

### SC-026: AI Combat Effectiveness
**Measurement:** AI combat units achieve positive kill/death ratios  
**Target:** AI units achieve 0.8-1.2 K/D ratio against equally-sized player forces (indicating fair balance)

### SC-027: AI Response Time Realism
**Measurement:** AI reaction time feels human-like  
**Target:** 3-second minimum delay between strategic decisions, no instant perfect reactions to player actions

### SC-028: AI Concurrent Operations
**Measurement:** AI manages multiple tasks simultaneously  
**Target:** AI successfully balances base building, unit production, economy, and combat within same update cycle

### SC-029: AI Ore Field Expansion
**Measurement:** AI secures additional ore fields as game progresses  
**Target:** AI builds 2+ refineries at different ore field locations by late game when resources permit

### SC-030: AI Unit Focus Fire
**Measurement:** Multiple AI units coordinate on same targets  
**Target:** When 5+ AI units engage same enemy group, 70%+ fire at same priority target within 3 seconds

---

## Edge Cases & Error Handling

1. **AI Starts with No Valid Building Space:** If AI spawn point blocked by terrain/units, AI uses flood-fill algorithm to find nearest valid construction zone, falls back to random location if none found within reasonable distance.

2. **AI Runs Out of Money Early Game:** AI includes minimum cash reserve check before expensive purchases, prioritizes harvester production to restart economy, can remain idle temporarily until income resumes.

3. **All AI Harvesters Destroyed:** AI detects zero harvesters + existing refinery scenario, immediately queues replacement harvester with high priority, borrows from building budget if necessary to prevent economic collapse.

4. **AI Base Completely Destroyed:** AI enters "defeated" state, stops all decision-making to save CPU, units become uncontrolled (basic defensive behavior only), no respawn mechanics.

5. **Player Destroys AI Construction Yard Early:** AI attempts to deploy MCV if one exists in unit roster, if no MCV available AI cannot rebuild and effectively loses, this is valid game design (punishes failure to defend critical structure).

6. **AI Power Plant Destroyed Causing Brownout:** AI detects power shortage state, immediately queues Power Plant as highest priority, temporarily pauses non-essential production, resumes normal operations once power restored.

7. **AI Units Get Stuck in Pathfinding Loop:** Units have maximum pathfinding retry count (3-5 attempts), after retries exhausted unit chooses random nearby valid position as alternate destination, prevents infinite loops.

8. **Multiple AI Players Target Same Resources:** First AI to place refinery "claims" ore field, other AI use distance checks to prefer unclaimed fields, competition is implicit through building placement, no explicit territory system.

9. **AI Attempts to Build Invalid Structure:** Building placement validation catches invalid positions (overlaps, out of bounds, terrain restrictions), AI retries with slightly offset position (2-5 tile radius), gives up after 3-5 failed attempts.

10. **AI Update Cycle Runs During Heavy Game Load:** AI update designed to be interruptible, if frame budget exceeded AI defers remaining decisions to next cycle, ensures game doesn't freeze even with 3 active AI players.

11. **AI Tries to Produce Unit Without Prerequisites:** Production system validates tech tree requirements before queuing, AI receives failure callback, adds prerequisite building to construction queue first, retries unit production on subsequent cycles.

12. **Save/Load with AI State:** AI strategic state (timers, current focus) is reset on game load to prevent stale data, AI resumes normal decision-making from current game state, no long-term memory persists across sessions.

13. **AI Bankruptcy Recovery:** When an AI player has no active ore refinery or no remaining harvesters and also lacks the funds to rebuild the missing structure, it automatically sells non-essential buildings (prioritizing defensive and auxiliary structures before extra factories/power plants) until it can afford the required refinery or harvester to restore ore income.

---

## Dependencies

- **src/ai/enemyAIPlayer.js** - Main AI decision-making logic and update cycle
- **src/ai/enemyStrategies.js** - Strategic behavior implementations (attack, defend, expand)
- **src/ai/enemyBuilding.js** - AI building placement and construction logic
- **src/ai/enemyUnitBehavior.js** - Individual unit AI behaviors (combat, movement)
- **src/ai/enemySpawner.js** - AI initialization and party setup
- **src/ai/enemyUtils.js** - Utility functions for AI calculations and queries
- **src/enemy.js** - Core enemy unit management and behavior coordination
- **src/gameState.js** - Central game state containing party data, units, buildings
- **src/game/pathfinding.js** - Pathfinding system used by AI units for navigation
- **src/game/buildingSystem.js** - Building placement validation and construction
- **src/productionQueue.js** - Unit production queue management for factories/barracks
- **src/units.js** - Unit type definitions and unit creation functions
- **src/buildings.js** - Building type definitions and building creation functions
- **src/config.js** - Game constants including AI timing parameters

---

## Testing Approach

**Manual Testing:**
- Launch game with 3 AI opponents, observe AI base development over 20-minute match
- Verify AI constructs all building types (Power Plants, War Factories, Refineries, Turrets)
- Confirm AI produces steady stream of vehicles (tanks, rocket tanks, harvesters, apache helicopters)
- Test AI response to base attacks - verify units return to defend
- Destroy AI harvesters, confirm AI produces replacements
- Destroy AI Power Plant, verify AI rebuilds and manages brownout
- Observe AI attack waves - verify groups of 5+ units attack player base
- Check AI pathfinding - verify units navigate around obstacles
- Test multi-AI scenarios - verify all 3 AI players operate independently
- Verify game performance - confirm 60fps maintained with 3 active AI

**Automated Testing (if implemented):**
- Unit tests for AI decision functions (building priority, target selection, threat assessment)
- Simulation tests running AI vs AI matches to verify behavioral balance
- Performance benchmarks measuring AI update cycle timing and CPU usage
- State validation tests ensuring AI doesn't create invalid game states

**Performance Profiling:**
- Measure frame time with 0, 1, 2, 3 AI players to quantify performance impact
- Profile AI update cycle to identify expensive operations
- Monitor memory usage over extended matches to detect leaks
- Test extreme scenarios (100+ units, heavy combat) to find performance limits

---

## Implementation Notes

**AI Architecture:**
- AI system follows hierarchical design: Strategic layer (economy, expansion) → Tactical layer (unit groups, attacks) → Operational layer (individual unit behaviors)
- Each AI party maintains independent state machine tracking current strategic focus (economy, military buildup, attack, defense)
- AI decisions are time-sliced across multiple frames to prevent CPU spikes from complex calculations
- System designed for extensibility - easy to add new strategies, behaviors, or unit types

**Balancing Philosophy:**
- AI deliberately includes slight delays and imperfect decision-making to feel "human-like" rather than optimally efficient
- AI has same resource constraints, costs, and tech tree as human player (no cheating)
- Multiple AI opponents create challenge through numbers, not individual superiority
- AI difficulty tuning achieved through timing adjustments rather than resource bonuses

**Known Limitations:**
- AI lacks long-term strategic planning (no multi-minute plans, reacts to immediate state)
- AI doesn't use advanced tactics like flanking, feints, or coordinated multi-front attacks
- No explicit communication between AI players - coordination is emergent behavior only
- AI building placement is functional but not optimally efficient (doesn't minimize unit travel distance)
- AI doesn't adapt to specific player strategies (no learning or counter-building)

**Future Enhancement Opportunities:**
- Difficulty levels with tunable parameters (reaction time, production speed, decision quality)
- AI personality types with distinct strategies (rusher, turtle, macro-focused)
- Improved target prioritization (focus harvesters, target low-health units)
- Coordinated attacks between multiple AI players against common enemy
- Better base layout planning (optimized refinery placement near ore, defensive perimeter)

---

## References

- Original AI behavior implementation: src/enemy.js (unit-level behaviors)
- Strategic AI system: src/ai/enemyAIPlayer.js (party-level decisions)
- Pathfinding algorithm: src/game/pathfinding.js (A* implementation)
- RTS AI design patterns: "Behavioral Mathematics for Game AI" chapter on FSM and utility systems
