# Feature Specification: Building System Enhancements

**Feature Branch**: `005-building-system-enhancements`  
**Created**: 2025-11-05  
**Status**: Implemented (Retrospective Documentation)  
**Input**: User description: "Drag-and-drop building placement, blueprint mode, chain build mode, construction animations, and individual factory assembly points"

**Note**: This is a retrospective specification documenting an already-implemented feature for the Code for Battle RTS game.

## User Scenarios & Testing

### User Story 1 - Drag-and-Drop Build Mode (Priority: P1)

As a player, I want to drag building buttons from the sidebar directly onto the map, so that I can quickly place buildings without the extra click of selecting first and then placing.

**Why this priority**: Core UX improvement that streamlines the most common building workflow, significantly reducing clicks and improving build speed.

**Independent Test**: Drag a building button from sidebar onto map, verify blueprint appears immediately and building auto-places when construction completes.

**Acceptance Scenarios**:

1. **Given** a building button in sidebar, **When** player clicks and starts dragging, **Then** building icon follows cursor during drag
2. **Given** dragging a building button, **When** cursor moves over map, **Then** placement overlay appears showing building footprint and validity (green/red)
3. **Given** placement overlay is shown, **When** player releases mouse button on valid location, **Then** blueprint mode (BPM) activates at that location
4. **Given** blueprint is placed, **When** displayed on map, **Then** blue overlay with building name text appears at blueprint location
5. **Given** construction completes, **When** building finishes, **Then** building automatically places at blueprint location and blueprint disappears
6. **Given** blueprint placement fails (invalid location), **When** releasing on blocked tiles, **Then** no blueprint is created and building remains in sidebar queue
7. **Given** drag-and-drop is active, **When** player uses feature, **Then** normal click-to-build workflow still functions identically

---

### User Story 2 - Blueprint Mode (Priority: P1)

As a player, I want to see where buildings will be automatically placed when construction completes, so that I can plan my base layout in advance without waiting for each building to finish.

**Why this priority**: Essential for strategic base planning and enables concurrent construction planning, dramatically improving build efficiency.

**Independent Test**: Use drag-and-drop or normal building, verify blue blueprint appears on map, construction completes, building auto-places at blueprint.

**Acceptance Scenarios**:

1. **Given** building is queued for construction, **When** blueprint is placed via drag-and-drop, **Then** blue overlay appears at target location with building name
2. **Given** blueprint is on map, **When** map tiles underneath are checked, **Then** blueprint does NOT block tiles in occupancy map
3. **Given** blueprint exists, **When** construction is in progress, **Then** blueprint remains visible showing pending placement
4. **Given** construction completes, **When** building is ready, **Then** system checks if blueprint location is still valid (unoccupied)
5. **Given** blueprint location is valid, **When** auto-placing, **Then** building appears at blueprint location and blueprint is removed
6. **Given** blueprint location is blocked, **When** auto-placing fails, **Then** building construction is paused/cancelled and player is notified
7. **Given** construction is cancelled (right-click on sidebar), **When** abort occurs, **Then** blueprint is immediately removed from map
8. **Given** normal build workflow is used, **When** NOT using drag-and-drop, **Then** blueprint mode does not interfere

---

### User Story 3 - Chain Build Mode (Priority: P2)

As a player, I want to drag building buttons while holding shift to create lines of buildings, so that I can efficiently build walls, defenses, or power plants in organized patterns.

**Why this priority**: Powerful efficiency feature for creating defensive structures and organized base layouts, though not essential for basic gameplay.

**Independent Test**: Hold shift, drag concrete wall button onto map, release, move cursor to create line, click to lock line, repeat for multiple connected lines.

**Acceptance Scenarios**:

