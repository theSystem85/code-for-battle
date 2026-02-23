import { gameState } from '../gameState.js'
import { selectedUnits } from '../inputHandler.js'
import { TILE_SIZE, LONG_PRESS_MS } from '../config.js'
import { focusCameraOnPoint } from './tutorialSystem/helpers.js'
import { buildingData } from '../buildings.js'
import { getUnitCost } from '../utils.js'

let tooltipOpen = false
let tooltipListenersAttached = false
let activeAnchor = null
let activeContext = null

const unitDisplayNames = {
  tank: 'Tank V1',
  tank_v1: 'Tank V1',
  'tank-v2': 'Tank V2',
  'tank-v3': 'Tank V3',
  rocketTank: 'Rocket Tank',
  howitzer: 'Howitzer',
  harvester: 'Harvester',
  ambulance: 'Ambulance',
  tankerTruck: 'Tanker Truck',
  ammunitionTruck: 'Ammunition Truck',
  recoveryTank: 'Recovery Tank',
  apache: 'Apache',
  mineLayer: 'Mine Layer',
  mineSweeper: 'Mine Sweeper'
}

const buildingDescriptions = {
  powerPlant: 'Generates power to keep your base online and production running.',
  oreRefinery: 'Processes ore into money and supports harvester unload cycles.',
  vehicleFactory: 'Produces land vehicles and deploys them to rally points.',
  vehicleWorkshop: 'Repairs damaged vehicles and restores wrecks.',
  constructionYard: 'Constructs new buildings and expands your base footprint.',
  radarStation: 'Extends battlefield intel and enables advanced tech.',
  hospital: 'Restores crew for damaged vehicles and supports medics.',
  helipad: 'Hosts and resupplies Apache helicopters with fuel and ammo.',
  airstrip: 'Hosts and resupplies military jets with fuel and ammo.',
  gasStation: 'Refuels vehicles that require gas to operate.',
  ammunitionFactory: 'Reloads ammunition trucks and nearby ammo reserves.',
  turretGunV1: 'Basic defense turret that suppresses nearby threats.',
  turretGunV2: 'Upgraded turret with higher firepower and range.',
  turretGunV3: 'Advanced turret that excels at rapid enemy suppression.',
  rocketTurret: 'Long-range rocket defense against heavy armor.',
  teslaCoil: 'High-voltage defense that shocks clustered enemies.',
  artilleryTurret: 'Long-range artillery bombardment for siege defense.',
  concreteWall: 'Hardened barrier that blocks enemy movement.'
}

function ensureProductionTooltip() {
  let tooltip = document.getElementById('productionTooltip')
  if (tooltip) return tooltip

  tooltip = document.createElement('div')
  tooltip.id = 'productionTooltip'
  tooltip.className = 'money-tooltip production-tooltip'
  tooltip.setAttribute('aria-hidden', 'true')
  tooltip.innerHTML = `
    <div class="money-tooltip__panel">
      <div class="money-tooltip__header">
        <span class="production-tooltip__header-title"></span>
        <button class="money-tooltip__close" type="button" aria-label="Close">×</button>
      </div>
      <div class="money-tooltip__content"></div>
    </div>
  `

  document.body.appendChild(tooltip)

  const closeButton = tooltip.querySelector('.money-tooltip__close')
  closeButton?.addEventListener('click', () => {
    hideProductionTooltip()
  })

  tooltip.addEventListener('click', (event) => {
    const target = event.target.closest('.production-tooltip__link')
    if (!target) return
    event.preventDefault()
    const unitId = target.getAttribute('data-unit-id')
    const buildingId = target.getAttribute('data-building-id')
    const wreckId = target.getAttribute('data-wreck-id')
    if (unitId) {
      const unit = gameState.units.find(entry => entry.id === unitId)
      if (unit) {
        selectEntity(unit, 'unit')
        hideProductionTooltip()
      }
    } else if (buildingId) {
      const building = gameState.buildings.find(entry => (entry.id || `building_${entry.x}_${entry.y}`) === buildingId)
      if (building) {
        selectEntity(building, 'building')
        hideProductionTooltip()
      }
    } else if (wreckId) {
      const wreck = (gameState.unitWrecks || []).find(entry => entry.id === wreckId)
      if (wreck) {
        selectEntity(wreck, 'wreck')
        hideProductionTooltip()
      }
    }
  })

  return tooltip
}

function getIsTouchLayout() {
  return Boolean(document.body?.classList.contains('is-touch'))
}

