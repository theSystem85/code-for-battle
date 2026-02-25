# Code for Battle - Documentation

## Enemy Unit Retaliation System

### Overview
This feature ensures that enemy units always attack player units when they are being attacked themselves, unless they are in "flee to base" mode with low health. This makes combat more engaging and realistic while preserving strategic retreat behavior.

### Key Changes Made

#### 1. Damage Tracking System
Added comprehensive tracking when units take damage:
- `unit.lastDamageTime` - Timestamp of when the unit was last damaged
- `unit.lastAttacker` - Reference to the unit/building that attacked
- `unit.isBeingAttacked` - Flag indicating if the unit is currently under attack

#### 2. Enhanced Bullet Collision (`src/game/bulletSystem.js`)
- When a bullet hits an enemy unit, it now tracks the attacker and marks the unit as being attacked
- Added console logging for debugging retaliation behavior
- Works for all projectile types (bullets, rockets)

#### 3. Enhanced Tesla Coil Damage (`src/game/buildingSystem.js`)
- Tesla coil attacks now also track the attacking building as the attacker
- Enemy units can retaliate against Tesla coils and other defensive buildings
- Includes proper damage attribution for building-based attacks

#### 4. Enhanced Explosion Damage (`src/logic.js`)
- Explosion damage now tracks the original shooter as the attacker
- Enemy units will retaliate against the unit that fired the explosive projectile
- Handles area-of-effect damage attribution correctly

#### 5. Priority-Based Target Selection (`src/enemy.js`)
Enhanced enemy AI with new target priority system:
1. **Highest Priority**: Retaliate against attacker when being attacked (unless in flee mode)
2. **Second Priority**: Defend harvesters under attack
3. **Third Priority**: Group attack strategy

Additional improvements:
- Added logic to handle both unit attackers and building attackers (turrets, Tesla coils)
- Retaliation works within reasonable ranges (15 tiles for units, 20 tiles for buildings)
- Imported `shouldRetreatLowHealth` function from enemy strategies

#### 6. Flee Mode Protection
- Units in "flee to base" mode (low health retreat) will NOT retaliate and will continue fleeing
- This preserves the existing low-health retreat behavior at 10% health threshold
- Ensures strategic retreat behavior is maintained for severely damaged units

#### 7. Cleanup and Reset Logic
- `isBeingAttacked` flag resets after 5 seconds of not taking damage
- Invalid attacker references are cleared when attackers are destroyed
- Prevents units from getting stuck in retaliation mode indefinitely

### How It Works

1. **Damage Detection**: When an enemy unit takes damage from any source (bullets, Tesla coils, explosions), it's marked as being attacked and the attacker is recorded

2. **AI Update Cycle**: On the next AI update cycle (every 2 seconds), the unit checks if it should flee due to low health

3. **Target Prioritization**: If not fleeing, the unit prioritizes retaliating against its attacker over all other targets

4. **Pathfinding & Attack**: The unit will pathfind to and attack the unit/building that attacked it

5. **Cleanup**: If the attacker is destroyed or moves too far away, the unit resumes normal AI behavior

6. **Auto-Reset**: The retaliation state automatically clears after 5 seconds of not being attacked

### Benefits

- **More Engaging Combat**: Enemy units fight back when attacked, creating more dynamic battles
- **Realistic Behavior**: Units respond naturally to threats and attacks
- **Strategic Depth**: Players must consider retaliation when engaging enemy forces
- **Preserved Retreat Logic**: Low-health units still flee to base as intended
- **Balanced Gameplay**: Retaliation has range limits and time constraints to prevent exploitation

### Technical Implementation

The system integrates seamlessly with existing AI strategies and combat systems:
- Uses existing `shouldRetreatLowHealth` function to respect flee mode
- Leverages current target selection and pathfinding systems
- Maintains compatibility with group attack strategies
- Includes proper cleanup to prevent memory leaks or stuck states

This ensures that enemy units will always fight back when attacked, making combat more engaging and realistic, while preserving the strategic "flee to base" behavior for severely damaged units.

---

## Tank Image Rendering System

### Overview
The Tank Image Rendering System provides an alternative visual representation for tanks using 3 separate image assets (wagon, turret, gun barrel) with transparency. This system allows for more realistic tank animations with proper component mounting, independent turret rotation, recoil effects, and muzzle flash positioning.

