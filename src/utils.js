// utils.js
import { TILE_SIZE, XP_MULTIPLIER, UNIT_COSTS, HARVESTER_XP_FULL_UNLOADS_PER_STAR } from './config.js'
import { deterministicRNG, gameRandom } from './utils/gameRandom.js'

export function tileToPixel(tileX, tileY) {
  return { x: tileX * TILE_SIZE, y: tileY * TILE_SIZE }
}

export function getUniqueId() {
  const randomPart = Math.floor(gameRandom() * 0xFFFFFFFF).toString(36).padStart(7, '0')
  const prefix = deterministicRNG.isEnabled()
    ? deterministicRNG.getCallCount().toString(36)
    : Date.now().toString(36)
  return `${prefix}${randomPart}`
}

export function getBuildingIdentifier(building) {
  if (!building) return null
  if (building.id) return building.id
  const type = building.type || 'unknown'
  return `${type}:${building.x},${building.y}`
}

/**
 * Calculate speed modifier based on unit health
 * Units below 25% health move at 50% speed
 * @param {Object} unit - The unit to calculate speed modifier for
 * @returns {number} Speed modifier (0.5 for damaged units, 1.0 for healthy units)
 */
export function calculateHealthSpeedModifier(unit) {
  if (!unit || !unit.health || !unit.maxHealth) {
    return 1.0
  }

  const healthPercentage = unit.health / unit.maxHealth

  // If below 25% health, move at 50% speed
  if (healthPercentage < 0.25) {
    return 0.5
  }

  return 1.0
}

/**
 * Update unit speed modifier based on current health and other factors
 * This combines health-based speed reduction with other speed modifiers
 * @param {Object} unit - The unit to update speed modifier for
 */
export function updateUnitSpeedModifier(unit) {
  if (!unit) return

  // Calculate health-based speed modifier
  const healthSpeedModifier = calculateHealthSpeedModifier(unit)

  // Get any existing speed modifier (from Tesla coil effects, etc.)
  const existingModifier = unit.baseSpeedModifier || 1.0

  // Combine modifiers (multiplicative)
  unit.speedModifier = healthSpeedModifier * existingModifier
}

/**
 * Initialize leveling system for a unit
 * @param {Object} unit - The unit to initialize leveling for
 */
export function initializeUnitLeveling(unit) {
  if (!unit || unit.type === 'harvester') return // Harvesters don't level up

  unit.level = unit.level || 0
  unit.experience = unit.experience || 0
  unit.baseCost = unit.baseCost || getUnitCost(unit.type)
}

/**
 * Get the cost of a unit type
 * @param {string} unitType - The type of unit
 * @returns {number} The cost of the unit
 */
export function getUnitCost(unitType) {
  return UNIT_COSTS[unitType] || 9999999 // Default to a very high cost if not found
}

/**
 * Calculate experience required for next level
 * @param {number} currentLevel - Current level (0-3)
 * @param {number} baseCost - Base cost of the unit
 * @returns {number} Experience required for next level
 */
export function getExperienceRequiredForLevel(currentLevel, baseCost) {
  const multipliers = {
    1: 2, // Level 1 requires 2x unit cost
    2: 4, // Level 2 requires 4x unit cost
    3: 6  // Level 3 requires 6x unit cost
  }

  return multipliers[currentLevel + 1] ? multipliers[currentLevel + 1] * baseCost : null
}

/**
 * Award experience to a unit for killing an enemy
 * @param {Object} unit - The unit that got the kill
 * @param {Object} killedUnit - The unit that was killed
 */
export function awardExperience(unit, killedUnit) {
  if (!unit || !killedUnit || unit.type === 'harvester') {
    return
  }
  initializeUnitLeveling(unit)
  // Award experience equal to the cost of the killed unit, multiplied by XP_MULTIPLIER
  const experienceGained = Math.round(getUnitCost(killedUnit.type) * XP_MULTIPLIER)
  unit.experience += experienceGained
  // Check for level up immediately
  checkLevelUp(unit)
}

