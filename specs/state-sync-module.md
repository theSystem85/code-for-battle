# State Synchronization Module (stateSync.js)

## Context
- Date: 2026-01-31 (Updated: 2026-02-15)
- Prompt Source: Refactoring request to extract state sync functionality
- LLM: GitHub Copilot

## Overview
The `stateSync.js` module is responsible for synchronizing game state between host and clients in multiplayer sessions. It was extracted from `gameCommandSync.js` to improve code organization and maintainability.

**Refactoring Update (2026-02-01)**: The original monolithic `gameCommandSync.js` (2068 lines) has been refactored into a thin coordinator module (302 lines) that imports and re-exports functionality from five specialized modules:
- `commandTypes.js`: Command type definitions and payload creators
- `networkStats.js`: Network usage tracking
- `commandBroadcast.js`: Broadcasting commands to peers
- `stateSync.js`: Game state synchronization (this module)
- `lockstepSync.js`: Deterministic lockstep synchronization

The refactored `gameCommandSync.js` now serves only as a coordinator that:
1. Imports all necessary functions from specialized modules
2. Re-exports everything for backward compatibility
3. Maintains core state (pending commands, listeners)
4. Coordinates command handling between modules

## Module Responsibilities

### 1. State Snapshot Management
- **createGameStateSnapshot()**: Creates a complete snapshot of the current game state including:
  - Units (position, health, direction, combat state, etc.)
  - Buildings (construction progress, health, ammo)
  - Bullets/projectiles (position, velocity, type)
  - Factories (production state, rally points)
  - Explosions and unit wrecks
  - Map configuration (seed, dimensions, player count)
  - Game settings (ore spread enabled state, ore spread interval, shadow of war, etc.)
  - Defeated players tracking
  - Per-party authoritative economy values (`partyMoney`) for remote-client HUD and affordability checks

### 2. Client State Application
- **applyGameStateSnapshot()**: Applies received state snapshots on clients:
  - Initializes client party ID on first snapshot
  - Syncs map configuration and regenerates map if needed
  - Updates all game entities (units, buildings, bullets, etc.)
  - Handles animation state synchronization across machines
  - Manages interpolation state for smooth visuals
  - Syncs game settings and defeated players
  - Syncs the local client party's money from host-authoritative `partyMoney`

### 3. Interpolation System
- **updateUnitInterpolation()**: Provides smooth movement for clients between snapshots:
  - Linear position interpolation for units and bullets
  - Angle interpolation with wraparound handling for directions
  - Turret direction interpolation for units
  - Updates every frame on client side

### 4. Map Synchronization
- **syncClientMap()**: Ensures clients have matching map as host:
  - Applies host's map seed, dimensions, and player count
  - Regenerates map using host configuration
  - Initializes occupancy map for building placement
  - Only runs once per connection

### 5. State Management
- **setClientPartyId()**: Sets the client's controlled party
- **getClientPartyId()**: Returns the client's party ID
- **resetClientState()**: Clears client state on disconnect
- **setProductionControllerRef()**: Links production controller for tech tree sync

### 6. Periodic Synchronization
- **startGameStateSync()**: Starts periodic state broadcasting (host only):
  - Broadcasts snapshots every 100ms to connected clients
  - Clients receive snapshots but don't send state updates
  - Clients only send user commands (move, attack, build)

- **stopGameStateSync()**: Stops periodic synchronization

### 7. Utility Functions
- **notifyClientConnected()**: Hook for host-side initialization when client connects
- **isRemoteClient()**: Checks if session is a remote client
- **createClientStateUpdate()**: Creates partial state update from client (currently unused)

## Module-Level State

### Timing Configuration
- `GAME_STATE_SYNC_INTERVAL_MS`: 100ms sync interval for smooth movement

### Client State Tracking
- `clientInitialized`: Tracks if client received first snapshot
- `clientPartyId`: Stores the party this client controls
- `needsTechTreeSync`: Flags if tech tree needs syncing after buildings
- `mapSynced`: Tracks if map has been regenerated from host data