### Key Features Implemented

#### 1. ✅ **Configurable Mounting Points**
- Created `src/tankImageConfig.json` with configurable mount points for turret and barrel positioning
- Turret mount point: `(19, 32)` pixels from wagon top-left
- Barrel mount point: `(17, 35)` pixels from turret top-left  
- Muzzle flash offset: `(2, 64)` pixels from barrel top-left
- Added utility function `getTankImageConfig()` for external access
- Created development helper `src/tankConfigUtil.js` for easy debugging

#### 2. ✅ **Preserved Aspect Ratios**
- Completely rewrote rendering logic to use original image dimensions
- Each component (wagon, turret, barrel) maintains original size relationships
- Wagon scales to fit within tile boundaries, turret and barrel use same scale to preserve proportions
- Only the barrel is allowed to extend beyond tile boundaries when necessary

#### 3. ✅ **Smart Turret Rotation Logic**
- **When tank has a target**: Turret rotates independently to track the target (`unit.turretDirection`)
- **When tank has no target**: Turret follows wagon direction for unified movement
- Wagon always rotates to match movement direction (`unit.direction`)

#### 4. ✅ **Proper Direction Alignment**
- Image assets are designed with default facing direction downward (bottom)
- Wagon rotation now properly aligns with game movement directions:
  - `unit.direction = 0` (right) → wagon faces right
  - `unit.direction = π/2` (down) → wagon faces down (natural asset direction)
  - `unit.direction = π` (left) → wagon faces left
  - `unit.direction = 3π/2` (up) → wagon faces up

#### 5. 🎯 **Additional Features Included**
- **Coordinate system precision**: Proper world-to-screen coordinate transformations
- **Recoil animation**: Gun barrel (not turret) moves backward when firing in correct direction
- **Muzzle flash**: Positioned accurately using configurable offsets, follows recoil movement
- **Performance**: Image caching and loading state management
- **Fallback system**: Graceful degradation to original rendering if images fail
- **T key toggle**: Runtime switching between rendering systems
- **Help documentation**: Updated in-game help system and README
- **Size constraint**: All components scaled to fit within 64px tile boundaries

### File Structure
```
src/
├── tankImageConfig.json          # Configurable mount points
├── tankConfigUtil.js             # Development utility
├── rendering/
│   └── tankImageRenderer.js      # Complete image-based rendering
├── input/
│   └── helpSystem.js             # Updated with T key documentation
└── README.md                     # Comprehensive documentation

public/images/map/units/
├── tank_wagon.png                # Tank chassis image
├── turret_no_barrel.png          # Turret without barrel
└── gun_barrel.png                # Gun barrel component
```

### User Experience
- **T key**: Toggle tank image rendering on/off with sound feedback
- **Y key (configurable)**: Cycle unit/building image opacity for debugging (`100% -> 50% -> 0% -> 100%`)
- **Visual feedback**: Notification shows current rendering mode status
- **No performance impact**: Images load once and are cached
- **Seamless fallback**: If images don't load, original rendering continues working

### Debug Opacity Mode
- Intended for debugging map overlays/pathing, not normal gameplay.
- Triggered via keybinding action `Cycle Unit/Building Image Opacity` (default `Y`).
- Can be remapped in the Settings keybindings editor like other keyboard actions.
- Affects unit/building base sprite pass only; gameplay state and overlays remain active.

### Technical Implementation

#### Image Loading and Caching
```javascript
// Images are preloaded at game startup and cached for performance
export function preloadTankImages(callback) {
  // Loads tank_wagon.png, turret_no_barrel.png, gun_barrel.png
  // Calls callback when all images are ready or on error
}
```

#### Rendering Logic
The system uses a layered approach:
1. **Wagon Rendering**: Rotates with movement direction, preserves aspect ratio, fits within tile
2. **Turret Positioning**: Uses configurable mount point on wagon
3. **Turret Rotation**: Independent rotation when targeting, follows wagon when idle
4. **Barrel Mounting**: Positioned on turret using configurable mount point
5. **Recoil Effects**: Gun barrel recoils backward opposite to firing direction
6. **Effects**: Muzzle flash positioned at barrel tip, follows recoil movement

