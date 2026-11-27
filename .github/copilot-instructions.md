# GitHub Copilot Instructions - Gemini RTS Game Clone

Follow the canonical [TODO reconciliation rules](../AGENTS.md#todo-reconciliation) for implementation and [To-Do List skill](../skills/to-do-list/SKILL.md) for backlog management.

## Project Overview
This is a 2D tile-based Real-Time Strategy (RTS) game built with vanilla JavaScript ES6 modules, Vite, and Canvas rendering. The game features unit management, building construction, resource harvesting, AI enemies, and combat mechanics.

## Code Style & Conventions

### Naming Conventions
- **Files**: camelCase.js (e.g., `inputHandler.js`, `gameState.js`)
- **Variables/Functions**: camelCase (e.g., `selectedUnits`, `moveUnitToPosition()`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `TILE_SIZE`, `MAP_WIDTH`)
- **Classes**: PascalCase (e.g., `PathfindingNode`)

### Import/Export Patterns
```javascript
// Always include .js extension
import { gameState } from './gameState.js'
import { TILE_SIZE, MAP_WIDTH } from './config.js'

// Use named exports (avoid default exports)
export const functionName = () => {}
export function calculateDamage() {}
export const CONSTANT_VALUE = 42
```

### Code Style
- **Indentation**: 2 spaces
- **Semicolons**: Not required (omit them)
- **Quotes**: Single quotes preferred
- **Line length**: 120 characters max
- **Comments**: `//` for single line, `/** */` for JSDoc

## Architecture & File Organization

### Core Files
- `src/main.js` - Entry point and main game loop
- `src/gameState.js` - Global game state (DO NOT modify carelessly)
- `src/config.js` - Game constants and configuration
- `src/inputHandler.js` - Mouse/keyboard input handling
- `src/rendering.js` - Main rendering logic

### Specialized Directories
- `src/game/` - Core game mechanics (pathfinding, combat, movement)
- `src/rendering/` - Specialized renderers (minimap, effects, buildings)
- `src/ui/` - User interface components
- `src/ai/` - Enemy AI behaviors and strategies

## AI Agent Coordination

When working on this project, identify your role and follow these guidelines:

### [GAME_LOGIC_AGENT] - Core Game Mechanics
**Focus Areas**: Combat, AI behavior, resource management, victory conditions
**Key Files**: `src/logic.js`, `src/game/*.js`, `src/ai/*.js`, `src/units.js`, `src/buildings.js`
**Conventions**:
- Use `performance.now()` for all timing operations
- Maintain `gameState` consistency across all changes
- Follow existing unit/building data structure patterns
- Export individual functions, not default exports

### [RENDERING_AGENT] - Visual Systems
**Focus Areas**: Canvas optimization, UI components, visual effects, HUD elements
**Key Files**: `src/rendering.js`, `src/rendering/*.js`, `src/ui/*.js`, `*.css`
**Conventions**:
- Use `requestAnimationFrame` for smooth animations
- Separate rendering logic from game logic completely
- Maintain consistent visual styling patterns
- Use CSS for cursor management, not JavaScript DOM manipulation

### [INPUT_CONTROL_AGENT] - User Interaction
**Focus Areas**: Mouse/keyboard input, unit selection, building placement, camera controls
**Key Files**: `src/inputHandler.js`, `src/ui/controls.js`
**Conventions**:
- Use event delegation for better performance
- Maintain `selectedUnits` array consistency
- Follow existing cursor state management patterns
- Use control groups pattern for unit selection (Ctrl+1-9)

### [SYSTEMS_AGENT] - Core Infrastructure
**Focus Areas**: Pathfinding, save/load, audio, configuration, utilities
**Key Files**: `src/config.js`, `src/saveGame.js`, `src/sound.js`, `src/utils.js`, `src/game/pathfinding.js`
**Conventions**:
- Export all constants from `config.js`
- Use consistent error handling patterns
- Maintain backward compatibility for save files
- Follow performance optimization patterns for pathfinding

## Critical Shared Dependencies

### gameState.js - Handle with Care
```javascript
// The central game state - coordinate all changes
export const gameState = {
  money: 10000,
  buildings: [],
  scrollOffset: { x: 0, y: 0 },
  // ... other properties
}
```
**Rules**:
- Always import as `import { gameState } from './gameState.js'`
- Validate state changes don't break other systems
- Use consistent property naming conventions

### config.js - Constants Management
```javascript
// Export constants for game-wide use
export const TILE_SIZE = 32
export const MAP_TILES_X = 100
export const TARGETING_SPREAD = TILE_SIZE * 0.75
```
**Rules**:
- All magic numbers should be defined as constants here
- Use descriptive names with UPPER_SNAKE_CASE
- Group related constants together

## Common Patterns

### Game Loop Integration
```javascript
// Standard update function signature
function updateUnits(deltaTime) {
  // Use deltaTime for frame-rate independent updates
  units.forEach(unit => {
    unit.x += unit.velocityX * deltaTime
  })
}
```

### Canvas Rendering
```javascript
// Standard rendering pattern
function renderBuildings(ctx, buildings, scrollOffset) {
  buildings.forEach(building => {
    const screenX = building.x * TILE_SIZE - scrollOffset.x
    const screenY = building.y * TILE_SIZE - scrollOffset.y
    // Render building
  })
}
```

### Event Handling
```javascript
// Use event delegation and proper coordinate conversion
gameCanvas.addEventListener('click', (event) => {
  const rect = gameCanvas.getBoundingClientRect()
  const canvasX = event.clientX - rect.left
  const canvasY = event.clientY - rect.top
  // Handle click
})
```

### Error Handling
```javascript
// Consistent error handling pattern
function processGameCommand(command) {
  if (!command || typeof command !== 'object') {
    window.logger.warn('Invalid command:', command)
    return false
  }
  
  try {
    return executeCommand(command)
  } catch (error) {
    console.error('Command failed:', error)
    return false
  }
}
```

## Performance Guidelines

1. **Object Pooling**: Reuse objects for bullets, explosions, particles
2. **Canvas Optimization**: Use dirty rectangles, minimize redraws
3. **Pathfinding**: Cache paths, limit search depth with `PATHFINDING_LIMIT`
4. **Audio**: Preload all sounds, manage Audio context properly
5. **Memory**: Clean up event listeners and timers properly

## Testing & Validation

Before suggesting code changes:
1. Ensure imports use `.js` extensions
2. Follow existing naming conventions exactly
3. Maintain separation of concerns (rendering vs logic)
4. Test that changes work with `npm run dev` BUT you can assume that the user has already run the dev server and just needs to reload the page.
5. Validate ESLint compliance with existing rules

## Common Pitfalls to Avoid

1. **Don't** modify `gameState` without considering side effects on other systems
2. **Don't** mix coordinate systems (tile vs pixel coordinates)
3. **Don't** create memory leaks with uncleaned event listeners
4. **Don't** use default exports (use named exports consistently)
5. **Don't** hardcode values that should be in `config.js`
6. **Don't** break the existing modular architecture

## Game-Specific Context

### Coordinate Systems
- **Tile coordinates**: Grid-based (0-99 for 100x100 map)
- **Pixel coordinates**: Canvas-based (multiply tile coords by `TILE_SIZE`)
- **Screen coordinates**: Adjusted for camera scroll offset

### Unit Management
- Units stored in `gameState.units` array
- Selected units tracked in `selectedUnits` array from `inputHandler.js`
- Each unit has: `{id, x, y, type, health, target, path, ...}`

### Building System
- Buildings stored in `gameState.buildings` array
- Each building: `{id, x, y, type, width, height, health, ...}`
- Construction managed through `buildingPlacementMode` state

### Resource System
- Primary resource: money (tracked in `gameState.money`)
- Ore harvesting through harvester units
- Power system for buildings (tracked in `gameState.powerSupply`)

When in doubt, examine existing similar implementations in the codebase and follow established patterns rather than inventing new approaches.

## Additional Rules

- Do not use `require` anywhere in the codebase. Always use ES6 `import` statements for all module imports, including dynamic or conditional imports. This applies to all files, including AI and pathfinding logic.

## Active Technologies
- Vanilla JavaScript (ES2020+) across the Vite build environment and minimal Express.js for STUN signalling + Vite (build/dev), Canvas + WebRTC browser APIs, Express (only for STUN/signalling), native DOM/Fetch APIs (001-add-online-multiplayer)
- LocalStorage for saves + in-memory `gameState` metadata per party (001-add-online-multiplayer)

## Recent Changes
- 001-add-online-multiplayer: Added Vanilla JavaScript (ES2020+) across the Vite build environment and minimal Express.js for STUN signalling + Vite (build/dev), Canvas + WebRTC browser APIs, Express (only for STUN/signalling), native DOM/Fetch APIs