/**
 * Check if unit should level up and apply level up if needed
 * @param {Object} unit - The unit to check for level up
 */
export function checkLevelUp(unit) {
  if (!unit || unit.level >= 3) return

  const experienceRequired = getExperienceRequiredForLevel(unit.level, unit.baseCost)
  if (experienceRequired && unit.experience >= experienceRequired) {
    unit.level++
    unit.experience = 0 // Reset experience for next level

    // Apply level bonuses
    applyLevelBonuses(unit)

    // Play level up sound or effect here if desired
  }
}

/**
 * Apply bonuses based on unit level
 * @param {Object} unit - The unit to apply bonuses to
 */
export function applyLevelBonuses(unit) {
  if (!unit) return

  if (unit.type === 'howitzer') {
    if (unit.level >= 1) {
      unit.fireRateMultiplier = (unit.fireRateMultiplier || 1) * 1.33
    }
    if (unit.level >= 2) {
      unit.damageMultiplier = (unit.damageMultiplier || 1) * 1.33
    }
    if (unit.level >= 3) {
      unit.rangeMultiplier = (unit.rangeMultiplier || 1) * 1.33
    }
    return
  }

  // Level 1: 20% range increase
  if (unit.level >= 1) {
    unit.rangeMultiplier = (unit.rangeMultiplier || 1) * 1.2
  }

  // Level 2: 50% armor increase
  if (unit.level >= 2) {
    if (unit.armor) {
      unit.armor *= 1.5
    } else {
      unit.armor = 1.5 // Give armor to units that don't have it
    }
  }

  // Level 3: Self-repair and 33% fire rate increase
  if (unit.level >= 3) {
    unit.selfRepair = true
    unit.fireRateMultiplier = (unit.fireRateMultiplier || 1) * 1.33
  }
}

/**
 * Get experience progress percentage for current level
 * @param {Object} unit - The unit to get progress for
 * @returns {number} Progress percentage (0-1)
 */
export function getExperienceProgress(unit) {
  if (!unit) return 0

  if (unit.type === 'harvester') {
    if (unit.level >= 3) return 0
    const currentExperience = Number.isFinite(unit.experience) ? Math.max(0, unit.experience) : 0
    return Math.min(currentExperience / HARVESTER_XP_FULL_UNLOADS_PER_STAR, 1)
  }

  if (unit.level >= 3) return 0

  initializeUnitLeveling(unit)
  const experienceRequired = getExperienceRequiredForLevel(unit.level, unit.baseCost)
  if (!experienceRequired) return 0

  return Math.min(unit.experience / experienceRequired, 1)
}

/**
 * Handle level 3 self-repair for units
 * @param {Object} unit - The unit to potentially heal
 * @param {number} now - Current timestamp
 */
export function handleSelfRepair(unit, now) {
  if (!unit || unit.level < 3 || !unit.selfRepair) return
  if (unit.health >= unit.maxHealth) return

  // Only repair when not moving
  const isMoving = unit.path && unit.path.length > 0
  if (isMoving) return

  // Repair 1% every 3 seconds
  const repairInterval = 3000 // 3 seconds
  const repairAmount = unit.maxHealth * 0.01 // 1% of max health

  if (!unit.lastRepairTime) {
    unit.lastRepairTime = now
    return
  }

  if (now - unit.lastRepairTime >= repairInterval) {
    unit.health = Math.min(unit.health + repairAmount, unit.maxHealth)
    unit.lastRepairTime = now

    // Update speed modifier since health changed
    updateUnitSpeedModifier(unit)
  }
}

/**
 * Debug function to manually add experience to selected units
 * @param {number} amount - Amount of experience to add
 */