#### Configuration System
Mount points are easily adjustable via JSON configuration:
```json
{
  "tankImageConfig": {
    "turretMountPoint": { "x": 19, "y": 32 },
    "barrelMountPoint": { "x": 17, "y": 35 },
    "muzzleFlashOffset": { "x": 2, "y": 64 }
  }
}
```

#### Integration with Game Systems
- **Unit Renderer**: Conditionally uses image rendering when enabled and images are loaded
- **Keyboard Handler**: T key toggle with notification and sound feedback
- **Help System**: Updated documentation for the new toggle key
- **Game State**: `useTankImages` flag controls rendering mode

### Benefits

- **Enhanced Visual Appeal**: More realistic tank representation with proper component separation
- **Configurable Positioning**: Easy adjustment of component mounting without code changes
- **Performance Optimized**: Image caching and efficient rendering with fallback support
- **Preserved Gameplay**: No impact on game mechanics, purely visual enhancement
- **User Choice**: Players can toggle between rendering systems based on preference
- **Quality Preservation**: Original image aspect ratios maintained for authentic look

### How It Works

1. **Startup**: Tank images are preloaded alongside other game textures
2. **Runtime Toggle**: T key switches between image-based and original rendering
3. **Rendering Decision**: Each frame checks if image rendering is enabled and images are available
4. **Component Rendering**: When active, renders wagon → turret → barrel → effects in sequence
5. **Recoil Physics**: Gun barrel recoils backward in turret's local coordinate system (`recoilLocalX = -recoilOffset`, `recoilLocalY = 0`)
6. **Fallback**: If images fail to load, automatically uses original rendering system
7. **Configuration**: Mount points can be tweaked in JSON file and take effect on reload

#### Recoil Direction Examples:
- **Any turret direction**: Barrel recoils backward along the turret's local X-axis (negative X in turret's coordinate system)
- **Turret rotated to face target**: Recoil automatically goes opposite to target direction due to coordinate system rotation
- **Visual result**: Recoil appears to go backward from wherever the turret is visually pointing

*Note: Recoil is applied in the turret's local coordinate system (-X direction) which automatically gives the correct visual direction because the entire coordinate system is rotated with the turret.*

This system provides a sophisticated visual upgrade while maintaining full compatibility with existing game mechanics and ensuring robust fallback behavior.

---

## Recoil Debugging System

### Console Commands for Adjusting Recoil Direction

The recoil direction can be fine-tuned using browser console commands:

#### Available Commands:
```javascript
// Set recoil offset in degrees (0-360)
tankRecoilDebug.setOffset(180)    // Try 180° for opposite direction
tankRecoilDebug.setOffset(90)     // Try 90° for perpendicular
tankRecoilDebug.setOffset(270)    // Try 270° for other perpendicular

// Get current offset
tankRecoilDebug.getOffset()

// Show test values for quick testing
tankRecoilDebug.test()
```

#### How to Find the Correct Value:
1. **Open Browser Console**: Press F12 → Console tab
2. **Start with test values**: Run `tankRecoilDebug.test()` to see suggested offsets
3. **Test different angles**: Try `tankRecoilDebug.setOffset(180)`, `tankRecoilDebug.setOffset(90)`, etc.
4. **Fire your tank**: Watch the recoil direction after each adjustment
5. **Fine-tune**: Adjust in smaller increments (e.g., `tankRecoilDebug.setOffset(185)`)
6. **Save the value**: Once you find the correct offset, update `recoilRotationOffset.degrees` in `src/tankImageConfig.json`

#### Expected Results:
- **0°**: Recoil goes backward along turret's local X-axis
- **90°**: Recoil goes perpendicular (left side of turret direction)
- **180°**: Recoil goes forward (opposite of backward)
- **270°**: Recoil goes perpendicular (right side of turret direction)

The correct value should make the recoil go opposite to the firing direction regardless of where the target is relative to your tank.

---

## Tactical Retreat System (Tank Units)

The tactical retreat system for tanks is designed for precise, realistic, and responsive retreat maneuvers. The process is as follows:

