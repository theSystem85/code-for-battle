// configRegistry.js
// Safe runtime configuration system that works with minified builds
// Instead of using eval(), we store direct references to getters/setters

import {
  XP_MULTIPLIER,
  setXpMultiplier,
  ORE_SPREAD_ENABLED,
  setOreSpreadEnabled,
  ENABLE_ENEMY_CONTROL,
  setEnemyControlEnabled,
  ENABLE_ENEMY_SELECTION,
  setEnemySelectionEnabled,
  CREW_KILL_CHANCE,
  setCrewKillChance,
  TARGETING_SPREAD,
  setTargetingSpread,
  HARVESTER_CAPPACITY,
  setHarvesterCapacity,
  HARVESTER_UNLOAD_TIME,
  setHarvesterUnloadTime,
  TANKER_SUPPLY_CAPACITY,
  setTankerSupplyCapacity,
  ORE_SPREAD_INTERVAL,
  setOreSpreadInterval,
  ORE_SPREAD_PROBABILITY,
  setOreSpreadProbability,
  TANK_FIRE_RANGE,
  setTankFireRange,
  SERVICE_DISCOVERY_RANGE,
  setServiceDiscoveryRange,
  SERVICE_SERVING_RANGE,
  setServiceServingRange,
  DEFAULT_ROTATION_SPEED,
  setDefaultRotationSpeed,
  FAST_ROTATION_SPEED,
  setFastRotationSpeed,
  TANK_BULLET_SPEED,
  setTankBulletSpeed,
  TANK_WAGON_ROT,
  setTankWagonRot,
  TANK_TURRET_ROT,
  setTankTurretRot,
  TURRET_AIMING_THRESHOLD,
  setTurretAimingThreshold,
  PATH_CALC_INTERVAL,
  setPathCalcInterval,
  ATTACK_PATH_CALC_INTERVAL,
  setAttackPathCalcInterval,
  AI_DECISION_INTERVAL,
  setAiDecisionInterval,
  RECOVERY_TANK_RATIO,
  setRecoveryTankRatio,
  PATHFINDING_THRESHOLD,
  setPathfindingThreshold,
  MOVE_TARGET_REACHED_THRESHOLD,
  setMoveTargetReachedThreshold,
  STUCK_CHECK_INTERVAL,
  setStuckCheckInterval,
  STUCK_THRESHOLD,
  setStuckThreshold,
  STUCK_HANDLING_COOLDOWN,
  setStuckHandlingCooldown,
  DODGE_ATTEMPT_COOLDOWN,
  setDodgeAttemptCooldown,
  STATIC_COLLISION_BOUNCE_MULT,
  setStaticCollisionBounceMult,
  STATIC_COLLISION_BOUNCE_OVERLAP,
  setStaticCollisionBounceOverlap,
  STATIC_COLLISION_BOUNCE_MIN,
  setStaticCollisionBounceMin,
  STATIC_COLLISION_BOUNCE_MAX,
  setStaticCollisionBounceMax,
  STREET_SPEED_MULTIPLIER,
  setStreetSpeedMultiplier,
  KEYBOARD_SCROLL_SPEED,
  setKeyboardScrollSpeed,
  DESKTOP_EDGE_AUTOSCROLL_SPEED,
  setDesktopEdgeAutoscrollSpeed,
  DESKTOP_EDGE_AUTOSCROLL_ENABLED,
  setDesktopEdgeAutoscrollEnabled,
  LONG_PRESS_MS,
  setLongPressMs,
  CHEAT_CONSOLE_HISTORY_LIMIT,
  setCheatConsoleHistoryLimit,
  INERTIA_STOP_THRESHOLD,
  setInertiaStopThreshold,
  GAS_REFILL_TIME,
  setGasRefillTime,
  GAS_REFILL_COST,
  setGasRefillCost,
  HELIPAD_FUEL_CAPACITY,
  setHelipadFuelCapacity,
  HELIPAD_RELOAD_TIME,
  setHelipadReloadTime,
  getMobileTankJoystickMapping,
  setMobileTankJoystickMapping,
  getMobileVehicleJoystickMapping,
  setMobileVehicleJoystickMapping,
  getMobileApacheJoystickMapping,
  setMobileApacheJoystickMapping,
  SAFE_RANGE_ENABLED
  , HOWITZER_COST
  , setHowitzerCost
  , HOWITZER_SPEED
  , setHowitzerSpeed
  , HOWITZER_ROTATION_SPEED
  , setHowitzerRotationSpeed
  , HOWITZER_ACCELERATION_MULTIPLIER
  , setHowitzerAccelerationMultiplier
  , HOWITZER_FIRE_RANGE
  , setHowitzerFireRange
  , HOWITZER_MIN_RANGE
  , setHowitzerMinRange
  , HOWITZER_FIREPOWER
  , setHowitzerFirepower
  , HOWITZER_FIRE_COOLDOWN
  , setHowitzerFireCooldown
  , HOWITZER_PROJECTILE_SPEED
  , setHowitzerProjectileSpeed
  , HOWITZER_VISION_RANGE
  , setHowitzerVisionRange
  , HOWITZER_BUILDING_DAMAGE_MULTIPLIER
  , setHowitzerBuildingDamageMultiplier
} from './config.js'

