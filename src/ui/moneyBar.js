// moneyBar.js
// Handle money bar display and management

import { gameState } from '../gameState.js'
import { selectedUnits } from '../inputHandler.js'
import { TILE_SIZE } from '../config.js'
import { focusCameraOnPoint } from './tutorialSystem/helpers.js'

let tooltipListenersAttached = false
let tooltipOpen = false

function getMoneyBarGradient() {
  return 'linear-gradient(90deg, #d18100 0%, #ffd489 100%)'
}

function ensureMoneyTooltip() {
  let tooltip = document.getElementById('moneyTooltip')
  if (tooltip) return tooltip

  tooltip = document.createElement('div')
  tooltip.id = 'moneyTooltip'
  tooltip.className = 'money-tooltip'
  tooltip.setAttribute('aria-hidden', 'true')
  tooltip.innerHTML = `
    <div class="money-tooltip__panel">
      <div class="money-tooltip__header">
        <span>Resources</span>
        <button class="money-tooltip__close" type="button" aria-label="Close">×</button>
      </div>
      <div class="money-tooltip__content"></div>
    </div>
  `

  document.body.appendChild(tooltip)

  const closeButton = tooltip.querySelector('.money-tooltip__close')
  closeButton?.addEventListener('click', () => {
    hideMoneyTooltip()
  })

  tooltip.addEventListener('click', (event) => {
    const target = event.target.closest('.money-tooltip__link')
    if (!target) return
    event.preventDefault()
    const unitId = target.getAttribute('data-unit-id')
    const refineryId = target.getAttribute('data-refinery-id')
    if (unitId) {
      const unit = gameState.units.find(entry => entry.id === unitId)
      if (unit) {
        selectEntity(unit, 'unit')
        hideMoneyTooltip()
      }
    } else if (refineryId) {
      const refinery = gameState.buildings.find(entry => (entry.id || `refinery_${entry.x}_${entry.y}`) === refineryId)
      if (refinery) {
        selectEntity(refinery, 'building')
        hideMoneyTooltip()
      }
    }
  })

  return tooltip
}

function getIsTouchLayout() {
  return Boolean(document.body?.classList.contains('is-touch'))
}

function formatMoney(value) {
  return `$${Math.max(0, Math.floor(value || 0)).toLocaleString()}`
}

function renderMoneyTooltipContent() {
  const tooltip = ensureMoneyTooltip()
  const content = tooltip.querySelector('.money-tooltip__content')
  if (!content) return

  const humanPlayer = gameState.humanPlayer
  const refineries = (gameState.buildings || []).filter(
    building => building.type === 'oreRefinery' && building.owner === humanPlayer && building.health > 0
  )
  const harvesters = (gameState.units || []).filter(
    unit => unit.type === 'harvester' && unit.owner === humanPlayer && unit.health > 0
  )
  const refineryRevenue = gameState.refineryRevenue || {}

  const refineryRows = refineries.length
    ? refineries.map((refinery, index) => {
      const refineryId = refinery.id || `refinery_${refinery.x}_${refinery.y}`
      const revenue = refineryRevenue[refineryId] || 0
      return `
        <button class="money-tooltip__item money-tooltip__link" type="button" data-refinery-id="${refineryId}">
          <span class="money-tooltip__item-title">Refinery ${index + 1}</span>
          <span class="money-tooltip__item-value">${formatMoney(revenue)}</span>
        </button>
      `
    }).join('')
    : '<div class="money-tooltip__empty">No refineries online.</div>'

  const harvesterRows = harvesters.length
    ? harvesters.map((harvester, index) => {
      const totalEarned = typeof harvester.totalMoneyEarned === 'number' ? harvester.totalMoneyEarned : 0
      const fuelPercent = harvester.maxGas
        ? Math.max(0, Math.min(100, Math.round((harvester.gas / harvester.maxGas) * 100)))
        : 0
      const crewEntries = harvester.crew && typeof harvester.crew === 'object'
        ? Object.values(harvester.crew)
        : []
      const crewTotal = crewEntries.length
      const crewActive = crewEntries.filter(Boolean).length
      const cycleSeconds = typeof harvester.harvestCycleSeconds === 'number'
        ? `${harvester.harvestCycleSeconds.toFixed(1)}s`
        : '--'
      return `
        <button class="money-tooltip__item money-tooltip__item--harvester money-tooltip__link" type="button" data-unit-id="${harvester.id}">
          <span class="money-tooltip__item-title">Harvester ${index + 1}</span>
          <span class="money-tooltip__meta">
            <span class="money-tooltip__chip">💰 ${formatMoney(totalEarned)}</span>
            <span class="money-tooltip__chip">⏱ ${cycleSeconds}</span>
            <span class="money-tooltip__chip">⛽ ${fuelPercent}%</span>
            <span class="money-tooltip__chip money-tooltip__crew">👥 ${crewActive}/${crewTotal}</span>
          </span>
        </button>
      `
    }).join('')
    : '<div class="money-tooltip__empty">No harvesters active.</div>'

  content.innerHTML = `
    <div class="money-tooltip__section">
      <div class="money-tooltip__section-header">Refineries</div>
      <div class="money-tooltip__list">${refineryRows}</div>
    </div>
    <div class="money-tooltip__section">
      <div class="money-tooltip__section-header">Harvesters</div>
      <div class="money-tooltip__list">${harvesterRows}</div>
    </div>
  `
}

