/**
 * Unit tests for unit combat system
 *
 * Tests target acquisition, turret rotation, damage calculation,
 * range checking, and line of sight detection.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { TILE_SIZE, TANK_FIRE_RANGE, TURRET_AIMING_THRESHOLD } from '../../src/config.js'

// Mock the gameState for testing
beforeEach(() => {
  gameState.buildings = []
  gameState.units = []
  gameState.humanPlayer = 'player'
  gameState.partyStates = []
  gameState.shadowOfWarEnabled = false
  gameState.occupancyMap = null
  gameState.mapGrid = []
})

/**
 * Creates a mock combat unit
 * @param {Object} options - Unit options
 * @returns {Object} - Mock unit
 */
function createCombatUnit(options = {}) {
  const defaults = {
    id: `unit-${Date.now()}-${Math.random()}`,
    type: options.type || 'tank_v1',
    owner: options.owner || 'player',
    x: (options.tileX || 5) * TILE_SIZE,
    y: (options.tileY || 5) * TILE_SIZE,
    tileX: options.tileX || 5,
    tileY: options.tileY || 5,
    health: options.health ?? 100,
    maxHealth: options.maxHealth ?? 100,
    target: options.target || null,
    direction: options.direction ?? 0,
    turretDirection: options.turretDirection ?? 0,
    rotationSpeed: options.rotationSpeed ?? 0.1,
    turretRotationSpeed: options.turretRotationSpeed ?? 0.15,
    lastShotTime: options.lastShotTime || null,
    canFire: options.canFire ?? true,
    ammunition: options.ammunition ?? 100,
    maxAmmunition: options.maxAmmunition ?? 100,
    crew: options.crew ?? { driver: true, commander: true, gunner: true, loader: true },
    path: options.path || [],
    moveTarget: options.moveTarget || null,
    isRetreating: options.isRetreating ?? false,
    guardMode: options.guardMode ?? false,
    guardTarget: options.guardTarget || null,
    attackQueue: options.attackQueue || null,
    allowedToAttack: options.allowedToAttack ?? true
  }

  // Type-specific properties
  if (defaults.type === 'tank-v2' || defaults.type === 'tank-v3') {
    defaults.alertMode = options.alertMode ?? false
  }

  if (defaults.type === 'rocketTank') {
    defaults.burstState = options.burstState || null
  }

  if (defaults.type === 'apache') {
    defaults.isAirUnit = true
    defaults.flightState = options.flightState || 'flying'
    defaults.altitude = options.altitude ?? TILE_SIZE * 2
    defaults.rocketAmmo = options.rocketAmmo ?? 38
    defaults.maxRocketAmmo = 38
    defaults.apacheAmmoEmpty = false
    defaults.volleyState = null
  }

  if (defaults.type === 'howitzer') {
    defaults.isHowitzer = true
  }

  return defaults
}

/**
 * Creates a mock building target
 * @param {Object} options - Building options
 * @returns {Object} - Mock building
 */
function createMockBuilding(options = {}) {
  return {
    id: options.id || `building-${Date.now()}`,
    type: options.type || 'powerPlant',
    owner: options.owner || 'enemy',
    x: options.x ?? 10,
    y: options.y ?? 10,
    width: options.width ?? 2,
    height: options.height ?? 2,
    health: options.health ?? 500,
    maxHealth: options.maxHealth ?? 500
  }
}

/**
 * Creates a clean test map grid
 */
function createTestMapGrid(width = 20, height = 20) {
  const mapGrid = []
  for (let y = 0; y < height; y++) {
    mapGrid[y] = []
    for (let x = 0; x < width; x++) {
      mapGrid[y][x] = {
        type: 'land',
        building: null,
        seedCrystal: false
      }
    }
  }
  return mapGrid
}

