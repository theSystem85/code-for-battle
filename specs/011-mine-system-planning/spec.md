# Feature Specification: Land Mine System (Mine Layer + Mine Sweeper)

**Feature Branch**: `011-mine-system-planning`  
**Created**: 2025-11-17  
**Status**: Draft  
**Input**: User requirements for land mine mechanics, Mine Layer truck, and Mine Sweeper tank

---

## Overview

Introduce a complete land-mine gameplay system with two new units (Mine Layer truck and Mine Sweeper tank), new HUD indicators, area-deployment tooling, AI behaviors, and visual indicators that integrate with existing ammunition and gas mechanics. The Mine Layer deploys mines that block friendly pathing, damage units/buildings on contact, trigger chain reactions, and display skull overlays. The Mine Sweeper clears mines via planned sweep patterns without taking damage while sweeping. Enemy AI must leverage both units strategically.

> **2025-11-19 Directive**: Resume implementation after Phase 5 with emphasis on finishing all optional steps and verifying Path Planning Feature (PPF) integration for both Mine Layer and Mine Sweeper command flows before advancing to subsequent phases.

---

## Image Assets

- Mine Layer truck sidebar icon: `/public/images/sidebar/mine_layer_sidebar.webp`
- Mine Layer truck map sprite (faces upward): `/public/images/map/units/mine_layer_map.webp`
- Mine Sweeper tank sidebar icon: `/public/images/sidebar/mine_sweeper_sidebar.webp`
- Mine Sweeper tank map sprite: `/public/images/map/units/minesweeper_map.webp`
- Mine indicator overlay: skull icon (light gray, 70% opacity) rendered per deployed mine tile

(_Exact filenames to be confirmed by searching provided asset folders_)

---

## User Stories & Acceptance Criteria

### Story 1 – Directed Mine Deployment (Priority P0)
- **As a** player
- **I want** to command the Mine Layer truck to deploy single-target mines via Ctrl + Left Click
- **So that** I can set precise ambushes and chain commands

**Acceptance**:
1. Ctrl + Left Click queues a mine deployment order at the clicked tile, stacking if earlier deployments still resolving.
2. Path Planning Feature (PPF) visuals (yellow triangles with numbers) indicate deployment order.
3. Mine Layer halts for 4s at each deployment tile, drops mine, and mine arms only after truck vacates tile.
4. Mines consume 1 ammo slot from the truck's 20-mine capacity; HUD ammo bar shows remaining mines.

### Story 2 – Area Minefields (Priority P0)
- **As a** player
- **I want** to drag a rectangle to auto-plan checkerboard mine placements
- **So that** I can quickly mine large areas

**Acceptance**:
1. Dragging a rectangle with the Mine Layer selected enqueues deployments covering the area in a checkerboard pattern (alternating tiles).
2. Uses PPF command chaining; each target tile shows yellow numbered markers until completed.
3. If the truck exhausts mines mid-plan, it automatically pathfinds to the closest ammo truck or Ammunition Factory to reload and resumes remaining deployments.
4. Deploy mode movement speed is 50% of normal; normal speed is 80% of tanker truck speed.

### Story 3 – Mine Mechanics & Indicators (Priority P0)
- Mines have 10 HP, track ownership, and block friendly occupancy so allied units avoid them.
- Any unit entering the tile detonates the mine: 90 damage on the tile, 50 damage to orthogonal neighbors.
- Mines only detonate once a unit’s center moves inside the tile’s inner circle (radius defined by `MINE_TRIGGER_RADIUS`) so grazing the edges no longer triggers explosions instantly.
- Chain reaction: contiguous mines (horizontal/vertical) trigger sequentially when neighbor damage occurs.
- Skull overlay (light gray, 70% opacity) renders on deployed tile until mine destroyed or detonated.
- Destroyed Mine Layer transfers remaining mine payload damage evenly to surrounding tiles upon death.

### Story 4 – Mine Sweeper Tank Operations (Priority P0)
- **As a** player
- **I want** a Mine Sweeper tank that can clear mines safely
- **So that** my army can breach mined zones

**Acceptance**:
1. Mine Sweeper inherits tank movement/armor traits (no turret) with 2× tank armor.
2. Speed is 70% of base tank speed normally, 30% while sweeping; sweeping mode toggles automatically at the start of a sweep rectangle command (before the sweeper enters the marked tile), slowing movement and emitting dust to signal clearance mode.
3. Single click commands standard movement (non-sweeping).
4. Drag rectangle (AGF-style) orders a PPF zig-zag sweep that first approaches the closest edge, then follows a serpentine pass covering every tile; the sweep order flips between left-to-right/top-to-bottom and right-to-left/bottom-to-top depending on which side of the rectangle the sweeper is arriving from so the entry distance stays minimal.
5. Ctrl + Left Click drag paints a freeform area, previewed with orange tile overlay; releasing button locks sweep path using PPF markers only.
6. Mines detonated while sweeper is in sweeping mode deal no damage to the unit; explosions still damage other units/buildings.
7. When a dragged sweep/clear command finishes, play `AllMinesOnTheFieldAreDisarmed.mp3`, and when a Mine Layer completes every tile of a dragged minefield deployment play `The_mine_field_has_been_deployed_and_armed.mp3`.