1. **Given** shift key is held and building button is dragged, **When** released on map, **Then** first building blueprint is placed and Chain Build Mode (CBM) activates
2. **Given** CBM is active with first building placed, **When** cursor moves, **Then** preview line of buildings renders from first building to cursor position
3. **Given** preview line is rendering, **When** cursor position changes, **Then** line adjusts to show straight chain of buildings between start and cursor
4. **Given** preview line is shown, **When** player clicks, **Then** entire line of buildings is locked as blueprints and added to build queue
5. **Given** line is locked, **When** shift key is still held, **Then** endpoint becomes new startpoint and new preview line begins
6. **Given** multiple lines are chained, **When** shift key is released, **Then** CBM terminates and no further chains are created
7. **Given** chain of buildings is queued, **When** checking sidebar, **Then** build button stack counter increases by number of buildings in chain
8. **Given** CBM is active, **When** used, **Then** normal building mode and blueprint mode continue working without interference
9. **Given** mobile touch input and a ready building in placement mode, **When** player press-holds on a tile, drags, and releases, **Then** chain preview is shown during hold/drag and all planned buildings are queued in draw order on release
10. **Given** mobile chain placement is released, **When** buildings are queued, **Then** the sidebar build button bulk counter updates immediately and remains accurate until the bulk queue completes
11. **Given** mobile chain-planning mode is active, **When** player draws a curved/freeform touch path, **Then** planning tiles follow the painted path (not only straight lines) and queued buildings preserve painted order on release
12. **Given** mobile chain-planning mode is active, **When** player drags near map edges, **Then** auto-scroll follows the same direction as the drag path and selection-rectangle rendering remains disabled during painting
13. **Given** mobile building placement or planning is active, **When** player double-taps, **Then** active placement/planning cancels and current touch selection intent is cleared
14. **Given** mobile planning mode was used previously, **When** player starts a two-finger drag afterwards, **Then** camera pan still works normally (no stuck touch pointers)
15. **Given** mobile chain-planning mode is active, **When** player performs a two-finger tap-and-release without dragging, **Then** planning mode is canceled immediately
16. **Given** mobile chain-planning mode is active, **When** player performs a two-finger drag to pan the map, **Then** planning mode does not cancel and map panning remains functional
17. **Given** mobile chain-planning mode auto-scroll is triggered near edges, **When** drag continues, **Then** scrolling speed is intentionally reduced to roughly one-third of the prior speed for better control
18. **Given** mobile building placement/construction mode is active (before paint mode begins), **When** player performs a two-finger tap-and-release on the map, **Then** placement mode is canceled immediately
19. **Given** mobile chain-planning starts on a tile that is blocked or outside allowed base proximity, **When** press-hold completes, **Then** paint planning does not activate from that invalid start tile
20. **Given** mobile chain-planning path includes tiles on occupied/blocked ground, **When** overlay renders and queue is committed, **Then** those tiles are skipped from queue and shown as red invalid overlays
21. **Given** mobile chain-planning path has a tile too far from the previous valid planned tile, **When** overlay updates, **Then** that tile is skipped for queuing and marked red as an invalid gap
22. **Given** mobile chain-planning overlay is visible, **When** tiles are painted, **Then** each tile shows its ordering number centered in the lower half of the overlay
23. **Given** planning labels are rendered for mobile placement/planning, **When** building type is concrete wall or radar station, **Then** labels display as 'Wall' and 'Radar' respectively

---

### User Story 4 - Drag-and-Drop for Units (Priority: P2)

As a player, I want to drag unit buttons from sidebar onto the map, so that newly built units automatically move to designated locations without manual commands.

**Why this priority**: Nice-to-have convenience feature that reduces micro-management for unit deployment, especially useful for defensive positioning.

**Independent Test**: Drag tank button onto map location, when tank is built, verify it automatically moves to marked location.

**Acceptance Scenarios**:

1. **Given** unit button in sidebar, **When** dragged onto map, **Then** unit icon follows cursor during drag
2. **Given** dragging unit button, **When** released on map location, **Then** location marker appears showing deployment target
3. **Given** unit is in production, **When** construction completes, **Then** unit spawns at factory normally
4. **Given** unit spawns, **When** deployment location is set, **Then** unit automatically paths to marked location
5. **Given** deployment location is reached, **When** unit arrives, **Then** location marker disappears and unit becomes idle
6. **Given** multiple units are queued with same drag target, **When** each completes, **Then** each unit moves to target area (slightly offset to avoid collision)

---

### User Story 5 - Construction Animations (Priority: P2)

As a player, I want to see buildings materialize gradually with visual effects when placed, so that construction feels more dynamic and visually satisfying.

**Why this priority**: Polish feature that enhances game feel and visual feedback, though not affecting core gameplay mechanics.

**Independent Test**: Place any building, observe 3-second vertical reveal animation followed by 2-second color fade-in.

**Acceptance Scenarios**:

