/**
 * Unit tests for config.js
 *
 * Tests configuration constants, setter functions, and joystick mappings
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Import config functions and constants
import {
  TILE_SIZE,
  MAP_TILES_X,
  MAP_TILES_Y,
  MIN_MAP_TILES,
  DEFAULT_MAP_TILES_X,
  DEFAULT_MAP_TILES_Y,
  setMapDimensions,
  getMapDimensions,
  getMapWidth,
  getMapHeight,
  UNIT_COSTS,
  UNIT_PROPERTIES,
  PARTY_COLORS,
  PLAYER_POSITIONS,
  DIRECTIONS,
  HIT_ZONE_DAMAGE_MULTIPLIERS,
  TANK_V3_BURST,
  setXpMultiplier,
  XP_MULTIPLIER,
  setCrewKillChance,
  CREW_KILL_CHANCE,
  setEnemySelectionEnabled,
  ENABLE_ENEMY_SELECTION,
  setEnemyControlEnabled,
  ENABLE_ENEMY_CONTROL,
  setTargetingSpread,
  TARGETING_SPREAD,
  setHarvesterCapacity,
  HARVESTER_CAPPACITY,
  setHarvesterUnloadTime,
  HARVESTER_UNLOAD_TIME,
  setTankerSupplyCapacity,
  TANKER_SUPPLY_CAPACITY,
  setInertiaStopThreshold,
  INERTIA_STOP_THRESHOLD,
  setStaticCollisionBounceMult,
  STATIC_COLLISION_BOUNCE_MULT,
  setKeyboardScrollSpeed,
  KEYBOARD_SCROLL_SPEED,
  setTankFireRange,
  TANK_FIRE_RANGE,
  SERVICE_DISCOVERY_RANGE,
  setServiceDiscoveryRange,
  setServiceServingRange,
  SERVICE_SERVING_RANGE,
  setDefaultRotationSpeed,
  DEFAULT_ROTATION_SPEED,
  setFastRotationSpeed,
  FAST_ROTATION_SPEED,
  setTankBulletSpeed,
  TANK_BULLET_SPEED,
  setTankWagonRot,
  TANK_WAGON_ROT,
  setTankTurretRot,
  TANK_TURRET_ROT,
  setTurretAimingThreshold,
  TURRET_AIMING_THRESHOLD,
  setMaxSmokeParticles,
  MAX_SMOKE_PARTICLES,
  setOreSpreadInterval,
  ORE_SPREAD_INTERVAL,
  setOreSpreadProbability,
  ORE_SPREAD_PROBABILITY,
  setOreSpreadEnabled,
  ORE_SPREAD_ENABLED,
  setPathCalcInterval,
  PATH_CALC_INTERVAL,
  setPathCacheTtl,
  PATH_CACHE_TTL,
  setMaxPathsPerCycle,
  MAX_PATHS_PER_CYCLE,
  setAiUpdateFrameSkip,
  AI_UPDATE_FRAME_SKIP,
  setAttackPathCalcInterval,
  ATTACK_PATH_CALC_INTERVAL,
  setAiDecisionInterval,
  AI_DECISION_INTERVAL,
  setRecoveryTankRatio,
  RECOVERY_TANK_RATIO,
  setPathfindingThreshold,
  PATHFINDING_THRESHOLD,
  setMoveTargetReachedThreshold,
  MOVE_TARGET_REACHED_THRESHOLD,
  setStuckCheckInterval,
  STUCK_CHECK_INTERVAL,
  setStuckThreshold,
  STUCK_THRESHOLD,
  setStuckHandlingCooldown,
  STUCK_HANDLING_COOLDOWN,
  setDodgeAttemptCooldown,
  DODGE_ATTEMPT_COOLDOWN,
  setStreetSpeedMultiplier,
  STREET_SPEED_MULTIPLIER,
  setGasRefillTime,
  GAS_REFILL_TIME,
  setGasRefillCost,
  GAS_REFILL_COST,
  setHelipadFuelCapacity,
  HELIPAD_FUEL_CAPACITY,
  setHelipadReloadTime,
  HELIPAD_RELOAD_TIME,
  setAmmoResupplyTime,
  AMMO_RESUPPLY_TIME,
  setAmmoFactoryRange,
  AMMO_FACTORY_RANGE,
  setAmmoTruckRange,
  AMMO_TRUCK_RANGE,
  setAmmoTruckCargo,
  AMMO_TRUCK_CARGO,
  setHelipadAmmoReserve,
  HELIPAD_AMMO_RESERVE,
  setAmmoFactoryParticleCount,
  AMMO_FACTORY_PARTICLE_COUNT,
  setAmmoParticleDamage,
  AMMO_PARTICLE_DAMAGE,
  setMineCapacity,
  setMineHealth,
  setMineDamageCenter,
  setMineDeployStopTime,
  setMineArmDelay,
  setMineExplosionRadius,
  setMineTriggerRadius,
  MINE_CAPACITY,
  MINE_HEALTH,
  MINE_DAMAGE_CENTER,
  MINE_DEPLOY_STOP_TIME,
  MINE_ARM_DELAY,
  MINE_EXPLOSION_RADIUS,
  MINE_TRIGGER_RADIUS,
  setHowitzerCost,
  HOWITZER_COST,
  setHowitzerSpeed,
  HOWITZER_SPEED,
  setHowitzerRotationSpeed,
  HOWITZER_ROTATION_SPEED,
  setHowitzerAccelerationMultiplier,
  HOWITZER_ACCELERATION_MULTIPLIER,
  setHowitzerFireRange,
  HOWITZER_FIRE_RANGE,
  setHowitzerMinRange,
  HOWITZER_MIN_RANGE,
  setHowitzerFirepower,
  HOWITZER_FIREPOWER,
  setHowitzerFireCooldown,
  HOWITZER_FIRE_COOLDOWN,
  setHowitzerProjectileSpeed,
  HOWITZER_PROJECTILE_SPEED,
  setHowitzerVisionRange,
  HOWITZER_VISION_RANGE,
  setHowitzerBuildingDamageMultiplier,
  HOWITZER_BUILDING_DAMAGE_MULTIPLIER,
  setStaticCollisionBounceOverlap,
  setStaticCollisionBounceMin,
  setStaticCollisionBounceMax,
  getMobileTankJoystickMapping,
  getMobileVehicleJoystickMapping,
  getMobileApacheJoystickMapping,
  getMobileJoystickMapping,
  setMobileTankJoystickMapping,
  setMobileVehicleJoystickMapping,
  setMobileApacheJoystickMapping,
  isTurretTankUnitType,
  CONFIG_VARIABLE_NAMES,
  listConfigVariables,
  getConfigValue,
  updateConfigValue,
  isConfigValueOverridden,
  getConfigOverrides,
  ensureConfigOverridesLoaded,
  UNIT_GAS_PROPERTIES,
  UNIT_AMMO_CAPACITY
} from '../../src/config.js'

describe('config.js', () => {
  describe('Core Constants', () => {
    it('should have TILE_SIZE defined as 32', () => {
      expect(TILE_SIZE).toBe(32)
    })

    it('should have MIN_MAP_TILES defined', () => {
      expect(MIN_MAP_TILES).toBe(25)
    })

    it('should have DEFAULT_MAP_TILES defined', () => {
      expect(DEFAULT_MAP_TILES_X).toBe(100)
      expect(DEFAULT_MAP_TILES_Y).toBe(100)
    })

    it('should have DIRECTIONS with 8 cardinal directions', () => {
      expect(DIRECTIONS).toHaveLength(8)
      expect(DIRECTIONS).toContainEqual({ x: 0, y: -1 }) // north
      expect(DIRECTIONS).toContainEqual({ x: 1, y: 0 })  // east
      expect(DIRECTIONS).toContainEqual({ x: 0, y: 1 })  // south
      expect(DIRECTIONS).toContainEqual({ x: -1, y: 0 }) // west
    })
  })

  describe('Map Dimension Functions', () => {
    let originalMapX, originalMapY

    beforeEach(() => {
      // Store original values to restore after tests
      originalMapX = MAP_TILES_X
      originalMapY = MAP_TILES_Y
    })

    afterEach(() => {
      // Restore original dimensions
      setMapDimensions(originalMapX, originalMapY)
    })

    it('should get current map dimensions', () => {
      const dimensions = getMapDimensions()
      expect(dimensions).toHaveProperty('width')
      expect(dimensions).toHaveProperty('height')
    })

    it('should set map dimensions', () => {
      const result = setMapDimensions(64, 64)
      expect(result.width).toBe(64)
      expect(result.height).toBe(64)
    })

    it('should enforce minimum map size', () => {
      const result = setMapDimensions(10, 10)
      expect(result.width).toBe(MIN_MAP_TILES)
      expect(result.height).toBe(MIN_MAP_TILES)
    })

    it('should handle non-finite width', () => {
      const result = setMapDimensions(NaN, 50)
      expect(result.width).toBe(DEFAULT_MAP_TILES_X)
      expect(result.height).toBe(50)
    })

    it('should handle non-finite height', () => {
      const result = setMapDimensions(50, Infinity)
      expect(result.width).toBe(50)
      expect(result.height).toBe(DEFAULT_MAP_TILES_Y)
    })

    it('should calculate map width in pixels', () => {
      setMapDimensions(100, 100)
      const width = getMapWidth()
      expect(width).toBe(100 * TILE_SIZE)
    })

    it('should calculate map height in pixels', () => {
      setMapDimensions(100, 100)
      const height = getMapHeight()
      expect(height).toBe(100 * TILE_SIZE)
    })
  })

  describe('Unit Configuration', () => {
    it('should have UNIT_COSTS for all unit types', () => {
      expect(UNIT_COSTS.tank).toBeDefined()
      expect(UNIT_COSTS.harvester).toBeDefined()
      expect(UNIT_COSTS.rocketTank).toBeDefined()
      expect(UNIT_COSTS.ambulance).toBeDefined()
      expect(UNIT_COSTS.tankerTruck).toBeDefined()
      expect(UNIT_COSTS.recoveryTank).toBeDefined()
      expect(UNIT_COSTS.apache).toBeDefined()
      expect(UNIT_COSTS.howitzer).toBeDefined()
    })

    it('should have UNIT_PROPERTIES for all unit types', () => {
      expect(UNIT_PROPERTIES.tank_v1).toBeDefined()
      expect(UNIT_PROPERTIES.harvester).toBeDefined()
      expect(UNIT_PROPERTIES.rocketTank).toBeDefined()
      expect(UNIT_PROPERTIES.ambulance).toBeDefined()
      expect(UNIT_PROPERTIES.tankerTruck).toBeDefined()
      expect(UNIT_PROPERTIES.recoveryTank).toBeDefined()
      expect(UNIT_PROPERTIES.apache).toBeDefined()
      expect(UNIT_PROPERTIES.howitzer).toBeDefined()
    })

    it('should have health properties for units', () => {
      expect(UNIT_PROPERTIES.tank_v1.health).toBeGreaterThan(0)
      expect(UNIT_PROPERTIES.tank_v1.maxHealth).toBeGreaterThan(0)
    })

    it('should have speed properties for units', () => {
      expect(UNIT_PROPERTIES.tank_v1.speed).toBeGreaterThan(0)
      expect(UNIT_PROPERTIES.harvester.speed).toBeGreaterThan(0)
    })

    it('should keep harvester rotation only 50% faster than a tank', () => {
      expect(UNIT_PROPERTIES.harvester.rotationSpeed).toBeCloseTo(UNIT_PROPERTIES.tank_v1.rotationSpeed * 1.5)
    })

    it('should have UNIT_GAS_PROPERTIES for fuel-consuming units', () => {
      expect(UNIT_GAS_PROPERTIES.tank_v1).toBeDefined()
      expect(UNIT_GAS_PROPERTIES.tank_v1.tankSize).toBeGreaterThan(0)
      expect(UNIT_GAS_PROPERTIES.tank_v1.consumption).toBeGreaterThan(0)
    })

    it('should have UNIT_AMMO_CAPACITY for combat units', () => {
      expect(UNIT_AMMO_CAPACITY.tank_v1).toBeGreaterThan(0)
      expect(UNIT_AMMO_CAPACITY.rocketTank).toBeGreaterThan(0)
      expect(UNIT_AMMO_CAPACITY.howitzer).toBeGreaterThan(0)
      expect(UNIT_AMMO_CAPACITY.apache).toBeGreaterThan(0)
    })
  })

  describe('Party Configuration', () => {
    it('should have PARTY_COLORS for all players', () => {
      expect(PARTY_COLORS.player1).toBeDefined()
      expect(PARTY_COLORS.player2).toBeDefined()
      expect(PARTY_COLORS.player3).toBeDefined()
      expect(PARTY_COLORS.player4).toBeDefined()
    })

    it('should have legacy aliases in PARTY_COLORS', () => {
      expect(PARTY_COLORS.player).toBe(PARTY_COLORS.player1)
      expect(PARTY_COLORS.enemy).toBe(PARTY_COLORS.player2)
    })

    it('should have PLAYER_POSITIONS for all players', () => {
      expect(PLAYER_POSITIONS.player1).toBeDefined()
      expect(PLAYER_POSITIONS.player2).toBeDefined()
      expect(PLAYER_POSITIONS.player1.x).toBeDefined()
      expect(PLAYER_POSITIONS.player1.y).toBeDefined()
    })
  })

  describe('Combat Configuration', () => {
    it('should have HIT_ZONE_DAMAGE_MULTIPLIERS', () => {
      expect(HIT_ZONE_DAMAGE_MULTIPLIERS.FRONT).toBe(1.0)
      expect(HIT_ZONE_DAMAGE_MULTIPLIERS.SIDE).toBeGreaterThan(1.0)
      expect(HIT_ZONE_DAMAGE_MULTIPLIERS.REAR).toBeGreaterThan(HIT_ZONE_DAMAGE_MULTIPLIERS.SIDE)
    })

    it('should have TANK_V3_BURST configuration', () => {
      expect(TANK_V3_BURST.COUNT).toBeGreaterThan(1)
      expect(TANK_V3_BURST.DELAY).toBeGreaterThan(0)
    })
  })

  describe('Setter Functions', () => {
    // Store original values
    const originalValues = {}

    beforeEach(() => {
      originalValues.XP_MULTIPLIER = XP_MULTIPLIER
      originalValues.CREW_KILL_CHANCE = CREW_KILL_CHANCE
      originalValues.TARGETING_SPREAD = TARGETING_SPREAD
      originalValues.KEYBOARD_SCROLL_SPEED = KEYBOARD_SCROLL_SPEED
      originalValues.TANK_FIRE_RANGE = TANK_FIRE_RANGE
      originalValues.SERVICE_DISCOVERY_RANGE = SERVICE_DISCOVERY_RANGE
    })

    afterEach(() => {
      // Restore values
      setXpMultiplier(originalValues.XP_MULTIPLIER)
      setCrewKillChance(originalValues.CREW_KILL_CHANCE)
      setTargetingSpread(originalValues.TARGETING_SPREAD)
      setKeyboardScrollSpeed(originalValues.KEYBOARD_SCROLL_SPEED)
      setTankFireRange(originalValues.TANK_FIRE_RANGE)
      setServiceDiscoveryRange(originalValues.SERVICE_DISCOVERY_RANGE)
    })

    it('should update XP_MULTIPLIER', () => {
      setXpMultiplier(5)
      expect(XP_MULTIPLIER).toBe(5)
    })

    it('should update CREW_KILL_CHANCE', () => {
      setCrewKillChance(0.5)
      expect(CREW_KILL_CHANCE).toBe(0.5)
    })

    it('should update ENEMY_SELECTION and ENEMY_CONTROL', () => {
      const originalSelection = ENABLE_ENEMY_SELECTION
      const originalControl = ENABLE_ENEMY_CONTROL

      setEnemySelectionEnabled(false)
      expect(ENABLE_ENEMY_SELECTION).toBe(false)

      setEnemyControlEnabled(true)
      expect(ENABLE_ENEMY_CONTROL).toBe(true)

      // Restore
      setEnemySelectionEnabled(originalSelection)
      setEnemyControlEnabled(originalControl)
    })

    it('should update TARGETING_SPREAD', () => {
      setTargetingSpread(16)
      expect(TARGETING_SPREAD).toBe(16)
    })

    it('should update HARVESTER settings', () => {
      const originalCapacity = HARVESTER_CAPPACITY
      const originalUnloadTime = HARVESTER_UNLOAD_TIME

      setHarvesterCapacity(5)
      expect(HARVESTER_CAPPACITY).toBe(5)

      setHarvesterUnloadTime(3000)
      expect(HARVESTER_UNLOAD_TIME).toBe(3000)

      // Restore
      setHarvesterCapacity(originalCapacity)
      setHarvesterUnloadTime(originalUnloadTime)
    })

    it('should update TANK_FIRE_RANGE and linked SERVICE_DISCOVERY_RANGE', () => {
      // First set them to same value
      const originalFireRange = TANK_FIRE_RANGE
      setTankFireRange(12)
      expect(TANK_FIRE_RANGE).toBe(12)

      // Restore
      setTankFireRange(originalFireRange)
    })

    it('should update SERVICE_DISCOVERY_RANGE independently', () => {
      const original = SERVICE_DISCOVERY_RANGE
      setServiceDiscoveryRange(15)
      expect(SERVICE_DISCOVERY_RANGE).toBe(15)
      setServiceDiscoveryRange(original)
    })

    it('should update SERVICE_SERVING_RANGE', () => {
      const original = SERVICE_SERVING_RANGE
      setServiceServingRange(2.5)
      expect(SERVICE_SERVING_RANGE).toBe(2.5)
      setServiceServingRange(original)
    })

    it('should update rotation speeds', () => {
      const origDefault = DEFAULT_ROTATION_SPEED
      const origFast = FAST_ROTATION_SPEED
      const origWagon = TANK_WAGON_ROT
      const origTurret = TANK_TURRET_ROT
      const origAiming = TURRET_AIMING_THRESHOLD

      setDefaultRotationSpeed(0.1)
      expect(DEFAULT_ROTATION_SPEED).toBe(0.1)

      setFastRotationSpeed(0.2)
      expect(FAST_ROTATION_SPEED).toBe(0.2)

      setTankWagonRot(0.06)
      expect(TANK_WAGON_ROT).toBe(0.06)

      setTankTurretRot(0.03)
      expect(TANK_TURRET_ROT).toBe(0.03)

      setTurretAimingThreshold(0.2)
      expect(TURRET_AIMING_THRESHOLD).toBe(0.2)

      // Restore
      setDefaultRotationSpeed(origDefault)
      setFastRotationSpeed(origFast)
      setTankWagonRot(origWagon)
      setTankTurretRot(origTurret)
      setTurretAimingThreshold(origAiming)
    })

    it('should update ore spread settings', () => {
      const origInterval = ORE_SPREAD_INTERVAL
      const origProb = ORE_SPREAD_PROBABILITY
      const origEnabled = ORE_SPREAD_ENABLED

      setOreSpreadInterval(60000)
      expect(ORE_SPREAD_INTERVAL).toBe(60000)

      setOreSpreadProbability(0.1)
      expect(ORE_SPREAD_PROBABILITY).toBe(0.1)

      setOreSpreadEnabled(false)
      expect(ORE_SPREAD_ENABLED).toBe(false)

      // Restore
      setOreSpreadInterval(origInterval)
      setOreSpreadProbability(origProb)
      setOreSpreadEnabled(origEnabled)
    })

    it('should update pathfinding settings', () => {
      const origCalcInterval = PATH_CALC_INTERVAL
      const origCacheTtl = PATH_CACHE_TTL
      const origMaxPaths = MAX_PATHS_PER_CYCLE
      const origThreshold = PATHFINDING_THRESHOLD

      setPathCalcInterval(3000)
      expect(PATH_CALC_INTERVAL).toBe(3000)

      setPathCacheTtl(5000)
      expect(PATH_CACHE_TTL).toBe(5000)

      setMaxPathsPerCycle(10)
      expect(MAX_PATHS_PER_CYCLE).toBe(10)

      setPathfindingThreshold(15)
      expect(PATHFINDING_THRESHOLD).toBe(15)

      // Restore
      setPathCalcInterval(origCalcInterval)
      setPathCacheTtl(origCacheTtl)
      setMaxPathsPerCycle(origMaxPaths)
      setPathfindingThreshold(origThreshold)
    })

    it('should update AI settings', () => {
      const origFrameSkip = AI_UPDATE_FRAME_SKIP
      const origAttackInterval = ATTACK_PATH_CALC_INTERVAL
      const origDecisionInterval = AI_DECISION_INTERVAL

      setAiUpdateFrameSkip(5)
      expect(AI_UPDATE_FRAME_SKIP).toBe(5)

      setAttackPathCalcInterval(4000)
      expect(ATTACK_PATH_CALC_INTERVAL).toBe(4000)

      setAiDecisionInterval(10000)
      expect(AI_DECISION_INTERVAL).toBe(10000)

      // Restore
      setAiUpdateFrameSkip(origFrameSkip)
      setAttackPathCalcInterval(origAttackInterval)
      setAiDecisionInterval(origDecisionInterval)
    })

    it('should update stuck detection settings', () => {
      const origCheckInterval = STUCK_CHECK_INTERVAL
      const origThreshold = STUCK_THRESHOLD
      const origCooldown = STUCK_HANDLING_COOLDOWN
      const origDodge = DODGE_ATTEMPT_COOLDOWN
      const origMoveThreshold = MOVE_TARGET_REACHED_THRESHOLD

      setStuckCheckInterval(1000)
      expect(STUCK_CHECK_INTERVAL).toBe(1000)

      setStuckThreshold(1000)
      expect(STUCK_THRESHOLD).toBe(1000)

      setStuckHandlingCooldown(2000)
      expect(STUCK_HANDLING_COOLDOWN).toBe(2000)

      setDodgeAttemptCooldown(1000)
      expect(DODGE_ATTEMPT_COOLDOWN).toBe(1000)

      setMoveTargetReachedThreshold(2.0)
      expect(MOVE_TARGET_REACHED_THRESHOLD).toBe(2.0)

      // Restore
      setStuckCheckInterval(origCheckInterval)
      setStuckThreshold(origThreshold)
      setStuckHandlingCooldown(origCooldown)
      setDodgeAttemptCooldown(origDodge)
      setMoveTargetReachedThreshold(origMoveThreshold)
    })

    it('should update gas and ammo settings', () => {
      const origGasTime = GAS_REFILL_TIME
      const origGasCost = GAS_REFILL_COST
      const origHelipadFuel = HELIPAD_FUEL_CAPACITY
      const origHelipadReload = HELIPAD_RELOAD_TIME
      const origAmmoTime = AMMO_RESUPPLY_TIME

      setGasRefillTime(10000)
      expect(GAS_REFILL_TIME).toBe(10000)

      setGasRefillCost(100)
      expect(GAS_REFILL_COST).toBe(100)

      setHelipadFuelCapacity(20000)
      expect(HELIPAD_FUEL_CAPACITY).toBe(20000)

      setHelipadReloadTime(10000)
      expect(HELIPAD_RELOAD_TIME).toBe(10000)

      setAmmoResupplyTime(10000)
      expect(AMMO_RESUPPLY_TIME).toBe(10000)

      // Restore
      setGasRefillTime(origGasTime)
      setGasRefillCost(origGasCost)
      setHelipadFuelCapacity(origHelipadFuel)
      setHelipadReloadTime(origHelipadReload)
      setAmmoResupplyTime(origAmmoTime)
    })

    it('should update mine settings', () => {
      const origCapacity = MINE_CAPACITY
      const origHealth = MINE_HEALTH
      const origDamage = MINE_DAMAGE_CENTER
      const origDeployTime = MINE_DEPLOY_STOP_TIME
      const origArmDelay = MINE_ARM_DELAY
      const origExplosionRadius = MINE_EXPLOSION_RADIUS
      const origTriggerRadius = MINE_TRIGGER_RADIUS

      setMineCapacity(30)
      expect(MINE_CAPACITY).toBe(30)

      setMineHealth(20)
      expect(MINE_HEALTH).toBe(20)

      setMineDamageCenter(120)
      expect(MINE_DAMAGE_CENTER).toBe(120)

      setMineDeployStopTime(5000)
      expect(MINE_DEPLOY_STOP_TIME).toBe(5000)

      setMineArmDelay(5000)
      expect(MINE_ARM_DELAY).toBe(5000)

      setMineExplosionRadius(3)
      expect(MINE_EXPLOSION_RADIUS).toBe(3)

      setMineTriggerRadius(20)
      expect(MINE_TRIGGER_RADIUS).toBe(20)

      // Restore
      setMineCapacity(origCapacity)
      setMineHealth(origHealth)
      setMineDamageCenter(origDamage)
      setMineDeployStopTime(origDeployTime)
      setMineArmDelay(origArmDelay)
      setMineExplosionRadius(origExplosionRadius)
      setMineTriggerRadius(origTriggerRadius)
    })

    it('should update howitzer settings', () => {
      const origCost = HOWITZER_COST
      const origSpeed = HOWITZER_SPEED
      const origRotation = HOWITZER_ROTATION_SPEED
      const origAccel = HOWITZER_ACCELERATION_MULTIPLIER
      const origRange = HOWITZER_FIRE_RANGE
      const origMinRange = HOWITZER_MIN_RANGE
      const origFirepower = HOWITZER_FIREPOWER
      const origCooldown = HOWITZER_FIRE_COOLDOWN
      const origProjectileSpeed = HOWITZER_PROJECTILE_SPEED
      const origVision = HOWITZER_VISION_RANGE
      const origBuildingDamage = HOWITZER_BUILDING_DAMAGE_MULTIPLIER

      setHowitzerCost(3000)
      expect(HOWITZER_COST).toBe(3000)

      setHowitzerSpeed(0.3)
      expect(HOWITZER_SPEED).toBe(0.3)

      setHowitzerRotationSpeed(0.05)
      expect(HOWITZER_ROTATION_SPEED).toBe(0.05)

      setHowitzerAccelerationMultiplier(1.0)
      expect(HOWITZER_ACCELERATION_MULTIPLIER).toBe(1.0)

      setHowitzerFireRange(35)
      expect(HOWITZER_FIRE_RANGE).toBe(35)

      setHowitzerMinRange(8)
      expect(HOWITZER_MIN_RANGE).toBe(8)

      setHowitzerFirepower(80)
      expect(HOWITZER_FIREPOWER).toBe(80)

      setHowitzerFireCooldown(7000)
      expect(HOWITZER_FIRE_COOLDOWN).toBe(7000)

      setHowitzerProjectileSpeed(1.0)
      expect(HOWITZER_PROJECTILE_SPEED).toBe(1.0)

      setHowitzerVisionRange(20)
      expect(HOWITZER_VISION_RANGE).toBe(20)

      setHowitzerBuildingDamageMultiplier(3)
      expect(HOWITZER_BUILDING_DAMAGE_MULTIPLIER).toBe(3)

      // Restore
      setHowitzerCost(origCost)
      setHowitzerSpeed(origSpeed)
      setHowitzerRotationSpeed(origRotation)
      setHowitzerAccelerationMultiplier(origAccel)
      setHowitzerFireRange(origRange)
      setHowitzerMinRange(origMinRange)
      setHowitzerFirepower(origFirepower)
      setHowitzerFireCooldown(origCooldown)
      setHowitzerProjectileSpeed(origProjectileSpeed)
      setHowitzerVisionRange(origVision)
      setHowitzerBuildingDamageMultiplier(origBuildingDamage)
    })

    it('should update collision settings', () => {
      const origMult = STATIC_COLLISION_BOUNCE_MULT

      setStaticCollisionBounceMult(1.0)
      expect(STATIC_COLLISION_BOUNCE_MULT).toBe(1.0)

      setStaticCollisionBounceOverlap(0.2)
      setStaticCollisionBounceMin(0.2)
      setStaticCollisionBounceMax(3)

      // Restore
      setStaticCollisionBounceMult(origMult)
    })

    it('should update recovery tank ratio', () => {
      const orig = RECOVERY_TANK_RATIO
      setRecoveryTankRatio(10)
      expect(RECOVERY_TANK_RATIO).toBe(10)
      setRecoveryTankRatio(orig)
    })

    it('should update smoke particles', () => {
      const orig = MAX_SMOKE_PARTICLES
      setMaxSmokeParticles(500)
      expect(MAX_SMOKE_PARTICLES).toBe(500)
      setMaxSmokeParticles(orig)
    })

    it('should update tanker supply capacity', () => {
      const orig = TANKER_SUPPLY_CAPACITY
      setTankerSupplyCapacity(50000)
      expect(TANKER_SUPPLY_CAPACITY).toBe(50000)
      setTankerSupplyCapacity(orig)
    })

    it('should update inertia stop threshold', () => {
      const orig = INERTIA_STOP_THRESHOLD
      setInertiaStopThreshold(2)
      expect(INERTIA_STOP_THRESHOLD).toBe(2)
      setInertiaStopThreshold(orig)
    })

    it('should update street speed multiplier', () => {
      const orig = STREET_SPEED_MULTIPLIER
      setStreetSpeedMultiplier(2.0)
      expect(STREET_SPEED_MULTIPLIER).toBe(2.0)
      setStreetSpeedMultiplier(orig)
    })

    it('should update ammo factory and truck settings', () => {
      const origRange = AMMO_FACTORY_RANGE
      const origTruckRange = AMMO_TRUCK_RANGE
      const origCargo = AMMO_TRUCK_CARGO
      const origReserve = HELIPAD_AMMO_RESERVE
      const origParticleCount = AMMO_FACTORY_PARTICLE_COUNT
      const origParticleDamage = AMMO_PARTICLE_DAMAGE

      setAmmoFactoryRange(3)
      expect(AMMO_FACTORY_RANGE).toBe(3)

      setAmmoTruckRange(2)
      expect(AMMO_TRUCK_RANGE).toBe(2)

      setAmmoTruckCargo(600)
      expect(AMMO_TRUCK_CARGO).toBe(600)

      setHelipadAmmoReserve(300)
      expect(HELIPAD_AMMO_RESERVE).toBe(300)

      setAmmoFactoryParticleCount(50)
      expect(AMMO_FACTORY_PARTICLE_COUNT).toBe(50)

      setAmmoParticleDamage(50)
      expect(AMMO_PARTICLE_DAMAGE).toBe(50)

      // Restore
      setAmmoFactoryRange(origRange)
      setAmmoTruckRange(origTruckRange)
      setAmmoTruckCargo(origCargo)
      setHelipadAmmoReserve(origReserve)
      setAmmoFactoryParticleCount(origParticleCount)
      setAmmoParticleDamage(origParticleDamage)
    })

    it('should update bullet speed', () => {
      const orig = TANK_BULLET_SPEED
      setTankBulletSpeed(10)
      expect(TANK_BULLET_SPEED).toBe(10)
      setTankBulletSpeed(orig)
    })

    it('should update keyboard scroll speed', () => {
      const orig = KEYBOARD_SCROLL_SPEED
      setKeyboardScrollSpeed(16)
      expect(KEYBOARD_SCROLL_SPEED).toBe(16)
      setKeyboardScrollSpeed(orig)
    })
  })

  describe('Joystick Mapping Functions', () => {
    it('should return default tank joystick mapping', () => {
      const mapping = getMobileTankJoystickMapping()
      expect(mapping).toBeDefined()
      expect(mapping.left).toBeDefined()
      expect(mapping.right).toBeDefined()
      expect(mapping.left.up).toBeDefined()
      expect(mapping.right.tap).toBeDefined()
    })

    it('should return default vehicle joystick mapping', () => {
      const mapping = getMobileVehicleJoystickMapping()
      expect(mapping).toBeDefined()
      expect(mapping.left).toBeDefined()
      expect(mapping.right).toBeDefined()
    })

    it('should return default apache joystick mapping', () => {
      const mapping = getMobileApacheJoystickMapping()
      expect(mapping).toBeDefined()
      expect(mapping.left).toBeDefined()
      expect(mapping.right).toBeDefined()
    })

    it('should return tank mapping for getMobileJoystickMapping with "tank" profile', () => {
      const mapping = getMobileJoystickMapping('tank')
      const tankMapping = getMobileTankJoystickMapping()
      expect(mapping).toEqual(tankMapping)
    })

    it('should return apache mapping for getMobileJoystickMapping with "apache" profile', () => {
      const mapping = getMobileJoystickMapping('apache')
      const apacheMapping = getMobileApacheJoystickMapping()
      expect(mapping).toEqual(apacheMapping)
    })

    it('should return vehicle mapping for getMobileJoystickMapping with unknown profile', () => {
      const mapping = getMobileJoystickMapping('unknown')
      const vehicleMapping = getMobileVehicleJoystickMapping()
      expect(mapping).toEqual(vehicleMapping)
    })

    it('should return vehicle mapping for getMobileJoystickMapping with no profile', () => {
      const mapping = getMobileJoystickMapping()
      const vehicleMapping = getMobileVehicleJoystickMapping()
      expect(mapping).toEqual(vehicleMapping)
    })

    describe('setMobileTankJoystickMapping', () => {
      let originalMapping

      beforeEach(() => {
        originalMapping = JSON.parse(JSON.stringify(getMobileTankJoystickMapping()))
      })

      afterEach(() => {
        setMobileTankJoystickMapping(originalMapping)
      })

      it('should update tank joystick mapping with object', () => {
        const newMapping = {
          left: { up: ['backward'], down: ['forward'] },
          right: { tap: ['fire'] }
        }

        setMobileTankJoystickMapping(newMapping)

        const updated = getMobileTankJoystickMapping()
        expect(updated.left.up).toContain('backward')
        expect(updated.left.down).toContain('forward')
      })

      it('should handle string input with JSON', () => {
        const newMapping = JSON.stringify({
          left: { up: ['forward'] },
          right: { tap: ['fire'] }
        })

        setMobileTankJoystickMapping(newMapping)

        const updated = getMobileTankJoystickMapping()
        expect(updated.left.up).toContain('forward')
      })

      it('should handle empty string input', () => {
        expect(() => setMobileTankJoystickMapping('')).not.toThrow()
      })

      it('should reject invalid action names', () => {
        const invalidMapping = {
          left: { up: ['invalidAction'] }
        }

        expect(() => setMobileTankJoystickMapping(invalidMapping)).toThrow()
      })

      it('should accept comma-separated action strings', () => {
        const mapping = {
          left: { up: 'forward, backward' },
          right: { tap: 'fire' }
        }

        setMobileTankJoystickMapping(mapping)

        const updated = getMobileTankJoystickMapping()
        expect(updated.left.up).toContain('forward')
        expect(updated.left.up).toContain('backward')
      })

      it('should accept "none" as empty action list', () => {
        const mapping = {
          left: { up: 'none' },
          right: {}
        }

        setMobileTankJoystickMapping(mapping)

        const updated = getMobileTankJoystickMapping()
        expect(updated.left.up).toEqual([])
      })

      it('should accept null as empty action list', () => {
        const mapping = {
          left: { up: null },
          right: {}
        }

        setMobileTankJoystickMapping(mapping)

        const updated = getMobileTankJoystickMapping()
        expect(updated.left.up).toEqual([])
      })
    })

    describe('setMobileVehicleJoystickMapping', () => {
      let originalMapping

      beforeEach(() => {
        originalMapping = JSON.parse(JSON.stringify(getMobileVehicleJoystickMapping()))
      })

      afterEach(() => {
        setMobileVehicleJoystickMapping(originalMapping)
      })

      it('should update vehicle joystick mapping', () => {
        const newMapping = {
          left: { up: ['forward'] },
          right: { left: ['turnLeft'] }
        }

        setMobileVehicleJoystickMapping(newMapping)

        const updated = getMobileVehicleJoystickMapping()
        expect(updated.left.up).toContain('forward')
      })
    })

    describe('setMobileApacheJoystickMapping', () => {
      let originalMapping

      beforeEach(() => {
        originalMapping = JSON.parse(JSON.stringify(getMobileApacheJoystickMapping()))
      })

      afterEach(() => {
        setMobileApacheJoystickMapping(originalMapping)
      })

      it('should update apache joystick mapping', () => {
        const newMapping = {
          left: { up: ['ascend'], down: ['descend'] },
          right: { tap: ['fire'] }
        }

        setMobileApacheJoystickMapping(newMapping)

        const updated = getMobileApacheJoystickMapping()
        expect(updated.left.up).toContain('ascend')
        expect(updated.left.down).toContain('descend')
      })

      it('should handle strafe actions', () => {
        const newMapping = {
          left: { left: ['strafeLeft'], right: ['strafeRight'] },
          right: {}
        }

        setMobileApacheJoystickMapping(newMapping)

        const updated = getMobileApacheJoystickMapping()
        expect(updated.left.left).toContain('strafeLeft')
        expect(updated.left.right).toContain('strafeRight')
      })
    })
  })

  describe('isTurretTankUnitType()', () => {
    it('should return true for tank unit types', () => {
      expect(isTurretTankUnitType('tank')).toBe(true)
      expect(isTurretTankUnitType('tank_v1')).toBe(true)
      expect(isTurretTankUnitType('tank_v2')).toBe(true)
      expect(isTurretTankUnitType('tank_v3')).toBe(true)
      expect(isTurretTankUnitType('tank-v2')).toBe(true)
      expect(isTurretTankUnitType('tank-v3')).toBe(true)
    })

    it('should return true for rocketTank', () => {
      expect(isTurretTankUnitType('rocketTank')).toBe(true)
    })

    it('should return false for non-turret units', () => {
      expect(isTurretTankUnitType('harvester')).toBe(false)
      expect(isTurretTankUnitType('ambulance')).toBe(false)
      expect(isTurretTankUnitType('tankerTruck')).toBe(false)
      expect(isTurretTankUnitType('apache')).toBe(false)
      expect(isTurretTankUnitType('howitzer')).toBe(false)
    })

    it('should return false for invalid types', () => {
      expect(isTurretTankUnitType('')).toBe(false)
      expect(isTurretTankUnitType(null)).toBe(false)
      expect(isTurretTankUnitType(undefined)).toBe(false)
    })
  })

  describe('CONFIG_VARIABLE_NAMES', () => {
    it('should be an array of strings', () => {
      expect(Array.isArray(CONFIG_VARIABLE_NAMES)).toBe(true)
      expect(CONFIG_VARIABLE_NAMES.length).toBeGreaterThan(0)
      CONFIG_VARIABLE_NAMES.forEach(name => {
        expect(typeof name).toBe('string')
      })
    })

    it('should include core variables', () => {
      expect(CONFIG_VARIABLE_NAMES).toContain('TILE_SIZE')
      expect(CONFIG_VARIABLE_NAMES).toContain('MAP_TILES_X')
      expect(CONFIG_VARIABLE_NAMES).toContain('MAP_TILES_Y')
      expect(CONFIG_VARIABLE_NAMES).toContain('UNIT_COSTS')
      expect(CONFIG_VARIABLE_NAMES).toContain('UNIT_PROPERTIES')
    })

    it('should include howitzer variables', () => {
      expect(CONFIG_VARIABLE_NAMES).toContain('HOWITZER_COST')
      expect(CONFIG_VARIABLE_NAMES).toContain('HOWITZER_FIRE_RANGE')
      expect(CONFIG_VARIABLE_NAMES).toContain('HOWITZER_FIREPOWER')
    })

    it('should include combat variables', () => {
      expect(CONFIG_VARIABLE_NAMES).toContain('TANK_FIRE_RANGE')
      expect(CONFIG_VARIABLE_NAMES).toContain('BULLET_DAMAGES')
      expect(CONFIG_VARIABLE_NAMES).toContain('HIT_ZONE_DAMAGE_MULTIPLIERS')
    })
  })

  describe('Config Override Helpers', () => {
    it('returns an array of config variables', () => {
      const variables = listConfigVariables()
      expect(Array.isArray(variables)).toBe(true)
    })

    it('throws for unknown config value accessors', () => {
      expect(() => getConfigValue('NOT_A_CONFIG_VALUE')).toThrow()
      expect(() => updateConfigValue('NOT_A_CONFIG_VALUE', 5)).toThrow()
      expect(() => isConfigValueOverridden('NOT_A_CONFIG_VALUE')).toThrow()
    })

    it('returns an empty overrides object when no overrides are active', () => {
      expect(getConfigOverrides()).toEqual({})
    })

    it('loads overrides from external sources without throwing', async() => {
      const fetchSpy = vi.fn(async() => ({ ok: false }))
      vi.stubGlobal('fetch', fetchSpy)
      window.localStorage.setItem('rts-config-overrides', JSON.stringify({ unknown: 5 }))

      await expect(ensureConfigOverridesLoaded()).resolves.toBeUndefined()
      expect(fetchSpy).toHaveBeenCalled()
      vi.unstubAllGlobals()
    })
  })
})