export function debugAddExperience(amount = 1000) {
  // Import selectedUnits dynamically to avoid circular imports
  let selectedUnits = []
  try {
    if (typeof window !== 'undefined' && window.debugGetSelectedUnits) {
      selectedUnits = window.debugGetSelectedUnits()
    }
  } catch {
    window.logger('Using fallback method to access selected units')
  }

  if (selectedUnits.length === 0) {
    window.logger('No units selected. Please select some units first.')
    window.logger('Try clicking on some tanks, then run debugAddExperience(500) again')
    return
  }

  selectedUnits.forEach(unit => {
    if (unit.type !== 'harvester') {
      initializeUnitLeveling(unit)
      const oldExp = unit.experience
      unit.experience += amount
      checkLevelUp(unit)
      window.logger(`✅ Added ${amount} experience to ${unit.type} (Level ${unit.level}, Experience: ${oldExp} → ${unit.experience})`)

      // Force a progress calculation
      const progress = getExperienceProgress(unit)
      window.logger(`📊 Experience progress: ${Math.round(progress * 100)}%`)
    } else {
      window.logger('❌ Harvesters cannot gain experience')
    }
  })
}

/**
 * Debug function to show selected unit stats
 */
export function debugShowUnitStats() {
  if (typeof window !== 'undefined' && window.selectedUnits) {
    window.selectedUnits.forEach(unit => {
      if (unit.type !== 'harvester') {
        initializeUnitLeveling(unit)
        const progress = getExperienceProgress(unit)
        const nextLevelExp = getExperienceRequiredForLevel(unit.level, unit.baseCost)
        window.logger(`=== ${unit.type} (ID: ${unit.id}) ===`)
        window.logger(`Level: ${unit.level}/3`)
        window.logger(`Experience: ${unit.experience}/${nextLevelExp || 'MAX'}`)
        window.logger(`Progress: ${Math.round(progress * 100)}%`)
        window.logger(`Range Multiplier: ${unit.rangeMultiplier || 1}x`)
        window.logger(`Armor: ${unit.armor || 1}`)
        window.logger(`Fire Rate Multiplier: ${unit.fireRateMultiplier || 1}x`)
        window.logger(`Self Repair: ${unit.selfRepair ? 'YES' : 'NO'}`)
      } else {
        window.logger(`${unit.type} (ID: ${unit.id}) - Harvesters don't level up`)
      }
    })
  }
}

/**
 * Debug function to force show experience bars on all combat units
 */
export function debugForceShowExperienceBars() {
  if (typeof window !== 'undefined' && window.gameInstance) {
    const units = window.gameInstance.units || []
    units.forEach(unit => {
      if (unit.type !== 'harvester') {
        initializeUnitLeveling(unit)
        if (unit.experience === 0) {
          unit.experience = 100 // Give a small amount of experience to make bar visible
        }
        window.logger(`${unit.type}: Level ${unit.level}, Experience ${unit.experience}`)
      }
    })
    window.logger('🔧 Forced experience bars to show on all combat units')
  }
}

/**
 * Debug function to spawn enemy units for testing experience system
 */
export function debugSpawnEnemyUnit(unitType = 'tank') {
  if (typeof window !== 'undefined' && window.gameInstance && window.gameInstance.units) {
    const units = window.gameInstance.units
    const _gameState = window.gameState || {}

    // Create a simple enemy unit near the player's view
    const enemyUnit = {
      id: `debug_enemy_${Date.now()}`,
      type: unitType,
      owner: 'enemy',
      x: 500, // Pixel position
      y: 500,
      tileX: Math.floor(500 / 32), // Tile position
      tileY: Math.floor(500 / 32),
      health: 100,
      maxHealth: 100,
      speed: 0.5,
      path: [],
      target: null,
      selected: false,
      direction: 0,
      targetDirection: 0,
      turretDirection: 0,
      rotationSpeed: 0.15,
      isRotating: false,
      level: 0,
      experience: 0,
      baseCost: 1000
    }

    units.push(enemyUnit)

    // Update occupancy map for debug spawned unit
    if (window.gameState && window.gameState.occupancyMap) {
      const centerTileX = Math.floor((enemyUnit.x + TILE_SIZE) / TILE_SIZE)
      const centerTileY = Math.floor((enemyUnit.y + TILE_SIZE) / TILE_SIZE)
      if (centerTileY >= 0 && centerTileY < window.gameState.occupancyMap.length &&
          centerTileX >= 0 && centerTileX < window.gameState.occupancyMap[0].length) {
        window.gameState.occupancyMap[centerTileY][centerTileX] = (window.gameState.occupancyMap[centerTileY][centerTileX] || 0) + 1
      }
    }

    window.logger(`🎯 Spawned enemy ${unitType} at (500, 500) for testing`)
    window.logger('💡 Use your tanks to destroy it and gain experience!')

    return enemyUnit
  }
}