1. **Retreat Point Established:** The clicked destination becomes the exact retreat point for each selected tank.
2. **Optimal Path Selection:** Each tank independently determines the most efficient way to move to the retreat point—either forwards or backwards. This decision is based on whichever direction (front or back) requires less rotation to face the retreat point.
3. **Rotation Before Movement:** The tank's body (wagon) must first rotate on the spot until it is perfectly aligned with the retreat point.
    - If moving forwards, the front of the tank will point directly at the retreat point.
    - If moving backwards, the rear of the tank will point directly at the retreat point.
    - Crucially, the tank must not begin moving along its path until this rotation is complete.
4. **Direct, Axis-Aligned Movement:** Once correctly oriented, the tank moves in a straight line to the retreat point without any deviation or pathfinding. Movement is strictly along the tank's longitudinal axis.
5. **Combat Readiness:** While retreating, the tank's turret remains independent and will continue to track and fire upon its designated target if it remains in range.
6. **Arrival and Completion:** The tank stops precisely at the retreat point, and its retreat state is cleared, awaiting new orders.

---

## 3-Star Level System Implementation

### Overview
The 3-Star Level System is a comprehensive unit progression system that allows combat units (excluding harvesters) to gain experience through combat and level up to become more powerful. Units progress from level 0 to level 3, with each level providing meaningful bonuses to combat effectiveness.

### ✅ **Core Leveling System**

#### Experience Mechanics
- **Experience Source**: Units gain experience equal to the cost of enemy units they kill
- **Starting Level**: All combat units begin at level 0
- **Maximum Level**: Level 3 (3 stars)
- **Experience Requirements**:
  - **Level 1**: 2x unit base cost (e.g., 2000 exp for a 1000-cost tank)
  - **Level 2**: 4x unit base cost (e.g., 4000 exp for a 1000-cost tank)
  - **Level 3**: 6x unit base cost (e.g., 6000 exp for a 1000-cost tank)
- **Experience Reset**: Experience counter resets to 0 after each level up