1. **Given** building is placed on map, **When** placement occurs, **Then** building image begins rendering with 0% height (invisible)
2. **Given** construction animation starts, **When** 0-3 seconds elapse, **Then** building height clips from 0% to 100% (bottom to top reveal)
3. **Given** height animation completes at 3s, **When** moving to color phase, **Then** building is full height but desaturated (grayscale)
4. **Given** color animation phase, **When** 3-5 seconds elapse (2s duration), **Then** color fades from grayscale to full color
5. **Given** construction animation is in progress, **When** building is fully animated at 5s, **Then** building appears in final colored state
6. **Given** any building is placed, **When** construction animates, **Then** animation applies universally to all building types

---

### User Story 6 - Individual Factory Assembly Points (Priority: P2)

As a player, I want to set unique rally points for each factory independently, so that different factories can deploy units to different strategic locations.

**Why this priority**: Important for strategic unit deployment and base organization, especially with multiple factories producing different unit types.

**Independent Test**: Build two factories, select first factory and right-click map to set assembly point, select second factory and set different point, verify units from each go to respective points.

**Acceptance Scenarios**:

1. **Given** a factory is built, **When** factory is selected, **Then** its current assembly point marker becomes visible on map
2. **Given** factory is selected, **When** player right-clicks on map, **Then** assembly point is set to clicked location for that specific factory
3. **Given** assembly point is set, **When** factory produces a unit, **Then** unit automatically moves to that factory's assembly point after spawning
4. **Given** multiple factories exist, **When** each has different assembly points, **Then** units from each factory move to their respective points
5. **Given** factory is not selected, **When** viewing map, **Then** assembly point markers are hidden to reduce visual clutter
6. **Given** factory is destroyed, **When** checking map, **Then** assembly point for that factory is removed
7. **Given** assembly point system is active, **When** used, **Then** it replaces old global building factory assembly point system

### Edge Cases