function positionMoneyTooltip(anchor) {
  const tooltip = ensureMoneyTooltip()
  const isTouch = getIsTouchLayout()
  tooltip.classList.toggle('money-tooltip--touch', isTouch)
  tooltip.classList.toggle('money-tooltip--desktop', !isTouch)

  const rect = anchor.getBoundingClientRect()
  tooltip.style.top = '0'
  tooltip.style.left = '0'
  tooltip.style.bottom = 'auto'
  tooltip.style.transform = 'translateX(-50%)'

  const tooltipRect = tooltip.getBoundingClientRect()
  const tooltipWidth = tooltipRect.width || 320
  const tooltipHeight = tooltipRect.height || 200
  const gutter = 12
  let left = rect.left + rect.width / 2
  left = Math.min(Math.max(left, tooltipWidth / 2 + gutter), window.innerWidth - tooltipWidth / 2 - gutter)
  let top = rect.bottom + 8
  if (top + tooltipHeight + gutter > window.innerHeight) {
    top = rect.top - tooltipHeight - 8
  }
  if (top < gutter) {
    top = gutter
  }

  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

function showMoneyTooltip(anchor) {
  const tooltip = ensureMoneyTooltip()
  renderMoneyTooltipContent()
  tooltip.setAttribute('aria-hidden', 'false')
  tooltip.classList.add('money-tooltip--visible')
  positionMoneyTooltip(anchor)
  tooltipOpen = true
}

function hideMoneyTooltip() {
  const tooltip = ensureMoneyTooltip()
  tooltip.setAttribute('aria-hidden', 'true')
  tooltip.classList.remove('money-tooltip--visible')
  tooltipOpen = false
}

function toggleMoneyTooltip(anchor) {
  if (tooltipOpen) {
    hideMoneyTooltip()
  } else {
    showMoneyTooltip(anchor)
  }
}

function clearSelections() {
  const units = gameState.units || []
  const buildings = gameState.buildings || []
  const factories = gameState.factories || []
  units.forEach(unit => { unit.selected = false })
  buildings.forEach(building => { building.selected = false })
  factories.forEach(factory => { factory.selected = false })
  selectedUnits.length = 0
  gameState.selectedWreckId = null
}

function selectEntity(entity, type) {
  clearSelections()
  entity.selected = true
  selectedUnits.push(entity)

  if (type === 'unit') {
    const centerX = entity.x + TILE_SIZE / 2
    const centerY = entity.y + TILE_SIZE / 2
    focusCameraOnPoint({ x: centerX, y: centerY })
  } else if (type === 'building') {
    const centerX = (entity.x + entity.width / 2) * TILE_SIZE
    const centerY = (entity.y + entity.height / 2) * TILE_SIZE
    focusCameraOnPoint({ x: centerX, y: centerY })
  }
}

function attachTooltipListeners() {
  if (tooltipListenersAttached) return
  tooltipListenersAttached = true

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('#moneyBarContainer, #mobileMoneyDisplay')
    const tooltip = document.getElementById('moneyTooltip')
    if (trigger) {
      event.preventDefault()
      toggleMoneyTooltip(trigger)
      return
    }
    if (tooltip && tooltip.classList.contains('money-tooltip--visible')) {
      if (!event.target.closest('#moneyTooltip')) {
        hideMoneyTooltip()
      }
    }
  })

  window.addEventListener('resize', () => {
    if (!tooltipOpen) return
    const trigger = document.querySelector('#moneyBarContainer, #mobileMoneyDisplay')
    if (trigger) {
      positionMoneyTooltip(trigger)
    }
  })
}