/**
 * Debug function to test experience awarding directly
 */
export function debugTestExperienceAwarding() {
  if (typeof window !== 'undefined' && window.debugGetSelectedUnits) {
    const selectedUnits = window.debugGetSelectedUnits()

    if (selectedUnits.length === 0) {
      window.logger('❌ No units selected. Please select a unit first.')
      return
    }

    // Create a fake killed unit
    const fakeKilledUnit = {
      type: 'tank',
      owner: 'enemy',
      health: 0,
      maxHealth: 100
    }

    selectedUnits.forEach(unit => {
      if (unit.type !== 'harvester') {
        window.logger(`🧪 Testing experience awarding for ${unit.type}...`)

        // Force initialize leveling system first
        initializeUnitLeveling(unit)
        window.logger(`📊 Before: Level ${unit.level}, Experience ${unit.experience}, BaseCost ${unit.baseCost}`)

        const oldExp = unit.experience
        const oldLevel = unit.level

        awardExperience(unit, fakeKilledUnit)

        window.logger(`📊 After: Level ${unit.level}, Experience ${unit.experience}`)
        window.logger(`✅ Change: Experience +${unit.experience - oldExp}, Level ${oldLevel} → ${unit.level}`)
      }
    })
  }
}

/**
 * Debug function to list all units in the game
 */
export function debugListAllUnits() {
  if (typeof window !== 'undefined' && window.gameInstance && window.gameInstance.units) {
    const units = window.gameInstance.units
    window.logger(`📋 Total units in game: ${units.length}`)

    const unitsByOwner = {}
    units.forEach(unit => {
      const owner = unit.owner || 'unknown'
      if (!unitsByOwner[owner]) {
        unitsByOwner[owner] = []
      }
      unitsByOwner[owner].push(unit.type)
    })

    Object.keys(unitsByOwner).forEach(owner => {
      window.logger(`👥 ${owner}: ${unitsByOwner[owner].join(', ')}`)
    })

    return units
  }
}

/**
 * Debug function to initialize experience system for all existing units
 */
export function debugInitializeAllUnits() {
  if (typeof window !== 'undefined' && window.gameInstance && window.gameInstance.units) {
    const units = window.gameInstance.units
    let count = 0

    units.forEach(unit => {
      if (unit.type !== 'harvester') {
        const hadLeveling = !!(unit.level !== undefined && unit.experience !== undefined && unit.baseCost)
        initializeUnitLeveling(unit)

        if (!hadLeveling) {
          count++
          window.logger(`🔧 Initialized leveling for ${unit.type} (Owner: ${unit.owner})`)
        }
      }
    })

    window.logger(`✅ Initialized experience system for ${count} units`)
    window.logger(`📊 Total combat units: ${units.filter(u => u.type !== 'harvester').length}`)
  }
}

// Make debug functions available globally for testing
if (typeof window !== 'undefined') {
  window.debugAddExperience = debugAddExperience
  window.debugShowUnitStats = debugShowUnitStats
  window.debugForceShowExperienceBars = debugForceShowExperienceBars
  window.debugSpawnEnemyUnit = debugSpawnEnemyUnit
  window.debugTestExperienceAwarding = debugTestExperienceAwarding
  window.debugListAllUnits = debugListAllUnits
  window.debugInitializeAllUnits = debugInitializeAllUnits
}