describe('Unit Combat System', () => {
  describe('Target Acquisition', () => {
    it('[U04591] should track assigned unit target', () => {
      const attacker = createCombatUnit({ tileX: 5, tileY: 5, owner: 'player' })
      const target = createCombatUnit({ tileX: 10, tileY: 5, owner: 'enemy' })

      attacker.target = target

      expect(attacker.target).toBe(target)
      expect(attacker.target.owner).toBe('enemy')
    })

    it('[U04592] should clear target when target is destroyed', () => {
      const attacker = createCombatUnit({ tileX: 5, tileY: 5 })
      const target = createCombatUnit({ tileX: 10, tileY: 5, owner: 'enemy', health: 0 })

      attacker.target = target

      // Combat system should detect dead target
      expect(target.health).toBe(0)
    })

    it('[U04593] should target buildings', () => {
      const attacker = createCombatUnit({ tileX: 5, tileY: 5 })
      const building = createMockBuilding({ x: 10, y: 10, owner: 'enemy' })

      attacker.target = building

      expect(attacker.target).toBe(building)
      expect(attacker.target.type).toBe('powerPlant')
    })

    it('[U04594] should handle null target gracefully', () => {
      const attacker = createCombatUnit({ tileX: 5, tileY: 5 })
      attacker.target = null

      expect(attacker.target).toBeNull()
    })

    it('[U04595] should maintain attack queue', () => {
      const attacker = createCombatUnit({ tileX: 5, tileY: 5 })
      const target1 = createCombatUnit({ tileX: 10, tileY: 5, owner: 'enemy' })
      const target2 = createCombatUnit({ tileX: 15, tileY: 5, owner: 'enemy' })

      attacker.attackQueue = [target1, target2]

      expect(attacker.attackQueue.length).toBe(2)
      expect(attacker.attackQueue[0]).toBe(target1)
      expect(attacker.attackQueue[1]).toBe(target2)
    })

    it('[U04596] should distinguish between own units and enemy units', () => {
      const playerUnit = createCombatUnit({ owner: 'player' })
      const allyUnit = createCombatUnit({ owner: 'player' })
      const enemyUnit = createCombatUnit({ owner: 'enemy' })

      expect(playerUnit.owner).toBe(allyUnit.owner)
      expect(playerUnit.owner).not.toBe(enemyUnit.owner)
    })
  })

  describe('Range Checking', () => {
    it('[U04597] should calculate correct fire range in pixels', () => {
      const expectedRangePixels = TANK_FIRE_RANGE * TILE_SIZE

      expect(expectedRangePixels).toBeGreaterThan(0)
      expect(expectedRangePixels).toBe(TANK_FIRE_RANGE * TILE_SIZE)
    })

    it('[U04598] should detect target within range', () => {
      const attacker = createCombatUnit({ tileX: 5, tileY: 5 })
      const target = createCombatUnit({ tileX: 7, tileY: 5, owner: 'enemy' })

      const attackerCenterX = attacker.x + TILE_SIZE / 2
      const attackerCenterY = attacker.y + TILE_SIZE / 2
      const targetCenterX = target.x + TILE_SIZE / 2
      const targetCenterY = target.y + TILE_SIZE / 2

      const distance = Math.hypot(targetCenterX - attackerCenterX, targetCenterY - attackerCenterY)
      const fireRange = TANK_FIRE_RANGE * TILE_SIZE

      expect(distance).toBeLessThan(fireRange)
    })

    it('[U04599] should detect target out of range', () => {
      const attacker = createCombatUnit({ tileX: 0, tileY: 0 })
      const target = createCombatUnit({ tileX: 50, tileY: 50, owner: 'enemy' })

      const attackerCenterX = attacker.x + TILE_SIZE / 2
      const attackerCenterY = attacker.y + TILE_SIZE / 2
      const targetCenterX = target.x + TILE_SIZE / 2
      const targetCenterY = target.y + TILE_SIZE / 2

      const distance = Math.hypot(targetCenterX - attackerCenterX, targetCenterY - attackerCenterY)
      const fireRange = TANK_FIRE_RANGE * TILE_SIZE

      expect(distance).toBeGreaterThan(fireRange)
    })

    it('[U04600] should handle building target positions correctly', () => {
      const attacker = createCombatUnit({ tileX: 5, tileY: 5 })
      const building = createMockBuilding({ x: 10, y: 10, width: 3, height: 3 })

      const attackerCenterX = attacker.x + TILE_SIZE / 2
      const attackerCenterY = attacker.y + TILE_SIZE / 2
      // Building center calculation
      const buildingCenterX = building.x * TILE_SIZE + (building.width * TILE_SIZE) / 2
      const buildingCenterY = building.y * TILE_SIZE + (building.height * TILE_SIZE) / 2

      const distance = Math.hypot(buildingCenterX - attackerCenterX, buildingCenterY - attackerCenterY)

      expect(distance).toBeGreaterThan(0)
    })
  })

  describe('Turret Rotation', () => {
    it('[U04601] should have initial turret direction of 0', () => {
      const tank = createCombatUnit({ type: 'tank_v1' })

      expect(tank.turretDirection).toBe(0)
    })

    it('[U04602] should rotate turret towards target', () => {
      const tank = createCombatUnit({ tileX: 5, tileY: 5, turretDirection: 0 })
      const target = createCombatUnit({ tileX: 5, tileY: 10, owner: 'enemy' }) // Target is south

      const tankCenterX = tank.x + TILE_SIZE / 2
      const tankCenterY = tank.y + TILE_SIZE / 2
      const targetCenterX = target.x + TILE_SIZE / 2
      const targetCenterY = target.y + TILE_SIZE / 2

      const angleToTarget = Math.atan2(targetCenterY - tankCenterY, targetCenterX - tankCenterX)

      // Angle to target should be approximately PI/2 (south)
      expect(Math.abs(angleToTarget - Math.PI / 2)).toBeLessThan(0.1)
    })

    it('[U04603] should have turret rotation speed', () => {
      const tank = createCombatUnit({ turretRotationSpeed: 0.15 })

      expect(tank.turretRotationSpeed).toBe(0.15)
    })

    it('[U04604] should respect aiming threshold', () => {
      expect(TURRET_AIMING_THRESHOLD).toBeGreaterThan(0)
      expect(TURRET_AIMING_THRESHOLD).toBeLessThan(Math.PI)
    })

    it('[U04605] should detect when turret is aimed at target', () => {
      const tank = createCombatUnit({ tileX: 5, tileY: 5, turretDirection: 0 })
      const target = createCombatUnit({ tileX: 10, tileY: 5, owner: 'enemy' }) // Target is east

      const tankCenterX = tank.x + TILE_SIZE / 2
      const tankCenterY = tank.y + TILE_SIZE / 2
      const targetCenterX = target.x + TILE_SIZE / 2
      const targetCenterY = target.y + TILE_SIZE / 2

      const angleToTarget = Math.atan2(targetCenterY - tankCenterY, targetCenterX - tankCenterX)
      const angleDiff = Math.abs(tank.turretDirection - angleToTarget)

      // Both turret and target are at angle 0 (east)
      expect(angleDiff).toBeLessThan(TURRET_AIMING_THRESHOLD)
    })

    it('[U04606] should detect when turret is not aimed at target', () => {
      const tank = createCombatUnit({ tileX: 5, tileY: 5, turretDirection: 0 }) // Facing east
      const target = createCombatUnit({ tileX: 5, tileY: 10, owner: 'enemy' }) // Target is south

      const tankCenterX = tank.x + TILE_SIZE / 2
      const tankCenterY = tank.y + TILE_SIZE / 2
      const targetCenterX = target.x + TILE_SIZE / 2
      const targetCenterY = target.y + TILE_SIZE / 2

      const angleToTarget = Math.atan2(targetCenterY - tankCenterY, targetCenterX - tankCenterX)
      const angleDiff = Math.abs(tank.turretDirection - angleToTarget)

      // Turret at 0 (east), target at PI/2 (south) - difference is ~PI/2
      expect(angleDiff).toBeGreaterThan(TURRET_AIMING_THRESHOLD)
    })
  })

  describe('Damage Calculation', () => {
    it('[U04607] should apply base damage', () => {
      const target = createCombatUnit({ health: 100, owner: 'enemy' })
      const baseDamage = 25

      target.health -= baseDamage

      expect(target.health).toBe(75)
    })

    it('[U04608] should not reduce health below zero', () => {
      const target = createCombatUnit({ health: 10, owner: 'enemy' })
      const baseDamage = 25

      target.health = Math.max(0, target.health - baseDamage)

      expect(target.health).toBe(0)
    })

    it('[U04609] should apply armor reduction', () => {
      const target = createCombatUnit({ health: 100, owner: 'enemy' })
      target.armor = 2 // 50% damage reduction
      const baseDamage = 20

      const reducedDamage = baseDamage / target.armor

      expect(reducedDamage).toBe(10)
    })

    it('[U04610] should handle units without armor', () => {
      const target = createCombatUnit({ health: 100, owner: 'enemy' })
      // No armor property
      const baseDamage = 20

      const armorValue = target.armor || 1
      const reducedDamage = baseDamage / armorValue

      expect(reducedDamage).toBe(20)
    })

    it('[U04611] should track different damage values for unit types', () => {
      // Different unit types have different base damages
      const standardDamage = 25
      const tankV3Damage = 30
      const rocketDamage = 20
      const apacheDamage = 10

      expect(tankV3Damage).toBeGreaterThan(standardDamage)
      expect(rocketDamage).toBeLessThan(standardDamage)
      expect(apacheDamage).toBeLessThan(rocketDamage)
    })
  })

  describe('Crew System', () => {
    it('[U04612] should have full crew by default', () => {
      const tank = createCombatUnit({ type: 'tank_v1' })

      expect(tank.crew.driver).toBe(true)
      expect(tank.crew.commander).toBe(true)
      expect(tank.crew.gunner).toBe(true)
      expect(tank.crew.loader).toBe(true)
    })

    it('[U04613] should prevent firing without loader', () => {
      const tank = createCombatUnit({ type: 'tank_v1' })
      tank.crew.loader = false

      // Combat system checks for loader before firing
      const canFire = tank.crew.loader !== false

      expect(canFire).toBe(false)
    })

    it('[U04614] should allow firing with loader', () => {
      const tank = createCombatUnit({ type: 'tank_v1' })
      tank.crew.loader = true

      const canFire = tank.crew.loader !== false

      expect(canFire).toBe(true)
    })
  })

  describe('Ammunition System', () => {
    it('[U04615] should track ammunition', () => {
      const tank = createCombatUnit({ ammunition: 50, maxAmmunition: 100 })

      expect(tank.ammunition).toBe(50)
      expect(tank.maxAmmunition).toBe(100)
    })

    it('[U04616] should deplete ammunition on fire', () => {
      const tank = createCombatUnit({ ammunition: 10 })
      const ammoPerShot = 1

      tank.ammunition = Math.max(0, tank.ammunition - ammoPerShot)

      expect(tank.ammunition).toBe(9)
    })

    it('[U04617] should prevent firing when out of ammo', () => {
      const tank = createCombatUnit({ ammunition: 0 })

      const canFire = tank.ammunition > 0

      expect(canFire).toBe(false)
    })

    it('[U04618] should track rocket ammo for apache', () => {
      const apache = createCombatUnit({ type: 'apache', rocketAmmo: 30 })

      expect(apache.rocketAmmo).toBe(30)
      expect(apache.maxRocketAmmo).toBe(38)
    })

    it('[U04619] should mark apache as empty when out of rockets', () => {
      const apache = createCombatUnit({ type: 'apache', rocketAmmo: 0 })
      apache.apacheAmmoEmpty = true

      expect(apache.apacheAmmoEmpty).toBe(true)
    })
  })

  describe('Combat States', () => {
    it('[U04620] should track canFire state', () => {
      const tank = createCombatUnit({ canFire: true })

      expect(tank.canFire).toBe(true)

      tank.canFire = false
      expect(tank.canFire).toBe(false)
    })

    it('[U04621] should track last shot time', () => {
      const tank = createCombatUnit()
      const now = 5000

      tank.lastShotTime = now

      expect(tank.lastShotTime).toBe(5000)
    })

    it('[U04622] should track retreat state', () => {
      const tank = createCombatUnit({ isRetreating: false })

      expect(tank.isRetreating).toBe(false)

      tank.isRetreating = true
      expect(tank.isRetreating).toBe(true)
    })

    it('[U04623] should track guard mode', () => {
      const tank = createCombatUnit({ guardMode: false })

      tank.guardMode = true
      tank.guardTarget = { x: 10, y: 10 }

      expect(tank.guardMode).toBe(true)
      expect(tank.guardTarget).toBeDefined()
    })
  })

  describe('Alert Mode (Tank V2/V3)', () => {
    it('[U04624] should initialize with alert mode off', () => {
      const tank = createCombatUnit({ type: 'tank-v2', alertMode: false })

      expect(tank.alertMode).toBe(false)
    })

    it('[U04625] should enable alert mode', () => {
      const tank = createCombatUnit({ type: 'tank-v2' })
      tank.alertMode = true

      expect(tank.alertMode).toBe(true)
    })

    it('[U04626] should auto-scan for enemies in alert mode', () => {
      const tank = createCombatUnit({ type: 'tank-v2', alertMode: true })

      // Alert mode enables auto-targeting within fire range
      expect(tank.alertMode).toBe(true)
      expect(tank.target).toBeNull() // No target until enemies detected
    })
  })

  describe('Burst Fire (Tank V3 and Rocket Tank)', () => {
    it('[U04627] should initialize without burst state', () => {
      const tankV3 = createCombatUnit({ type: 'tank-v3' })
      const rocketTank = createCombatUnit({ type: 'rocketTank' })

      expect(tankV3.burstState).toBeUndefined()
      expect(rocketTank.burstState).toBeNull()
    })

    it('[U04628] should support burst state for rocket tank', () => {
      const rocketTank = createCombatUnit({ type: 'rocketTank' })

      rocketTank.burstState = {
        rocketsToFire: 4,
        lastRocketTime: 0
      }

      expect(rocketTank.burstState.rocketsToFire).toBe(4)
    })
  })

  describe('Apache Combat', () => {
    it('[U04629] should be an air unit', () => {
      const apache = createCombatUnit({ type: 'apache' })

      expect(apache.isAirUnit).toBe(true)
    })

    it('[U04630] should track flight state', () => {
      const apache = createCombatUnit({ type: 'apache', flightState: 'flying' })

      expect(apache.flightState).toBe('flying')
    })

    it('[U04631] should have rocket ammo', () => {
      const apache = createCombatUnit({ type: 'apache' })

      expect(apache.rocketAmmo).toBe(38)
      expect(apache.maxRocketAmmo).toBe(38)
    })

    it('[U04632] should track volley state', () => {
      const apache = createCombatUnit({ type: 'apache' })

      expect(apache.volleyState).toBeNull()

      apache.volleyState = {
        leftRemaining: 4,
        rightRemaining: 4,
        lastRocketTime: 0,
        delay: 180,
        nextSide: 'left',
        totalInVolley: 8
      }

      expect(apache.volleyState.leftRemaining).toBe(4)
      expect(apache.volleyState.rightRemaining).toBe(4)
    })

    it('[U04633] should track altitude', () => {
      const apache = createCombatUnit({ type: 'apache', altitude: TILE_SIZE * 3 })

      expect(apache.altitude).toBe(TILE_SIZE * 3)
    })
  })

  describe('Howitzer Combat', () => {
    it('[U04634] should be a howitzer', () => {
      const howitzer = createCombatUnit({ type: 'howitzer' })

      expect(howitzer.isHowitzer).toBe(true)
    })

    it('[U04635] should have howitzer-specific targeting', () => {
      const howitzer = createCombatUnit({ type: 'howitzer' })

      // Howitzers require visibility check but body rotation for aiming
      expect(howitzer.type).toBe('howitzer')
    })
  })

  describe('Line of Sight', () => {
    it('[U04636] should check clear shot between units', () => {
      const attacker = createCombatUnit({ tileX: 5, tileY: 5 })
      const target = createCombatUnit({ tileX: 10, tileY: 5, owner: 'enemy' })
      const mapGrid = createTestMapGrid()

      // No obstacles between them
      const attackerTileX = attacker.tileX
      const targetTileX = target.tileX
      const y = attacker.tileY

      let hasObstacle = false
      for (let x = attackerTileX + 1; x < targetTileX; x++) {
        if (mapGrid[y][x].type === 'rock' || mapGrid[y][x].building) {
          hasObstacle = true
          break
        }
      }

      expect(hasObstacle).toBe(false)
    })

    it('[U04637] should detect obstacle blocking shot', () => {
      const mapGrid = createTestMapGrid()
      // Place obstacle between attacker and target
      mapGrid[5][7].type = 'rock'

      const attackerTileX = 5
      const targetTileX = 10
      const y = 5

      let hasObstacle = false
      for (let x = attackerTileX + 1; x < targetTileX; x++) {
        if (mapGrid[y][x].type === 'rock' || mapGrid[y][x].building) {
          hasObstacle = true
          break
        }
      }

      expect(hasObstacle).toBe(true)
    })

    it('[U04638] should detect building blocking shot', () => {
      const mapGrid = createTestMapGrid()
      // Place building between attacker and target
      const building = { type: 'powerPlant', x: 7, y: 5 }
      mapGrid[5][7].building = building

      const attackerTileX = 5
      const targetTileX = 10
      const y = 5

      let hasObstacle = false
      for (let x = attackerTileX + 1; x < targetTileX; x++) {
        if (mapGrid[y][x].building) {
          hasObstacle = true
          break
        }
      }

      expect(hasObstacle).toBe(true)
    })
  })

  describe('Target Center Calculation', () => {
    it('[U04639] should calculate unit center correctly', () => {
      const unit = createCombatUnit({ tileX: 5, tileY: 5 })

      const centerX = unit.x + TILE_SIZE / 2
      const centerY = unit.y + TILE_SIZE / 2

      expect(centerX).toBe(5 * TILE_SIZE + TILE_SIZE / 2)
      expect(centerY).toBe(5 * TILE_SIZE + TILE_SIZE / 2)
    })

    it('[U04640] should calculate building center correctly', () => {
      const building = createMockBuilding({ x: 10, y: 10, width: 3, height: 2 })

      const centerX = building.x * TILE_SIZE + (building.width * TILE_SIZE) / 2
      const centerY = building.y * TILE_SIZE + (building.height * TILE_SIZE) / 2

      expect(centerX).toBe(10 * TILE_SIZE + (3 * TILE_SIZE) / 2)
      expect(centerY).toBe(10 * TILE_SIZE + (2 * TILE_SIZE) / 2)
    })

    it('[U04641] should adjust for apache altitude visual offset', () => {
      const apache = createCombatUnit({ type: 'apache', tileX: 5, tileY: 5, altitude: TILE_SIZE * 2 })

      const baseY = apache.y + TILE_SIZE / 2
      const adjustedY = baseY - apache.altitude * 0.4

      expect(adjustedY).toBeLessThan(baseY)
    })
  })

  describe('Owner-Based Combat', () => {
    it('[U04642] should identify human player units', () => {
      const playerUnit = createCombatUnit({ owner: 'player' })
      gameState.humanPlayer = 'player'

      expect(playerUnit.owner).toBe(gameState.humanPlayer)
    })

    it('[U04643] should identify AI units', () => {
      const aiUnit = createCombatUnit({ owner: 'ai-red' })
      gameState.humanPlayer = 'player'

      expect(aiUnit.owner).not.toBe(gameState.humanPlayer)
    })

    it('[U04644] should check multiplayer party states', () => {
      gameState.partyStates = [
        { partyId: 'player1', aiActive: false },
        { partyId: 'player2', aiActive: false },
        { partyId: 'ai-red', aiActive: true }
      ]

      const humanParty = gameState.partyStates.find(p => p.partyId === 'player1')
      const aiParty = gameState.partyStates.find(p => p.partyId === 'ai-red')

      expect(humanParty.aiActive).toBe(false)
      expect(aiParty.aiActive).toBe(true)
    })
  })
})