/**
 * Config registry entry
 * @typedef {Object} ConfigEntry
 * @property {string} name - User-friendly name for display
 * @property {string} description - Description of what the config does
 * @property {string} type - Type of value ('number', 'boolean', 'string')
 * @property {Function} get - Getter function that returns current value
 * @property {Function} [set] - Optional setter function (omit for read-only)
 * @property {number} [min] - Minimum value for numbers
 * @property {number} [max] - Maximum value for numbers
 * @property {number} [step] - Step increment for numbers
 * @property {string} category - Category for grouping settings
 */

/**
 * Registry of all runtime-configurable values
 * Keys are internal IDs, values are ConfigEntry objects
 */
export const configRegistry = {
  // Game Balance
  xpMultiplier: {
    name: 'XP Multiplier',
    description: 'Adjusts how quickly units gain experience',
    type: 'number',
    get: () => XP_MULTIPLIER,
    set: setXpMultiplier,
    min: 0,
    max: 10,
    step: 0.5,
    category: 'Game Balance'
  },

  crewKillChance: {
    name: 'Crew Kill Chance',
    description: 'Probability of killing a crew member on hit',
    type: 'number',
    get: () => CREW_KILL_CHANCE,
    set: setCrewKillChance,
    min: 0,
    max: 1,
    step: 0.05,
    category: 'Game Balance'
  },

  tankFireRange: {
    name: 'Tank Fire Range',
    description: 'Maximum firing range for tanks (in tiles)',
    type: 'number',
    get: () => TANK_FIRE_RANGE,
    set: setTankFireRange,
    min: 1,
    max: 20,
    step: 1,
    category: 'Game Balance'
  },

  serviceDiscoveryRange: {
    name: 'Service Discovery Range',
    description: 'Detection range for service vehicles in alert mode (in tiles)',
    type: 'number',
    get: () => SERVICE_DISCOVERY_RANGE,
    set: setServiceDiscoveryRange,
    min: 1,
    max: 20,
    step: 1,
    category: 'Game Balance'
  },

  serviceServingRange: {
    name: 'Service Serving Range',
    description: 'Effective range for service vehicles to assist nearby units (in tiles)',
    type: 'number',
    get: () => SERVICE_SERVING_RANGE,
    set: setServiceServingRange,
    min: 0.5,
    max: 6,
    step: 0.5,
    category: 'Game Balance'
  },

  safeRangeEnabled: {
    name: 'Safe Range Enabled',
    description: 'Enable safe range mode for units',
    type: 'boolean',
    get: () => SAFE_RANGE_ENABLED,
    set: null, // Read-only const
    category: 'Gameplay'
  },

  // Howitzer Configuration
  howitzerCost: {
    name: 'Howitzer Cost',
    description: 'Production cost for howitzer units',
    type: 'number',
    get: () => HOWITZER_COST,
    set: setHowitzerCost,
    min: 500,
    max: 10000,
    step: 50,
    category: 'Howitzer'
  },

  howitzerSpeed: {
    name: 'Howitzer Speed',
    description: 'Base movement speed for howitzers',
    type: 'number',
    get: () => HOWITZER_SPEED,
    set: setHowitzerSpeed,
    min: 0.05,
    max: 1,
    step: 0.01,
    category: 'Howitzer'
  },

  howitzerRotation: {
    name: 'Howitzer Rotation Speed',
    description: 'Hull rotation speed for howitzers',
    type: 'number',
    get: () => HOWITZER_ROTATION_SPEED,
    set: setHowitzerRotationSpeed,
    min: 0.01,
    max: 0.2,
    step: 0.005,
    category: 'Howitzer'
  },

  howitzerAcceleration: {
    name: 'Howitzer Acceleration Multiplier',
    description: 'Acceleration responsiveness for howitzers',
    type: 'number',
    get: () => HOWITZER_ACCELERATION_MULTIPLIER,
    set: setHowitzerAccelerationMultiplier,
    min: 0.1,
    max: 2,
    step: 0.05,
    category: 'Howitzer'
  },

  howitzerFireRange: {
    name: 'Howitzer Fire Range',
    description: 'Maximum firing range for howitzers (tiles)',
    type: 'number',
    get: () => HOWITZER_FIRE_RANGE,
    set: setHowitzerFireRange,
    min: 6,
    max: 40,
    step: 1,
    category: 'Howitzer'
  },

  howitzerMinRange: {
    name: 'Howitzer Minimum Range',
    description: 'Minimum distance before howitzers can fire (tiles)',
    type: 'number',
    get: () => HOWITZER_MIN_RANGE,
    set: setHowitzerMinRange,
    min: 0,
    max: 20,
    step: 1,
    category: 'Howitzer'
  },

  howitzerFirepower: {
    name: 'Howitzer Firepower',
    description: 'Base explosion damage for howitzers',
    type: 'number',
    get: () => HOWITZER_FIREPOWER,
    set: setHowitzerFirepower,
    min: 10,
    max: 200,
    step: 5,
    category: 'Howitzer'
  },

  howitzerCooldown: {
    name: 'Howitzer Reload Time',
    description: 'Cooldown between howitzer shots (ms)',
    type: 'number',
    get: () => HOWITZER_FIRE_COOLDOWN,
    set: setHowitzerFireCooldown,
    min: 1000,
    max: 15000,
    step: 250,
    category: 'Howitzer'
  },

  howitzerProjectileSpeed: {
    name: 'Howitzer Projectile Speed',
    description: 'Travel speed for howitzer shells',
    type: 'number',
    get: () => HOWITZER_PROJECTILE_SPEED,
    set: setHowitzerProjectileSpeed,
    min: 0.1,
    max: 2,
    step: 0.05,
    category: 'Howitzer'
  },

  howitzerVisionRange: {
    name: 'Howitzer Vision Range',
    description: 'Fog-of-war reveal radius for howitzers (tiles)',
    type: 'number',
    get: () => HOWITZER_VISION_RANGE,
    set: setHowitzerVisionRange,
    min: 1,
    max: 35,
    step: 1,
    category: 'Howitzer'
  },

  howitzerBuildingDamageMultiplier: {
    name: 'Howitzer Building Damage Multiplier',
    description: 'Multiplier applied to howitzer explosion damage against buildings',
    type: 'number',
    get: () => HOWITZER_BUILDING_DAMAGE_MULTIPLIER,
    set: setHowitzerBuildingDamageMultiplier,
    min: 0,
    max: 10,
    step: 0.1,
    category: 'Howitzer'
  },

  // Mobile Controls
  mobileTankJoystickMapping: {
    name: 'Mobile Tank Joystick Mapping',
    description:
      'JSON mapping for mobile joysticks when controlling tanks. Valid actions: forward, backward, turnLeft, turnRight, turretLeft, turretRight, fire, ascend, descend, strafeLeft, strafeRight.',
    type: 'string',
    get: () => JSON.stringify(getMobileTankJoystickMapping(), null, 2),
    set: setMobileTankJoystickMapping,
    category: 'Controls'
  },

  mobileVehicleJoystickMapping: {
    name: 'Mobile Vehicle Joystick Mapping',
    description:
      'JSON mapping for mobile joysticks when controlling non-turret vehicles. Valid actions: forward, backward, turnLeft, turnRight, turretLeft, turretRight, fire, ascend, descend, strafeLeft, strafeRight.',
    type: 'string',
    get: () => JSON.stringify(getMobileVehicleJoystickMapping(), null, 2),
    set: setMobileVehicleJoystickMapping,
    category: 'Controls'
  },

  mobileApacheJoystickMapping: {
    name: 'Mobile Apache Joystick Mapping',
    description:
      'JSON mapping for mobile joysticks when controlling Apache helicopters. Valid actions: forward, backward, turnLeft, turnRight, fire, ascend, descend, strafeLeft, strafeRight.',
    type: 'string',
    get: () => JSON.stringify(getMobileApacheJoystickMapping(), null, 2),
    set: setMobileApacheJoystickMapping,
    category: 'Controls'
  },

  // Enemy Control
  enableEnemyControl: {
    name: 'Enable Enemy Control',
    description: 'Allow issuing commands to enemy units when selected',
    type: 'boolean',
    get: () => ENABLE_ENEMY_CONTROL,
    set: setEnemyControlEnabled,
    category: 'Gameplay'
  },

  enableEnemySelection: {
    name: 'Enable Enemy Selection',
    description: 'Allow selecting enemy units to view their HUD',
    type: 'boolean',
    get: () => ENABLE_ENEMY_SELECTION,
    set: setEnemySelectionEnabled,
    category: 'Gameplay'
  },

  // Ore System
  oreSpreadEnabled: {
    name: 'Ore Spread Enabled',
    description: 'Toggle ore spreading for performance',
    type: 'boolean',
    get: () => ORE_SPREAD_ENABLED,
    set: setOreSpreadEnabled,
    category: 'Resources'
  },

  oreSpreadInterval: {
    name: 'Ore Spread Interval',
    description: 'Time between ore spread attempts (ms)',
    type: 'number',
    get: () => ORE_SPREAD_INTERVAL,
    set: setOreSpreadInterval,
    min: 1000,
    max: 60000,
    step: 1000,
    category: 'Resources'
  },

  oreSpreadProbability: {
    name: 'Ore Spread Probability',
    description: 'Chance of ore spreading to adjacent tile',
    type: 'number',
    get: () => ORE_SPREAD_PROBABILITY,
    set: setOreSpreadProbability,
    min: 0,
    max: 1,
    step: 0.01,
    category: 'Resources'
  },

  // Harvester
  harvesterCapacity: {
    name: 'Harvester Capacity',
    description: 'Amount of ore a harvester can carry',
    type: 'number',
    get: () => HARVESTER_CAPPACITY,
    set: setHarvesterCapacity,
    min: 1,
    max: 10,
    step: 1,
    category: 'Resources'
  },

  harvesterUnloadTime: {
    name: 'Harvester Unload Time',
    description: 'Time to unload ore at refinery (ms)',
    type: 'number',
    get: () => HARVESTER_UNLOAD_TIME,
    set: setHarvesterUnloadTime,
    min: 1000,
    max: 30000,
    step: 1000,
    category: 'Resources'
  },

  // Gas System
  tankerSupplyCapacity: {
    name: 'Tanker Supply Capacity',
    description: 'Fuel capacity of tanker truck',
    type: 'number',
    get: () => TANKER_SUPPLY_CAPACITY,
    set: setTankerSupplyCapacity,
    min: 1000,
    max: 100000,
    step: 1000,
    category: 'Resources'
  },

  gasRefillTime: {
    name: 'Gas Refill Time',
    description: 'Time to fully refill at gas station (ms)',
    type: 'number',
    get: () => GAS_REFILL_TIME,
    set: setGasRefillTime,
    min: 1000,
    max: 30000,
    step: 1000,
    category: 'Resources'
  },

  gasRefillCost: {
    name: 'Gas Refill Cost',
    description: 'Cost to refill fuel at gas station',
    type: 'number',
    get: () => GAS_REFILL_COST,
    set: setGasRefillCost,
    min: 0,
    max: 500,
    step: 10,
    category: 'Resources'
  },

  helipadFuelCapacity: {
    name: 'Helipad Fuel Capacity',
    description: 'Fuel reserve capacity stored at helipad',
    type: 'number',
    get: () => HELIPAD_FUEL_CAPACITY,
    set: setHelipadFuelCapacity,
    min: 100,
    max: 20000,
    step: 100,
    category: 'Resources'
  },

  helipadReloadTime: {
    name: 'Helipad Reload Time',
    description: 'Time to fully reload helipad reserve (ms)',
    type: 'number',
    get: () => HELIPAD_RELOAD_TIME,
    set: setHelipadReloadTime,
    min: 1000,
    max: 60000,
    step: 1000,
    category: 'Resources'
  },

  // Combat
  targetingSpread: {
    name: 'Targeting Spread',
    description: 'Inaccuracy of tank fire (pixels)',
    type: 'number',
    get: () => TARGETING_SPREAD,
    set: setTargetingSpread,
    min: 0,
    max: 64,
    step: 1,
    category: 'Combat'
  },

  tankBulletSpeed: {
    name: 'Tank Bullet Speed',
    description: 'Speed of tank projectiles',
    type: 'number',
    get: () => TANK_BULLET_SPEED,
    set: setTankBulletSpeed,
    min: 1,
    max: 20,
    step: 0.5,
    category: 'Combat'
  },

  // Movement & Rotation
  defaultRotationSpeed: {
    name: 'Default Rotation Speed',
    description: 'Base rotation speed for units (radians/frame)',
    type: 'number',
    get: () => DEFAULT_ROTATION_SPEED,
    set: setDefaultRotationSpeed,
    min: 0.01,
    max: 0.2,
    step: 0.01,
    category: 'Movement'
  },

  fastRotationSpeed: {
    name: 'Fast Rotation Speed',
    description: 'Fast rotation speed for units (radians/frame)',
    type: 'number',
    get: () => FAST_ROTATION_SPEED,
    set: setFastRotationSpeed,
    min: 0.01,
    max: 0.3,
    step: 0.01,
    category: 'Movement'
  },

  tankWagonRotation: {
    name: 'Tank Wagon Rotation',
    description: 'Tank body rotation speed (radians/frame)',
    type: 'number',
    get: () => TANK_WAGON_ROT,
    set: setTankWagonRot,
    min: 0.01,
    max: 0.2,
    step: 0.005,
    category: 'Movement'
  },

  tankTurretRotation: {
    name: 'Tank Turret Rotation',
    description: 'Tank turret rotation speed (radians/frame)',
    type: 'number',
    get: () => TANK_TURRET_ROT,
    set: setTankTurretRot,
    min: 0.01,
    max: 0.2,
    step: 0.005,
    category: 'Movement'
  },

  turretAimingThreshold: {
    name: 'Turret Aiming Threshold',
    description: 'Angle tolerance for turret firing (radians)',
    type: 'number',
    get: () => TURRET_AIMING_THRESHOLD,
    set: setTurretAimingThreshold,
    min: 0.01,
    max: 0.5,
    step: 0.01,
    category: 'Movement'
  },

  streetSpeedMultiplier: {
    name: 'Street Speed Multiplier',
    description: 'Speed boost when moving on streets',
    type: 'number',
    get: () => STREET_SPEED_MULTIPLIER,
    set: setStreetSpeedMultiplier,
    min: 1,
    max: 3,
    step: 0.1,
    category: 'Movement'
  },

  // Collision Physics
  staticCollisionBounceMultiplier: {
    name: 'Static Bounce Velocity Mult',
    description: 'Scales how strongly velocity reflects when hitting walls/rocks',
    type: 'number',
    get: () => STATIC_COLLISION_BOUNCE_MULT,
    set: setStaticCollisionBounceMult,
    min: 0,
    max: 2,
    step: 0.05,
    category: 'Collisions'
  },

  staticCollisionBounceOverlap: {
    name: 'Static Bounce Overlap Bonus',
    description: 'Additional impulse added per pixel of penetration into static obstacles',
    type: 'number',
    get: () => STATIC_COLLISION_BOUNCE_OVERLAP,
    set: setStaticCollisionBounceOverlap,
    min: 0,
    max: 1,
    step: 0.01,
    category: 'Collisions'
  },

  staticCollisionBounceMin: {
    name: 'Static Bounce Minimum Impulse',
    description: 'Minimum impulse applied when bouncing off static obstacles',
    type: 'number',
    get: () => STATIC_COLLISION_BOUNCE_MIN,
    set: setStaticCollisionBounceMin,
    min: 0,
    max: 1,
    step: 0.01,
    category: 'Collisions'
  },

  staticCollisionBounceMax: {
    name: 'Static Bounce Maximum Impulse',
    description: 'Upper clamp for bounce impulse against static obstacles',
    type: 'number',
    get: () => STATIC_COLLISION_BOUNCE_MAX,
    set: setStaticCollisionBounceMax,
    min: 0.5,
    max: 4,
    step: 0.1,
    category: 'Collisions'
  },

  keyboardScrollSpeed: {
    name: 'Keyboard Scroll Speed',
    description: 'Camera scroll speed with arrow keys (pixels/frame)',
    type: 'number',
    get: () => KEYBOARD_SCROLL_SPEED,
    set: setKeyboardScrollSpeed,
    min: 1,
    max: 32,
    step: 1,
    category: 'Controls'
  },

  desktopEdgeAutoscrollEnabled: {
    name: 'Desktop Edge Auto-Scroll',
    description: 'Enable or disable edge-triggered camera scrolling on desktop',
    type: 'boolean',
    get: () => DESKTOP_EDGE_AUTOSCROLL_ENABLED,
    set: setDesktopEdgeAutoscrollEnabled,
    category: 'Controls'
  },

  desktopEdgeAutoscrollSpeed: {
    name: 'Desktop Edge Auto-Scroll Speed',
    description: 'Base camera scroll speed when hovering near desktop edges (pixels/ms)',
    type: 'number',
    get: () => DESKTOP_EDGE_AUTOSCROLL_SPEED,
    set: setDesktopEdgeAutoscrollSpeed,
    min: 0,
    max: 2,
    step: 0.05,
    category: 'Controls'
  },

  longPressMs: {
    name: 'Long-Press Tooltip Delay',
    description: 'Time to hold button before production tooltip shows (ms)',
    type: 'number',
    get: () => LONG_PRESS_MS,
    set: setLongPressMs,
    min: 250,
    max: 2000,
    step: 50,
    category: 'Controls'
  },

  cheatConsoleHistoryLimit: {
    name: 'Cheat Console History Limit',
    description: 'Number of cheat commands remembered for ArrowUp/ArrowDown recall',
    type: 'number',
    get: () => CHEAT_CONSOLE_HISTORY_LIMIT,
    set: setCheatConsoleHistoryLimit,
    min: 1,
    max: 100,
    step: 1,
    category: 'Controls'
  },

  inertiaStopThreshold: {
    name: 'Inertia Stop Threshold',
    description: 'Minimum drag velocity before camera inertia stops completely',
    type: 'number',
    get: () => INERTIA_STOP_THRESHOLD,
    set: setInertiaStopThreshold,
    min: 0,
    max: 10,
    step: 0.1,
    category: 'Controls'
  },

  // Pathfinding & AI
  pathCalcInterval: {
    name: 'Path Calculation Interval',
    description: 'Time between path recalculations (ms)',
    type: 'number',
    get: () => PATH_CALC_INTERVAL,
    set: setPathCalcInterval,
    min: 100,
    max: 10000,
    step: 100,
    category: 'AI & Pathfinding'
  },

  attackPathCalcInterval: {
    name: 'Attack Path Calc Interval',
    description: 'Time between attack path recalculations (ms)',
    type: 'number',
    get: () => ATTACK_PATH_CALC_INTERVAL,
    set: setAttackPathCalcInterval,
    min: 500,
    max: 10000,
    step: 500,
    category: 'AI & Pathfinding'
  },

  aiDecisionInterval: {
    name: 'AI Decision Interval',
    description: 'Time between AI decisions (ms)',
    type: 'number',
    get: () => AI_DECISION_INTERVAL,
    set: setAiDecisionInterval,
    min: 100,
    max: 10000,
    step: 100,
    category: 'AI & Pathfinding'
  },

  recoveryTankRatio: {
    name: 'Recovery Tank Ratio',
    description: 'Number of combat units per recovery tank (1:X ratio)',
    type: 'number',
    get: () => RECOVERY_TANK_RATIO,
    set: setRecoveryTankRatio,
    min: 1,
    max: 20,
    step: 1,
    category: 'AI & Pathfinding'
  },

  pathfindingThreshold: {
    name: 'Pathfinding Threshold',
    description: 'Distance to use occupancy map (tiles)',
    type: 'number',
    get: () => PATHFINDING_THRESHOLD,
    set: setPathfindingThreshold,
    min: 1,
    max: 50,
    step: 1,
    category: 'AI & Pathfinding'
  },

  moveTargetReachedThreshold: {
    name: 'Move Target Threshold',
    description: 'Distance to consider target reached (tiles)',
    type: 'number',
    get: () => MOVE_TARGET_REACHED_THRESHOLD,
    set: setMoveTargetReachedThreshold,
    min: 0.5,
    max: 5,
    step: 0.1,
    category: 'AI & Pathfinding'
  },

  // Stuck Detection
  stuckCheckInterval: {
    name: 'Stuck Check Interval',
    description: 'Time between stuck checks (ms)',
    type: 'number',
    get: () => STUCK_CHECK_INTERVAL,
    set: setStuckCheckInterval,
    min: 100,
    max: 5000,
    step: 100,
    category: 'AI & Pathfinding'
  },

  stuckThreshold: {
    name: 'Stuck Threshold',
    description: 'Time before considering unit stuck (ms)',
    type: 'number',
    get: () => STUCK_THRESHOLD,
    set: setStuckThreshold,
    min: 100,
    max: 5000,
    step: 100,
    category: 'AI & Pathfinding'
  },

  stuckHandlingCooldown: {
    name: 'Stuck Handling Cooldown',
    description: 'Cooldown between stuck handling (ms)',
    type: 'number',
    get: () => STUCK_HANDLING_COOLDOWN,
    set: setStuckHandlingCooldown,
    min: 100,
    max: 5000,
    step: 100,
    category: 'AI & Pathfinding'
  },

  dodgeAttemptCooldown: {
    name: 'Dodge Attempt Cooldown',
    description: 'Cooldown between dodge attempts (ms)',
    type: 'number',
    get: () => DODGE_ATTEMPT_COOLDOWN,
    set: setDodgeAttemptCooldown,
    min: 100,
    max: 5000,
    step: 100,
    category: 'AI & Pathfinding'
  }
}