### Story 5 – Production, Resources, and HUD (Priority P1)
- Mine Layer: cost 1000, 30 HP, rotationSpeed 0.04, uses ammo-truck gas stats, unlocked when Workshop + Ammunition Factory + Vehicle Factory exist.
- Mine Sweeper: cost 1000, requires Workshop + Vehicle Factory, no ammunition bar (gas only).
- Mine Layer uses ammo HUD bar to represent mine payload (20 max) and can be refilled by ammo truck/factory in 7s per reload cycle.
- Destroyed Mine Layer distributes remaining mines' damage to immediate surrounding tiles evenly.

### Story 6 – AI Integration (Priority P1)
- Enemy AI builds Mine Layer once it has Workshop, Ammunition Factory, and Ammunition Truck, prioritizing mining enemy ore fields and approach roads.
- AI monitors mine stock; uses area deployments similar to player to defend key choke points.
- Enemy AI builds Mine Sweeper units once their units are damaged or destroyed by mines and dispatches them to clear dangerous areas.

---

## Functional Requirements (FR)

| ID | Description |
|----|-------------|
| FR-011 | Mine Layer capacity 20; ammo HUD shows remaining mines; refills via ammo truck/factory; consumes 1 ammo per deployment.
| FR-012 | Mine Layer normal speed = tanker_speed × 0.8; deploy-mode speed = tanker_speed × 0.4; must stop 4s per deployment.
| FR-013 | Mine indicator overlay renders skull icon with 70% opacity; persists until mine removed.
| FR-014 | Mines block friendly occupancy map entries but remain passable to enemies; explosion triggers 90/50 damage when a unit center passes through the mine tile's inner circle; chain reaction for adjacent mines.
| FR-015 | Mine Layer destruction deals remaining payload damage evenly to surrounding tiles (including units/buildings).
| FR-016 | Area mining uses checkerboard coverage and PPF chain markers; auto-refill/resume behavior when mines depleted mid-plan. *Updated 2025-11-20 so Mine Layer trucks follow the same serpentine lane ordering as the Mine Sweeper for efficient routing. Updated 2026-09-24: an occupied, mined, or impassable plant tile is skipped and the next deploy order starts. The layer does not wait on that cell. Deployment timing uses the simulation clock so the progress bar advances on a free tile.*
| FR-017 | Mine Sweeper inherits tank chassis stats (except turret) with 2× armor; speed modifiers 0.7/0.3 vs baseline tank.
| FR-018 | Sweeper dust animation plays in front when sweeping; sweeping over mine causes detonation without sweeper damage. Dust age uses the simulation clock and the drawn radius stays positive for the particle lifetime.
| FR-019 | Sweeper rectangle sweep uses PPF-generated zig-zag paths covering all tiles; ctrl-draw sweep paints orange overlay before committing.
| FR-020 | AI builds/uses Mine Layers and Mine Sweepers following specified triggers and priorities.
| FR-021 | Rectangle sweep commands route the sweeper to the nearest entry tile, activate clearance mode (30% speed + dust) before crossing the boundary, and choose the serpentine coverage direction based on the approach side so every marked tile is cleared systematically.
| FR-022 | Mine sweepers must physically traverse each sweep tile before a mine is cleared—no remote detonations triggered solely by entering the sweep area. *Implemented 2025-11-20 via per-tile movement reissue in `commandQueue.js` so mines only clear after the wagon reaches each waypoint.*
| FR-023 | Sweep completions play `AllMinesOnTheFieldAreDisarmed.mp3`, and full mine-field deployments play `The_mine_field_has_been_deployed_and_armed.mp3` when the final tile in the dragged area is armed.
| FR-024 | Sweep commands must lock the Mine Sweeper into sweeping mode and override standard pathfinding so it drives straight serpentine lanes without detouring around friendly mines, preventing damage from mid-sweep reassignments. *Implemented 2025-11-20 via `sweepingOverrideMovement` handling in `commandQueue.js` and `unitMovement.js`.*
| FR-025 | When issuing a single drag-area command to multiple Mine Layers or Mine Sweepers, split the serpentine path into contiguous segments so each unit handles a unique slice without overlap, maximizing throughput. *Implemented 2025-11-20 in `mineInputHandler.js` by partitioning checkerboard paths and sweep paths per unit.*

---

## Non-Functional Requirements

- Maintain 60 FPS by reusing existing PPF and occupancy map utilities; no per-frame heavy scans beyond existing systems.
- Keep new constants in `config.js`; no magic numbers embedded elsewhere.
- Respect modular boundaries: input handling for control schemes, rendering for overlays/animations, logic/AI for behaviors.
- Ensure save/load includes mine state, Mine Layer payload, Mine Sweeper sweep queues, and AI tasks.

---

## Dependencies & Integration Notes

- Reuse existing ammo HUD component for Mine Layer payload; ensure ammo trucks interact through shared ammo refuel logic.
- Extend occupancy map to flag mines for friendly-only avoidance; enemy units may path through but risk triggering.
- Hook into chain-of-commands (PPF) for both Mine Layer and Mine Sweeper operations to maintain consistent UX cues.
- Rendering overlays (skull indicators, orange selection overlay, dust FX) must live in rendering/UI modules, not core logic.
- AI modules (`src/ai/*`) require new strategies for mine deployment and sweep response.

---

## Open Questions

1. Confirm actual asset filenames for Mine Layer/Sweeper; update spec when verified.
2. Determine exact tanker truck speed constant to compute 80%/40% multipliers; document in config.
3. Define precise dust animation asset or reuse existing particle system.

(_Treat unanswered items as NEEDS CLARIFICATION during planning_)
