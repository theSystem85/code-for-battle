// attackNotifications.js - System for playing attack notification sounds with throttling
import { playSound } from '../sound.js'
import { gameState } from '../gameState.js'
import { showNotification } from '../ui/notifications.js'
import { selectedUnits } from '../inputHandler.js'
import { TILE_SIZE } from '../config.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../utils/layoutMetrics.js'

// Track last notification times to implement throttling (only once per minute)
const NOTIFICATION_COOLDOWN = 60000 // 60 seconds

let lastBaseAttackNotification = 0
let lastHarvesterAttackNotification = 0

const attackedUnitNotificationTimes = new Map()
const UNIT_ATTACK_NOTIFICATION_COOLDOWN = 8000

const UNIT_TYPE_DISPLAY_NAMES = {
  tank_v1: 'Tank',
  'tank-v2': 'Tank V2',
  'tank-v3': 'Tank V3',
  rocketTank: 'Rocket Tank',
  harvester: 'Harvester',
  tankerTruck: 'Tanker Truck',
  ammunitionTruck: 'Ammunition Truck',
  recoveryTank: 'Recovery Tank',
  ambulance: 'Ambulance',
  howitzer: 'Howitzer',
  apache: 'Apache'
}

function getUnitDisplayName(unitType) {
  return UNIT_TYPE_DISPLAY_NAMES[unitType] || unitType.replace(/[_-]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function focusAndSelectUnit(unit) {
  if (!unit || unit.health <= 0) return

  const units = gameState.units || []
  const factories = gameState.factories || []
  const mapGrid = gameState.mapGrid || []
  const canvas = document.getElementById('gameCanvas')

  units.forEach((candidate) => {
    candidate.selected = false
  })
  factories.forEach((factory) => {
    factory.selected = false
  })
  selectedUnits.length = 0

  unit.selected = true
  selectedUnits.push(unit)

  if (!canvas || !mapGrid.length) return

  const viewportWidth = getPlayableViewportWidth(canvas)
  const viewportHeight = getPlayableViewportHeight(canvas)

  if (!viewportWidth || !viewportHeight) return

  const mapWidth = mapGrid[0].length * TILE_SIZE
  const mapHeight = mapGrid.length * TILE_SIZE
  const maxScrollX = Math.max(0, mapWidth - viewportWidth)
  const maxScrollY = Math.max(0, mapHeight - viewportHeight)

  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2

  const targetX = Math.max(0, Math.min(centerX - viewportWidth / 2, maxScrollX))
  const targetY = Math.max(0, Math.min(centerY - viewportHeight / 2, maxScrollY))

  gameState.dragVelocity.x = 0
  gameState.dragVelocity.y = 0

  if (gameState.smoothScroll) {
    gameState.smoothScroll.targetX = targetX
    gameState.smoothScroll.targetY = targetY
    gameState.smoothScroll.active = true
  } else {
    gameState.scrollOffset.x = targetX
    gameState.scrollOffset.y = targetY
  }
}

function showUnitUnderAttackNotification(target, now) {
  if (!target?.id || !target?.type || target.health <= 0) return

  const lastNotificationTime = attackedUnitNotificationTimes.get(target.id) || 0
  if (now - lastNotificationTime < UNIT_ATTACK_NOTIFICATION_COOLDOWN) return

  attackedUnitNotificationTimes.set(target.id, now)
  const unitTypeLabel = getUnitDisplayName(target.type)
  const message = `${unitTypeLabel} is under attack!`

  showNotification(message, 4500, {
    historyMessage: message,
    renderContent: (notification) => {
      notification.style.display = 'flex'
      notification.style.alignItems = 'center'
      notification.style.gap = '4px'

      notification.append('Your ')

      const link = document.createElement('button')
      link.type = 'button'
      link.textContent = unitTypeLabel
      link.className = 'notification__inline-link'
      link.style.background = 'none'
      link.style.border = '0'
      link.style.padding = '0'
      link.style.margin = '0'
      link.style.color = '#ffd54f'
      link.style.font = 'inherit'
      link.style.textDecoration = 'underline'
      link.style.cursor = 'pointer'
      link.addEventListener('click', (event) => {
        event.preventDefault()
        focusAndSelectUnit(target)
      })

      notification.appendChild(link)
      notification.append(' is under attack!')
    }
  })
}

/**
 * Check if a unit/building belongs to the human player
 */
function isPlayerOwned(entity) {
  const humanPlayer = gameState.humanPlayer || 'player1'
  return entity.owner === humanPlayer || (humanPlayer === 'player1' && entity.owner === 'player')
}

/**
 * Check if a unit/building is a player base structure
 */
function isPlayerBase(entity) {
  if (!isPlayerOwned(entity)) return false

  // Check for construction yard (factory)
  if (entity.id && entity.id === gameState.humanPlayer) return true

  // Check for base buildings
  if (entity.type) {
    const baseBuildings = [
      'constructionYard',
      'powerPlant',
      'oreRefinery',
      'vehicleFactory',
      'barracks',
      'warFactory',
      'techCenter',
      'communications',
      'radar'
    ]
    return baseBuildings.includes(entity.type)
  }

  return false
}

/**
 * Check if a unit is a player harvester
 */
function isPlayerHarvester(unit) {
  return isPlayerOwned(unit) && unit.type === 'harvester'
}

/**
 * Handle attack notifications when units/buildings take damage
 * Should be called from the bullet system when damage is dealt
 */
export function handleAttackNotification(target, attacker, now) {
  // Only trigger notifications if attacker is an enemy
  if (!attacker || isPlayerOwned(attacker)) return

  // Check for base under attack
  if (isPlayerBase(target)) {
    if (now - lastBaseAttackNotification >= NOTIFICATION_COOLDOWN) {
      playSound('ourBaseIsUnderAttack', 1.0, 0, true) // Use stackable sound queue
      lastBaseAttackNotification = now
    }
  }

  // Check for harvester under attack
  if (isPlayerHarvester(target)) {
    if (now - lastHarvesterAttackNotification >= NOTIFICATION_COOLDOWN) {
      playSound('ourHarvestersAreUnderAttack', 1.0, 0, true) // Use stackable sound queue
      lastHarvesterAttackNotification = now
    }
  }

  if (isPlayerOwned(target) && !isPlayerBase(target) && target.type) {
    showUnitUnderAttackNotification(target, now)
  }
}

/**
 * Reset notification cooldowns (useful for testing or game restart)
 */
export function resetAttackNotifications() {
  lastBaseAttackNotification = 0
  lastHarvesterAttackNotification = 0
  attackedUnitNotificationTimes.clear()
}