#### Unit Exclusions
- **Harvesters**: Explicitly excluded from the leveling system (they don't gain levels or bonuses)
- **Non-combat units**: Only units that participate in combat can level up

### ✅ **Level Bonuses**

#### Level 1: Enhanced Range
- **Bonus**: 20% increase in firing range
- **Effect**: Units can engage enemies from further away
- **Implementation**: Applies to all combat range calculations via `getEffectiveFireRange()`

#### Level 2: Improved Armor
- **Bonus**: 50% armor increase
- **Effect**: Units take significantly less damage from all sources
- **Implementation**: Integrates with existing armor system in bullet collision detection

#### Level 3: Elite Status
- **Self-Repair**: Units automatically heal 1% of max health every 3 seconds when stationary
- **Fire Rate Boost**: 33% increase in fire rate (faster shooting)
- **Elite Capabilities**: Combination makes units highly effective in prolonged combat

### ✅ **Visual Indicators**

#### Level Stars
- **Display**: Up to 3 bright yellow stars above the unit's health bar
- **Position**: Centered above health bar, positioned at unit center
- **Design**: 5-pointed stars with gold fill and orange outline
- **Visibility**: Always visible when unit has levels > 0

#### Experience Progress Bar
- **Display**: 2px high yellow progress bar overlaying the top of the health bar
- **Color**: Semi-transparent yellow (rgba(255, 255, 0, 0.7))
- **Visibility**: Only shown when unit is damaged or selected (same as health bar)
- **Progress**: Shows percentage progress toward next level (0-100%)
- **Max Level**: Hidden when unit reaches level 3

### ✅ **Universal Implementation**

#### Player Units
- **Integration**: Full leveling system via `createUnit()` function in `src/units.js`
- **Initialization**: Automatic leveling system setup for all new combat units
- **Persistence**: Levels and experience preserved through save/load system

#### AI Units
- **Parity**: AI units have identical leveling system to player units
- **Implementation**: Integrated into enemy unit creation in `src/enemy.js`
- **Fairness**: AI units level up at same rate and gain same bonuses as player units

#### Experience Awarding
- **Universal**: Both player and AI units award experience when killed
- **Implementation**: Integrated into bullet system (`src/game/bulletSystem.js`)
- **Validation**: Only awards experience for valid kills (different owners, non-harvesters)

### ✅ **Combat Integration**

#### Range Bonuses
- **Function**: `getEffectiveFireRange(unit)` in `src/game/unitCombat.js`
- **Application**: All combat range checks use effective range including bonuses
- **Scope**: Applies to standard combat, alert mode scanning, and chase thresholds

#### Fire Rate Bonuses
- **Function**: `getEffectiveFireRate(unit, baseFireRate)` in `src/game/unitCombat.js`
- **Application**: All firing systems use effective fire rate including bonuses
- **Scope**: Affects all unit types (tanks, rocket tanks, tank variants)

#### Armor Bonuses
- **Integration**: Existing armor system in `src/game/bulletSystem.js`
- **Calculation**: Damage reduction via division by armor multiplier
- **Enhancement**: Level 2 bonus increases existing armor effectiveness

#### Self-Repair System
- **Function**: `handleSelfRepair(unit, now)` in `src/utils.js`
- **Integration**: Called in main game update loop (`src/updateGame.js`)
- **Conditions**: Only repairs when unit is stationary (not moving)
- **Rate**: 1% of max health every 3 seconds

### ✅ **Technical Implementation**

#### Core Functions (`src/utils.js`)
- `initializeUnitLeveling(unit)` - Sets up leveling properties
- `awardExperience(unit, killedUnit)` - Awards experience for kills
- `checkLevelUp(unit)` - Processes level advancement
- `applyLevelBonuses(unit)` - Applies level-based bonuses
- `getExperienceProgress(unit)` - Calculates progress percentage
- `handleSelfRepair(unit, now)` - Manages level 3 self-repair

#### Visual Rendering (`src/rendering/unitRenderer.js`)
- `renderLevelStars(ctx, unit, scrollOffset)` - Renders level stars
- Enhanced `renderHealthBar()` - Includes experience progress overlay
- Integration with both image-based and fallback rendering systems

#### Experience Awarding (`src/game/bulletSystem.js`)
- Integrated into unit destruction logic
- Validates shooter and target ownership
- Excludes harvesters from experience system

### ✅ **Testing Features**

#### Debug Commands
- `debugAddExperience(amount)` - Manually add experience to selected units
- `debugShowUnitStats()` - Display detailed unit progression information
- **Usage**: Available in browser console for testing and debugging

#### Console Logging
- Level up notifications with detailed bonus information
- Experience tracking for debugging purposes
- Bonus application confirmation

### ✅ **Compatibility**

#### Save/Load System
- **Backward Compatible**: Doesn't break existing save games
- **Forward Compatible**: Preserves levels and experience in saved games
- **Auto-Initialization**: Missing properties are automatically initialized on load

#### Existing Systems
- **Cheat System**: Compatible with god mode and other cheats
- **Sound System**: Extensible for level up sound effects
- **UI System**: Integrates seamlessly with existing health bar rendering

### 🎮 **How to Use**

#### For Players
1. **Engage in Combat**: Build tanks and fight enemy units
2. **Gain Experience**: Units automatically gain experience from kills
3. **Watch Progress**: Yellow progress bar shows advancement toward next level
4. **Observe Bonuses**: Stars indicate level, bonuses apply automatically
5. **Strategic Value**: Higher level units are more effective in combat

#### For Developers
1. **Testing**: Use `debugAddExperience(2000)` to quickly test leveling
2. **Debugging**: Use `debugShowUnitStats()` to inspect unit progression
3. **Monitoring**: Check console for level up notifications and bonus details

### Benefits

- **Progression System**: Adds long-term unit development and attachment
- **Strategic Depth**: Players must balance unit preservation vs. aggressive tactics
- **Visual Feedback**: Clear indicators of unit progression and power level
- **Balanced Gameplay**: Meaningful but not overwhelming bonuses
- **Universal Fairness**: AI and player units have identical progression systems

This system transforms combat from simple unit expenditure to strategic unit development, encouraging players to keep experienced units alive while providing clear visual feedback on unit capabilities and progression.
---

## Online Multiplayer STUN Helper

- Start the Express-based signalling helper with `npm run stun` before sending or opening invite links.
- Run `npm run dev` for the Vite client simultaneously so the helper listening on http://localhost:3333 can fulfill `/signalling/offer`, `/signalling/answer`, `/signalling/candidate`, and `/game-instance/:id/invite-regenerate` per `specs/001-add-online-multiplayer/contracts/multiplayer-api.yaml`.
- Keep both processes alive while testing invites so browsers can exchange WebRTC metadata without a dedicated gaming server.

---

## Multiplayer Network Stability (Human + AI, 2-4 Players)

### Why multiplayer connectivity can become unstable

Common causes in the current WebRTC + deterministic lockstep architecture:

- **Transient network jitter / packet loss** can delay or drop control payloads.
- **Data channel stalls** may occur while ICE is recovering even when browser tab is still open.
- **Lockstep sensitivity** means delayed remote inputs can stall deterministic progression.
- **Immediate AI takeover on disconnect** can cause abrupt ownership changes during short-lived outages.

### Improvements implemented

1. **Heartbeat-based responsiveness detection**
   - Host sends `heartbeat-ping` regularly.
   - Clients reply with `heartbeat-pong`.
   - Missing heartbeats beyond timeout mark the client as unresponsive.

2. **Global forced pause during unresponsive windows**
   - Host pauses the match while waiting for reconnection.
   - This avoids lockstep divergence and unfair gameplay progression.

3. **Unresponsiveness timer shown to everyone**
   - Host sidebar shows per-party reconnect timer (`Reconnecting MM:SS`).
   - Clients display a banner including reconnecting alias + timer.

4. **Delayed AI takeover (grace period)**
   - AI takeover no longer happens immediately.
   - A configurable grace period allows reconnect before ownership returns to AI.

5. **Per-party responsiveness state for mixed constellations**
   - Responsiveness metadata is stored on each party.
   - Supports combinations of AI/human parties in 2, 3, and 4 player games.

### Runtime flow diagram

```mermaid
flowchart TD
    A[Host status interval tick] --> B[Send host-status to all sessions]
    B --> C[Send heartbeat-ping]
    C --> D{Client replies heartbeat-pong in time?}
    D -->|Yes| E[Mark session responsive]
    E --> F{Any unresponsive sessions left?}
    F -->|No| G[Release forced pause if host did not pause manually]
    D -->|No| H[Mark party unresponsiveSince]
    H --> I[Force gamePaused=true]
    I --> J[Broadcast unresponsive metadata + timer]
    J --> K[Start AI fallback grace timer]
    K --> L{Recovered before grace timeout?}
    L -->|Yes| E
    L -->|No| M[Set party back to AI + emit reactivation event]
```

### Message-level sequence

```mermaid
sequenceDiagram
    participant Host
    participant Client
    participant UI

    loop every status interval
      Host->>Client: host-status {paused, running, unresponsive}
      Host->>Client: heartbeat-ping
      Client->>Host: heartbeat-pong
    end

    alt Heartbeat timeout
      Host->>Host: mark unresponsiveSince
      Host->>Host: force game pause
      Host->>UI: host notification + host timer in party row
      Host->>Client: host-status with unresponsive timer context
      Client->>UI: show reconnect banner with MM:SS
    else Heartbeat restored
      Host->>Host: clear unresponsiveSince
      Host->>Host: release forced pause
      Host->>UI: resumed notification
      Client->>UI: hide reconnect banner
    end

    alt Grace timeout expires
      Host->>Host: party ownership -> AI
      Host->>UI: notify AI takeover
    end
```

### Component architecture

```mermaid
graph LR
    A[src/network/webrtcSession.js] --> B[Heartbeat + unresponsive detector]
    A --> C[Forced pause controller]
    A --> D[Delayed AI takeover]
    A --> E[src/network/multiplayerStore.js]
    E --> F[party.unresponsiveSince state]
    F --> G[src/ui/sidebarMultiplayer.js host timer]
    A --> H[src/ui/remoteInviteLanding.js client banner + timer]
    A --> I[src/network/gameCommandSync.js state sync + lockstep integration]
```

### 2-4 player compatibility notes

- Party metadata remains per-party (`partyId`) and scales with configured party count.
- Unresponsive handling is scoped to affected remote party and does not assume a fixed 2-player model.
- AI/human combinations remain valid because ownership (`aiActive`) and responsiveness (`unresponsiveSince`) are independent fields.