- What happens if blueprint location becomes blocked before construction finishes? (Auto-placement fails, construction may be cancelled or paused, player notified)
- Can chain build mode work with different building types? (No, chain is single building type; changing type ends chain)
- What if unit deployment location is blocked? (Unit still attempts to path, may get stuck or path to nearby free tile using A1 algorithm)
- What if the designated factory spawn tile is blocked by a building or unit? (Spawn logic cascades through neighboring tiles via breadth-first search until it finds the nearest passable, unoccupied tile for spawning)
- Can blueprints be cancelled after placement? (Yes, right-click on sidebar build button cancels construction and removes blueprint)
- What happens if player drags building onto invalid terrain? (Placement overlay shows red, release does not create blueprint)
- Can construction animation be skipped? (No, animation always plays for visual consistency, but brief at 5s total)
- What if multiple factories have overlapping assembly points? (Each factory's units go to their assigned point, may cluster if too close)
- Does chain build mode respect resource limits? (Yes, buildings are queued in production system with normal resource requirements)
- Can assembly points be set outside map boundaries? (No, clicks outside map are ignored, assembly point remains at previous location)
- What happens to drag-and-drop if sidebar is hidden? (Feature unavailable when sidebar not visible, normal workflow required)

## Requirements

### Functional Requirements

**Drag-and-Drop Build Mode:**
- **FR-001**: System MUST allow dragging building buttons from sidebar onto map
- **FR-002**: System MUST display building icon following cursor during drag operation
- **FR-003**: System MUST show placement overlay (green/red) when dragging over map indicating valid/invalid placement
- **FR-004**: System MUST activate blueprint mode when building is released on valid location
- **FR-005**: System MUST NOT interfere with normal click-to-build workflow
- **FR-006**: System MUST prevent blueprint placement on invalid/occupied tiles

**Blueprint Mode (BPM):**
- **FR-007**: System MUST display blue overlay with building name text at blueprint location
- **FR-008**: System MUST NOT block tiles in occupancy map for blueprints (tiles remain passable)
- **FR-009**: System MUST auto-place building at blueprint location when construction completes
- **FR-010**: System MUST verify blueprint location is valid (unoccupied) before auto-placement
- **FR-011**: System MUST remove blueprint immediately when construction is cancelled
- **FR-012**: System MUST handle auto-placement failure gracefully (notify player, pause/cancel construction)
- **FR-013**: System MUST apply same placement rules as manual placement for blueprint validation

**Chain Build Mode (CBM):**
- **FR-014**: System MUST activate CBM when shift + drag building button is released on map
- **FR-015**: System MUST render preview line of buildings from start point to cursor position
- **FR-016**: System MUST create straight line of buildings between two points
- **FR-017**: System MUST lock line of buildings as blueprints when player clicks during preview
- **FR-018**: System MUST make locked endpoint become new startpoint when shift is still held
- **FR-019**: System MUST terminate CBM when shift key is released
- **FR-020**: System MUST update sidebar build button stack counter by number of buildings in chain
- **FR-021**: System MUST NOT interfere with normal building mode or blueprint mode
- **FR-022**: System MUST queue all chained buildings in production system with proper resource management

**Drag-and-Drop for Units (DnDU):**
- **FR-023**: System MUST allow dragging unit buttons from sidebar onto map
- **FR-024**: System MUST display location marker where unit button is released
- **FR-025**: System MUST make newly built units automatically path to marked location
- **FR-026**: System MUST remove location marker when unit reaches destination
- **FR-027**: System MUST handle multiple units with same deployment location (offset positioning)
- **FR-028**: System MUST apply deployment to units from correct factory source

**Construction Animations:**
- **FR-029**: System MUST animate building height from 0% to 100% over 3 seconds (bottom-to-top reveal)
- **FR-030**: System MUST animate building color from grayscale to full color over 2 seconds (after height animation)
- **FR-031**: System MUST apply construction animation universally to all building types
- **FR-032**: System MUST clip building image during height animation (not scale/stretch)
- **FR-033**: System MUST render buildings at full size after animation completes at 5 seconds total

**Individual Factory Assembly Points:**
- **FR-034**: System MUST allow each factory to have independent assembly point
- **FR-035**: System MUST set factory assembly point via right-click on map when factory is selected
- **FR-036**: System MUST display assembly point marker only when factory is selected
- **FR-037**: System MUST make units from each factory move to their factory's specific assembly point
- **FR-038**: System MUST hide assembly point markers when factory is not selected
- **FR-039**: System MUST remove assembly point when factory is destroyed
- **FR-040**: System MUST replace global building factory assembly point system with individual system

**Integration & Compatibility:**
- **FR-041**: System MUST maintain backward compatibility with normal building workflow
- **FR-042**: System MUST save and load blueprint states through save/load system
- **FR-043**: System MUST save and load factory assembly points through save/load system
- **FR-044**: System MUST apply building system enhancements to both player and AI (where applicable)
- **FR-045**: System MUST ensure factories spawn units only on passable, unoccupied tiles by searching outward from the intended spawn tile until a free neighbor is located

**Mobile Drag Enhancements:**
- **FR-045**: System MUST auto-scroll the map only within the final 20px band at the canvas edges during drag-to-build interactions on touch devices, with scroll speed increasing toward the edge and delivering roughly double the previous baseline pace while leaving the central area stationary.

**Loss Handling:**
- **FR-046**: System MUST disable the Buildings production tab when the player has no active construction yards and automatically switch focus to the Units tab when a vehicle factory is available for continued production.

**Rocket Turret Launch Geometry:**
- **FR-047**: System MUST fire each 6-rocket rocket-turret burst from six distinct turret-image coordinates `(60,40)`, `(60,73)`, `(60,107)`, `(130,40)`, `(130,73)`, `(130,107)` mapped to the rendered building footprint, and treat each coordinate as the projectile-center spawn point.
- **FR-048**: System MUST render rocket-turret muzzle flash at the active rocket spawn offset (same 6-point sequence used for projectile spawn), not the building center.
- **FR-049**: System MUST add selected-state ammunition bars and 1px red reload indicators for defensive turrets (`turretGunV1`, `turretGunV2`, `turretGunV3`, `rocketTurret`, `artilleryTurret`) using each turret's ammo/cooldown state.
- **FR-050**: System MUST require ammunition for defensive turret firing and support ammunition-truck resupply (auto-targeting empty allied turrets and manual bidirectional click interactions with move-into cursor feedback).
- **FR-051**: System MUST support a mobile chain-build gesture in building placement mode: press-and-hold a start tile to activate chain preview, drag to extend the line, and place all valid buildings in sequence on touch release while updating the build-button bulk counter for the queued amount.
- **FR-052**: System MUST support freeform mobile bulk-building painting (non-linear strokes), suppress unit selection rectangle while painting, and keep edge auto-scroll aligned with the drag direction during planning.
- **FR-053**: System MUST keep mobile double-tap cancellation behavior for active placement/planning and MUST preserve two-finger pan input immediately after planning sessions by cleaning up touch-pointer state on blocked planning gestures.

### Key Entities

- **Blueprint**: Visual representation of pending building placement (blue overlay with name text), does not block tiles

- **Chain Build Queue**: Ordered list of buildings created via chain build mode, all same type in linear arrangement

- **Assembly Point**: Map coordinate associated with specific factory for automatic unit deployment after production

- **Deployment Marker**: Visual indicator showing where units will automatically move after being built

- **Construction Animation State**: Animation data tracking building reveal phase (0-3s height) and color phase (3-5s color fade)

- **Placement Overlay**: Real-time visual feedback during drag showing valid (green) or invalid (red) placement locations

## Success Criteria

### Measurable Outcomes

**Drag-and-Drop Build Mode:**
- **SC-001**: Player can drag any building from sidebar to map and release to activate blueprint mode
- **SC-002**: Placement overlay provides immediate visual feedback (green/red) during drag operation
- **SC-003**: Blueprint appears at release location within 50ms of mouse release
- **SC-004**: Building auto-places at blueprint location when construction completes successfully
- **SC-005**: Normal click-to-build workflow continues functioning identically alongside drag-and-drop

**Blueprint Mode:**
- **SC-006**: Blue blueprint overlays are clearly visible with building name text readable at all zoom levels
- **SC-007**: Blueprints do not block unit movement (tiles remain passable in occupancy map)
- **SC-008**: Auto-placement succeeds 100% of time when blueprint location remains valid
- **SC-009**: Blueprint removal occurs immediately (< 100ms) when construction is cancelled
- **SC-010**: Multiple blueprints can exist simultaneously without performance degradation

**Chain Build Mode:**
- **SC-011**: Player can create chains of 20+ buildings in single shift-hold session
- **SC-012**: Preview line updates in real-time as cursor moves (< 50ms update latency)
- **SC-013**: Straight lines render accurately between any two points on map
- **SC-014**: Stack counter increments correctly by chain length when line is locked
- **SC-015**: Multiple chains can be created without releasing shift key
- **SC-016**: CBM does not conflict with normal building or blueprint modes

**Drag-and-Drop for Units:**
- **SC-017**: Player can drag any unit button to map to set deployment location
- **SC-018**: Units automatically move to deployment location within 2 seconds of spawning
- **SC-019**: Deployment markers are clearly visible and distinct from other map indicators
- **SC-020**: Multiple units handle overlapping deployment locations without excessive clustering

**Construction Animations:**
- **SC-021**: Height reveal animation completes in exactly 3 seconds (smooth linear interpolation)
- **SC-022**: Color fade animation completes in exactly 2 seconds after height reveal
- **SC-023**: Animations apply to all building types without visual artifacts
- **SC-024**: Building image clipping during animation is clean without texture distortion
- **SC-025**: Total construction visual time is 5 seconds for all buildings uniformly

**Individual Factory Assembly Points:**
- **SC-026**: Each factory maintains independent assembly point that persists until factory destroyed
- **SC-027**: Assembly point markers are visible only when owning factory is selected
- **SC-028**: Units from each factory correctly path to their assigned assembly points 100% of time
- **SC-029**: Player can manage 5+ factories with distinct assembly points without confusion
- **SC-030**: Right-click assembly point assignment feels responsive (< 100ms feedback)

**Performance & Integration:**
- **SC-031**: All building system enhancements maintain 60fps with 50+ active blueprints/animations
- **SC-032**: Drag-and-drop operations have < 50ms input latency for responsive feel
- **SC-033**: Chain build mode handles 50+ buildings without performance degradation
- **SC-034**: Blueprint and assembly point data persist correctly through save/load operations
- **SC-035**: Features integrate seamlessly with existing production queue and resource management

**Mobile Drag Enhancements:**
- **SC-041**: While dragging to build on touch devices, the viewport scrolls no faster than ~150px per second when the pointer is held against the map edge.

**Usability:**
- **SC-036**: Players can use any combination of features without conflicts (drag-and-drop + chain + blueprints)
- **SC-037**: Visual feedback is clear and unambiguous for all features
- **SC-038**: Features reduce total clicks for common building operations by 30-50%
- **SC-039**: New players can discover features intuitively through drag-and-drop affordance
- **SC-040**: Features work consistently across all building and unit types

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