function formatMoney(value) {
  return `$${Math.max(0, Math.round(value || 0)).toLocaleString()}`
}

function formatPower(value) {
  const power = Number.isFinite(value) ? value : 0
  const sign = power > 0 ? '+' : ''
  return `${sign}${power}`
}

function getUnitLabel(unitType) {
  return unitDisplayNames[unitType] || unitType.replace(/[_-]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function getUnitStatus(unit) {
  if (unit.repairingAtWorkshop) return 'being repaired'
  if (unit.isBeingAttacked) return 'being attacked'
  if (unit.target && unit.target.health > 0) {
    if (unit.path && unit.path.length > 0) return 'moving to target'
    if (unit.moveTarget) return 'moving to target'
    return 'attacking'
  }
  if ((unit.path && unit.path.length > 0) || unit.moveTarget) return 'moving to location'
  return 'idle'
}

function getFuelDisplay(unit) {
  if (typeof unit.maxGas === 'number') {
    const percent = Math.max(0, Math.min(100, Math.round((unit.gas / unit.maxGas) * 100)))
    return `${percent}%`
  }
  return '--'
}

function getAmmoDisplay(unit) {
  if (typeof unit.maxAmmunition === 'number') {
    return `${Math.max(0, Math.round(unit.ammunition || 0))}/${unit.maxAmmunition}`
  }
  if (typeof unit.maxRocketAmmo === 'number') {
    return `${Math.max(0, Math.round(unit.rocketAmmo || 0))}/${unit.maxRocketAmmo}`
  }
  if (typeof unit.maxAmmoCargo === 'number') {
    return `${Math.max(0, Math.round(unit.ammoCargo || 0))}/${unit.maxAmmoCargo}`
  }
  return '--'
}

function getCrewDisplay(unit) {
  const crewEntries = unit.crew && typeof unit.crew === 'object'
    ? Object.values(unit.crew)
    : []
  if (!crewEntries.length) return '--'
  const crewTotal = crewEntries.length
  const crewActive = crewEntries.filter(Boolean).length
  return `${crewActive}/${crewTotal}`
}

function renderUnitTooltipContent(unitType) {
  const tooltip = ensureProductionTooltip()
  const content = tooltip.querySelector('.money-tooltip__content')
  const headerTitle = tooltip.querySelector('.production-tooltip__header-title')
  if (!content || !headerTitle) return

  // Map 'tank' to 'tank_v1' since units are stored with the actual type
  const actualUnitType = unitType === 'tank' ? 'tank_v1' : unitType
  headerTitle.textContent = getUnitLabel(unitType)

  const humanPlayer = gameState.humanPlayer
  const units = (gameState.units || []).filter(
    unit => unit.owner === humanPlayer && unit.type === actualUnitType && unit.health > 0
  )
  const restoredUnits = units.filter(unit => unit.isRestoredFromWreck)
  const totalCost = units
    .filter(unit => !unit.isRestoredFromWreck)
    .reduce((sum, unit) => sum + (unit.baseCost || getUnitCost(unitType) || 0), 0)
  const totalRepairPaid = units.reduce((sum, unit) => sum + (unit.totalRepairPaid || 0), 0)
  const wrecks = (gameState.unitWrecks || []).filter(
    wreck => wreck.owner === humanPlayer && wreck.unitType === actualUnitType
  )

  const unitRows = units.length
    ? units.map((unit, index) => {
      const healthDisplay = `${Math.max(0, Math.round(unit.health))}/${unit.maxHealth}`
      const damageValue = formatMoney(unit.damageValue)
      const status = getUnitStatus(unit)
      return `
        <button class="money-tooltip__item production-tooltip__row production-tooltip__link" type="button" data-unit-id="${unit.id}">
          <span class="production-tooltip__title">${getUnitLabel(unit.type)} ${index + 1}</span>
          <span class="production-tooltip__status">${status}</span>
          <span class="money-tooltip__meta production-tooltip__stats">
            <span class="money-tooltip__chip">❤️ ${healthDisplay}</span>
            <span class="money-tooltip__chip">⛽ ${getFuelDisplay(unit)}</span>
            <span class="money-tooltip__chip">🔫 ${getAmmoDisplay(unit)}</span>
            <span class="money-tooltip__chip">👥 ${getCrewDisplay(unit)}</span>
            <span class="money-tooltip__chip">⭐ ${unit.level || 0}</span>
            <span class="money-tooltip__chip">💥 ${damageValue}</span>
          </span>
        </button>
      `
    }).join('')
    : '<div class="money-tooltip__empty">No units active.</div>'

  const wreckRows = wrecks.length
    ? wrecks.map((wreck, index) => {
      const healthDisplay = `${Math.max(0, Math.round(wreck.health))}/${Math.max(1, wreck.maxHealth || 1)}`
      return `
        <button class="money-tooltip__item production-tooltip__row production-tooltip__link" type="button" data-wreck-id="${wreck.id}">
          <span class="production-tooltip__title">${getUnitLabel(wreck.unitType)} Wreck ${index + 1}</span>
          <span class="production-tooltip__status">wrecked</span>
          <span class="money-tooltip__meta production-tooltip__stats">
            <span class="money-tooltip__chip">💔 ${healthDisplay}</span>
          </span>
        </button>
      `
    }).join('')
    : '<div class="money-tooltip__empty">No wrecks detected.</div>'

  content.innerHTML = `
    <div class="money-tooltip__section">
      <div class="money-tooltip__section-header">Summary</div>
      <div class="production-tooltip__summary">
        <span class="money-tooltip__chip">🧰 ${units.length} active</span>
        <span class="money-tooltip__chip">💰 ${formatMoney(totalCost)} built</span>
        <span class="money-tooltip__chip">🧱 ${restoredUnits.length} restored</span>
        <span class="money-tooltip__chip">🛠 ${formatMoney(totalRepairPaid)} repairs</span>
      </div>
    </div>
    <div class="money-tooltip__section">
      <div class="money-tooltip__section-header">Units</div>
      <div class="money-tooltip__list production-tooltip__list">${unitRows}</div>
    </div>
    <div class="money-tooltip__section">
      <div class="money-tooltip__section-header">Wrecks</div>
      <div class="money-tooltip__list production-tooltip__list">${wreckRows}</div>
    </div>
  `
}

function renderBuildingTooltipContent(buildingType) {
  const tooltip = ensureProductionTooltip()
  const content = tooltip.querySelector('.money-tooltip__content')
  const headerTitle = tooltip.querySelector('.production-tooltip__header-title')
  if (!content || !headerTitle) return

  const humanPlayer = gameState.humanPlayer
  const buildings = (gameState.buildings || []).filter(
    building => building.owner === humanPlayer && building.type === buildingType && building.health > 0
  )
  const data = buildingData[buildingType] || {}
  headerTitle.textContent = data.displayName || buildingType
  const totalCost = buildings.length * (data.cost || 0)
  const totalPower = buildings.reduce((sum, building) => sum + (building.power || 0), 0)
  const description = buildingDescriptions[buildingType] || 'Operational support structure.'

  const buildingRows = buildings.length
    ? buildings.map((building, index) => {
      const healthDisplay = `${Math.max(0, Math.round(building.health))}/${building.maxHealth}`
      const damageValue = typeof building.damage === 'number'
        ? formatMoney(building.damageValue)
        : '--'
      const buildingId = building.id || `building_${building.x}_${building.y}`
      return `
        <button class="money-tooltip__item production-tooltip__row production-tooltip__link" type="button" data-building-id="${buildingId}">
          <span class="production-tooltip__title">${data.displayName || buildingType} ${index + 1}</span>
          <span class="production-tooltip__status">online</span>
          <span class="money-tooltip__meta production-tooltip__stats">
            <span class="money-tooltip__chip">❤️ ${healthDisplay}</span>
            <span class="money-tooltip__chip">💥 ${damageValue}</span>
          </span>
        </button>
      `
    }).join('')
    : '<div class="money-tooltip__empty">No buildings online.</div>'

  content.innerHTML = `
    <div class="money-tooltip__section">
      <div class="production-tooltip__description">${description}</div>
      <div class="production-tooltip__summary">
        <span class="money-tooltip__chip">💰 ${formatMoney(data.cost || 0)}</span>
        <span class="money-tooltip__chip">⚡ ${formatPower(data.power || 0)}</span>
      </div>
    </div>
    <div class="money-tooltip__section">
      <div class="money-tooltip__section-header">Summary</div>
      <div class="production-tooltip__summary">
        <span class="money-tooltip__chip">🏗 ${buildings.length} online</span>
        <span class="money-tooltip__chip">💵 ${formatMoney(totalCost)} invested</span>
        <span class="money-tooltip__chip">⚡ ${formatPower(totalPower)} net power</span>
      </div>
    </div>
    <div class="money-tooltip__section">
      <div class="money-tooltip__section-header">Buildings</div>
      <div class="money-tooltip__list production-tooltip__list">${buildingRows}</div>
    </div>
  `
}

function positionProductionTooltip(anchor) {
  const tooltip = ensureProductionTooltip()
  const isTouch = getIsTouchLayout()
  tooltip.classList.toggle('money-tooltip--touch', isTouch)
  tooltip.classList.toggle('money-tooltip--desktop', !isTouch)

  const rect = anchor.getBoundingClientRect()
  tooltip.style.top = '0'
  tooltip.style.left = '0'
  tooltip.style.bottom = 'auto'
  tooltip.style.transform = 'translateX(-50%)'

  const tooltipRect = tooltip.getBoundingClientRect()
  const tooltipWidth = tooltipRect.width || 360
  const tooltipHeight = tooltipRect.height || 240
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

function showProductionTooltip(anchor, context) {
  const tooltip = ensureProductionTooltip()
  activeAnchor = anchor
  activeContext = context

  if (context.kind === 'unit') {
    renderUnitTooltipContent(context.type)
  } else {
    renderBuildingTooltipContent(context.type)
  }

  tooltip.setAttribute('aria-hidden', 'false')
  tooltip.classList.add('money-tooltip--visible')
  positionProductionTooltip(anchor)
  tooltipOpen = true
}

function hideProductionTooltip() {
  const tooltip = ensureProductionTooltip()
  tooltip.setAttribute('aria-hidden', 'true')
  tooltip.classList.remove('money-tooltip--visible')
  tooltipOpen = false
  activeAnchor = null
  activeContext = null
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

  if (type === 'wreck') {
    gameState.selectedWreckId = entity.id
    const centerX = entity.x + TILE_SIZE / 2
    const centerY = entity.y + TILE_SIZE / 2
    focusCameraOnPoint({ x: centerX, y: centerY })
    return
  }

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

function attachGlobalTooltipListeners() {
  if (tooltipListenersAttached) return
  tooltipListenersAttached = true

  document.addEventListener('click', (event) => {
    if (!tooltipOpen) return
    const tooltip = document.getElementById('productionTooltip')
    if (!tooltip) return
    if (tooltip.contains(event.target)) return
    const anchor = event.target.closest?.('.production-button')
    if (anchor) return
    hideProductionTooltip()
  })

  window.addEventListener('resize', () => {
    if (!tooltipOpen || !activeAnchor || !activeContext) return
    positionProductionTooltip(activeAnchor)
  })
}

export function attachProductionTooltipHandlers(button, context, controller) {
  if (!button || button.dataset.tooltipAttached === 'true') return
  button.dataset.tooltipAttached = 'true'
  attachGlobalTooltipListeners()

  let holdTimer = null
  let activePointerId = null
  let pointerStartX = NaN
  let pointerStartY = NaN

  const DRAG_CANCEL_THRESHOLD_PX = 8

  const clearHoldTimer = () => {
    if (holdTimer) {
      window.clearTimeout(holdTimer)
      holdTimer = null
    }
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    activePointerId = event.pointerId
    pointerStartX = event.clientX
    pointerStartY = event.clientY
    clearHoldTimer()
    holdTimer = window.setTimeout(() => {
      controller.suppressNextClick = true
      showProductionTooltip(button, context)
    }, LONG_PRESS_MS)
  })

  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointerId) {
      return
    }

    if (controller.mobileDragState?.active && controller.mobileDragState.mode === 'drag') {
      clearHoldTimer()
      return
    }

    const deltaX = event.clientX - pointerStartX
    const deltaY = event.clientY - pointerStartY
    if (Math.abs(deltaX) >= DRAG_CANCEL_THRESHOLD_PX || Math.abs(deltaY) >= DRAG_CANCEL_THRESHOLD_PX) {
      clearHoldTimer()
    }
  })

  button.addEventListener('pointerup', (event) => {
    if (event.pointerId === activePointerId) {
      activePointerId = null
    }
    clearHoldTimer()
  })
  button.addEventListener('pointerleave', clearHoldTimer)
  button.addEventListener('pointercancel', (event) => {
    if (event.pointerId === activePointerId) {
      activePointerId = null
    }
    clearHoldTimer()
  })
  button.addEventListener('dragstart', clearHoldTimer)
}