### Interpolation State
- `unitInterpolationState`: Map of unit IDs to interpolation data
- `bulletInterpolationState`: Map of bullet IDs to interpolation data
- `lastSnapshotTime`: Timestamp of last received snapshot
- `INTERPOLATION_DURATION_MS`: Duration for interpolation (matches sync interval)

### Sync Handles
- `stateSyncHandle`: Interval handle for host state broadcasting
- `clientSyncHandle`: Reserved for future client sync (currently unused)

### References
- `productionControllerRef`: Reference to production controller for tech tree updates

## Key Design Decisions

### Snapshot-Based Architecture
- Host maintains authoritative state and broadcasts snapshots
- Clients receive full state every 100ms for simplicity
- Delta updates planned for future optimization

### Interpolation for Smoothness
- 100ms snapshot interval balances bandwidth and visual smoothness
- Client-side interpolation fills gaps between snapshots
- Position, direction, and turret direction all interpolated

### Animation Synchronization
- Animation times converted to elapsed durations in snapshots
- Clients convert back to absolute times based on local clock
- Handles different `performance.now()` bases across machines

### Map Synchronization
- Host's map seed, dimensions, and player count sent to clients
- Clients regenerate identical map procedurally
- Only regenerates once per connection to avoid disruption

### One-Way State Flow
- Host → Client: Full state snapshots
- Client → Host: Only user commands (move, attack, etc.)
- Simplifies synchronization and reduces bandwidth

### Economy Authority (Multiplayer)
- Host remains authoritative for all party economies.
- Snapshots now carry `partyMoney` keyed by party ID.
- Remote clients adopt their own party's value into `gameState.money` every snapshot.
- This keeps remote human parties in sync for harvester unload income and host-issued party money cheats.

## Dependencies

### Imports
- `gameState.js`: Global game state object
- `buildings.js`: Building placement utilities
- `main.js`: Main game arrays (units, bullets, factories)
- `config.js`: Map dimensions and game settings
- `webrtcSession.js`: Host monitor for connection tracking

### Exports (Public API)
- `setProductionControllerRef(controller)`
- `updateUnitInterpolation()`
- `setClientPartyId(partyId)`
- `getClientPartyId()`
- `resetClientState()`
- `createGameStateSnapshot()` *(exported after refactoring)*
- `applyGameStateSnapshot(snapshot)`
- `startGameStateSync()`
- `stopGameStateSync()`
- `notifyClientConnected()`
- `isRemoteClient()`

## Future Enhancements

### Delta Synchronization
- Track last snapshot hash for delta updates
- Only send changed entities to reduce bandwidth
- Useful for large games with many entities

### Client State Updates
- `_sendClientStateUpdate()` function exists but is unused
- Could enable client reporting of local state changes
- Requires careful design to avoid conflicts

### Improved Interpolation
- Consider cubic/hermite interpolation for smoother curves
- Predictive interpolation based on velocity
- Extrapolation for entities beyond interpolation window

### Bandwidth Optimization
- Compress snapshots using binary format instead of JSON
- Use quantization for position/direction values
- Implement entity culling based on distance/relevance

## Related Modules
- `gameCommandSync.js`: Thin coordinator module that imports/re-exports from all specialized modules (refactored from 2068 to 302 lines)
- `commandTypes.js`: Command type definitions and payload creators (extracted)
- `networkStats.js`: Network statistics tracking (extracted)
- `commandBroadcast.js`: Command broadcasting to peers (extracted)
- `lockstepSync.js`: Deterministic lockstep synchronization (extracted)
- `webrtcSession.js`: Host WebRTC connection management
- `remoteConnection.js`: Client WebRTC connection management
- `lockstepManager.js`: Lockstep tick management
- `inputBuffer.js`: Input buffering for lockstep mode
- `stateHash.js`: State hashing for desync detection

## Testing Considerations
- Mock `performance.now()` for animation timing tests
- Test interpolation edge cases (wraparound, missing state)
- Verify map regeneration produces identical results
- Test snapshot serialization/deserialization
- Validate client initialization flow
- Test state reset on disconnect