/**
 * Get all config categories
 * @returns {string[]} Array of category names
 */
export function getConfigCategories() {
  const categories = new Set()
  Object.values(configRegistry).forEach(entry => {
    categories.add(entry.category)
  })
  return Array.from(categories).sort()
}

/**
 * Get all config entries in a category
 * @param {string} category - Category name
 * @returns {Object} Map of config IDs to entries
 */
export function getConfigsByCategory(category) {
  const result = {}
  Object.entries(configRegistry).forEach(([id, entry]) => {
    if (entry.category === category) {
      result[id] = entry
    }
  })
  return result
}

/**
 * Get current value of a config
 * @param {string} configId - Config ID from registry
 * @returns {*} Current value
 */
export function getConfigValue(configId) {
  const entry = configRegistry[configId]
  if (!entry) {
    window.logger.warn(`Config not found: ${configId}`)
    return null
  }
  return entry.get()
}

/**
 * Set value of a config (if mutable)
 * @param {string} configId - Config ID from registry
 * @param {*} value - New value
 * @returns {boolean} True if successful
 */
export function setConfigValue(configId, value) {
  const entry = configRegistry[configId]
  if (!entry) {
    window.logger.warn(`Config not found: ${configId}`)
    return false
  }

  if (!entry.set) {
    window.logger.warn(`Config is read-only: ${configId}`)
    return false
  }

  try {
    entry.set(value)
    return true
  } catch (error) {
    console.error(`Failed to set config ${configId}:`, error)
    return false
  }
}

/**
 * Check if a config is mutable
 * @param {string} configId - Config ID from registry
 * @returns {boolean} True if config can be modified
 */
export function isConfigMutable(configId) {
  const entry = configRegistry[configId]
  return !!(entry && entry.set !== null && entry.set !== undefined)
}