// Add money indicator to sidebar with money bar
export function addMoneyIndicator() {
  // Get the money bar container that's already in the HTML
  const moneyBarContainer = document.getElementById('moneyBarContainer')
  if (!moneyBarContainer) {
    window.logger.warn('Money bar container not found!')
    return
  }

  // Clear any existing content to prevent duplicates
  moneyBarContainer.innerHTML = ''

  const moneyTrack = document.createElement('div')
  moneyTrack.id = 'moneyBarTrack'
  moneyTrack.className = 'money-bar-track'
  moneyTrack.style.position = 'absolute'
  moneyTrack.style.left = '0'
  moneyTrack.style.bottom = '0'
  moneyTrack.style.width = '100%'
  moneyTrack.style.height = '14px' // 2px higher than energy bar
  moneyTrack.style.backgroundColor = 'rgba(12, 12, 12, 0.85)'
  moneyTrack.style.borderRadius = '0'
  moneyTrack.style.overflow = 'hidden'

  // Create money bar
  const moneyBar = document.createElement('div')
  moneyBar.id = 'moneyBar'
  moneyBar.style.position = 'absolute'
  moneyBar.style.top = '0'
  moneyBar.style.left = '0'
  moneyBar.style.height = '100%'
  moneyBar.style.width = '100%'
  moneyBar.style.background = getMoneyBarGradient()

  // Create money text/value overlay
  const moneyText = document.createElement('div')
  moneyText.id = 'moneyText'
  moneyText.className = 'money-bar-value'
  moneyText.style.position = 'absolute'
  moneyText.style.top = '0'
  moneyText.style.left = '0'
  moneyText.style.width = '100%'
  moneyText.style.height = '100%'
  moneyText.style.display = 'flex'
  moneyText.style.alignItems = 'center'
  moneyText.style.justifyContent = 'center'
  moneyText.style.fontSize = '12px'
  moneyText.style.fontWeight = '600'
  moneyText.style.textShadow = '0 0 3px #000'
  moneyText.style.color = '#fff' // White text for orange background
  moneyText.textContent = '$0'

  moneyTrack.appendChild(moneyBar)
  moneyTrack.appendChild(moneyText)

  // Add elements to container
  moneyBarContainer.appendChild(moneyTrack)

  // Make sure the container itself is visible and properly styled
  moneyBarContainer.style.display = 'block'
  moneyBarContainer.style.visibility = 'visible'
  moneyBarContainer.style.position = 'relative'
  moneyBarContainer.style.overflow = 'visible'
  moneyBarContainer.style.margin = '0'
  moneyBarContainer.style.padding = '0'

  attachTooltipListeners()

  // Force an immediate update
  setTimeout(() => updateMoneyBar(), 100)
}

// Update the money bar display
export function updateMoneyBar() {
  const moneyBar = document.getElementById('moneyBar')
  const moneyText = document.getElementById('moneyText')

  if (!moneyBar || !moneyText) {
    // Try to recreate the money bar if not found
    addMoneyIndicator()
    return
  }

  // Calculate percentage based on 100k cap
  const currentMoney = Math.max(0, Math.floor(gameState.money || 0))
  const maxMoney = 100000 // 100k cap
  const moneyPercentage = Math.min(100, (currentMoney / maxMoney) * 100)

  // Update bar width
  moneyBar.style.width = `${moneyPercentage}%`

  // Update text to show current money
  moneyText.textContent = `$${currentMoney.toLocaleString()}`
}
