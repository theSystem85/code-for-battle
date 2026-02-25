import { gameState } from '../gameState.js'
import { TILE_SIZE } from '../config.js'
import { getLlmSettings } from '../ai/llmSettings.js'
import { buildingData } from '../buildings.js'
import { getLlmQueueState } from '../ai-api/applier.js'

let tooltipOpen = false
let listenersAttached = false
let activeBuildingId = null

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
  f22Raptor: 'F22 Raptor',
  mineLayer: 'Mine Layer',
  mineSweeper: 'Mine Sweeper'
}

const unitSidebarImages = {
  tank: 'images/sidebar/tank.webp',
  tank_v1: 'images/sidebar/tank.webp',
  'tank-v2': 'images/sidebar/tank_v2.webp',
  'tank-v3': 'images/sidebar/tank_v3.webp',
  rocketTank: 'images/sidebar/rocket_tank.webp',
  harvester: 'images/sidebar/harvester.webp',
  ambulance: 'images/sidebar/ambulance.webp',
  tankerTruck: 'images/sidebar/tanker_truck.webp',
  ammunitionTruck: 'images/sidebar/ammunition_truck_sidebar.webp',
  recoveryTank: 'images/sidebar/recovery_tank.webp',
  apache: 'images/sidebar/apache_sidebar.webp',
  f22Raptor: 'images/sidebar/f22_raptor_sidebar.webp',
  howitzer: 'images/sidebar/howitzer_sidebar.webp',
  mineLayer: 'images/sidebar/mine_layer_sidebar.webp',
  mineSweeper: 'images/sidebar/mine_sweeper_sidebar.webp'
}

const buildingSidebarImages = {
  powerPlant: 'images/sidebar/power_plant.webp',
  oreRefinery: 'images/sidebar/ore_refinery.webp',
  vehicleFactory: 'images/sidebar/vehicle_factory.webp',
  vehicleWorkshop: 'images/sidebar/vehicle_workshop.webp',
  constructionYard: 'images/sidebar/construction_yard.webp',
  radarStation: 'images/sidebar/radar_station.webp',
  hospital: 'images/sidebar/hospital.webp',
  helipad: 'images/sidebar/helipad_sidebar.webp',
  gasStation: 'images/sidebar/gas_station.webp',
  ammunitionFactory: 'images/sidebar/ammunition_factory_sidebar.webp',
  turretGunV1: 'images/sidebar/turret_gun_v1.webp',
  turretGunV2: 'images/sidebar/turret_gun_v2.webp',
  turretGunV3: 'images/sidebar/turret_gun_v3.webp',
  rocketTurret: 'images/sidebar/rocket_turret.webp',
  teslaCoil: 'images/sidebar/tesla_coil.webp',
  artilleryTurret: 'images/sidebar/artillery_turret.webp',
  concreteWall: 'images/sidebar/concrete_wall.webp',
  concreteWallHorizontal: 'images/sidebar/concrete_wall.webp',
  concreteWallVertical: 'images/sidebar/concrete_wall.webp',
  concreteWallCross: 'images/sidebar/concrete_wall.webp'
}

function ensureTooltip() {
  let tooltip = document.getElementById('llmQueueTooltip')
  if (tooltip) return tooltip

  tooltip = document.createElement('div')
  tooltip.id = 'llmQueueTooltip'
  tooltip.className = 'llm-queue-tooltip money-tooltip'
  tooltip.setAttribute('aria-hidden', 'true')
  tooltip.innerHTML = `
    <div class="money-tooltip__panel">
      <div class="money-tooltip__header">
        <span>Enemy Strategic Backlog</span>
        <button class="money-tooltip__close" type="button" aria-label="Close">×</button>
      </div>
      <div class="money-tooltip__content"></div>
    </div>
  `

  document.body.appendChild(tooltip)
  const closeButton = tooltip.querySelector('.money-tooltip__close')
  closeButton?.addEventListener('click', () => hideLlmQueueTooltip())

  return tooltip
}

function getUnitLabel(unitType) {
  return unitDisplayNames[unitType] || unitType.replace(/[_-]/g, ' ').replace(/\b\w/g, match => match.toUpperCase())
}

function getBuildingLabel(buildingType) {
  const data = buildingData[buildingType]
  if (data?.displayName) return data.displayName
  return buildingType.replace(/[_-]/g, ' ').replace(/\b\w/g, match => match.toUpperCase())
}

function getSidebarImageForUnit(unitType) {
  return unitSidebarImages[unitType] || 'images/sidebar/tank.webp'
}

function getSidebarImageForBuilding(buildingType) {
  return buildingSidebarImages[buildingType] || 'images/sidebar/construction_yard.webp'
}

function getQueueItems(actions = [], queueState = null) {
  // If we have real queue tracking state, use it (shows live status)
  if (queueState) {
    const items = []
    for (const b of queueState.buildings) {
      items.push({
        kind: 'building',
        label: getBuildingLabel(b.buildingType),
        image: getSidebarImageForBuilding(b.buildingType),
        count: 1,
        status: b.status || 'queued'
      })
    }
    for (const u of queueState.units) {
      items.push({
        kind: 'unit',
        label: getUnitLabel(u.unitType),
        image: getSidebarImageForUnit(u.unitType),
        count: 1,
        status: u.status || 'queued'
      })
    }
    return items
  }
  // Fallback: parse from raw LLM plan actions
  return actions
    .filter(action => action.type === 'build_queue' || action.type === 'build_place')
    .map(action => {
      if (action.type === 'build_queue') {
        return {
          kind: 'unit',
          label: getUnitLabel(action.unitType),
          image: getSidebarImageForUnit(action.unitType),
          count: Math.max(1, Math.floor(action.count || 1)),
          status: 'queued'
        }
      }
      return {
        kind: 'building',
        label: getBuildingLabel(action.buildingType),
        image: getSidebarImageForBuilding(action.buildingType),
        count: 1,
        status: 'queued'
      }
    })
}

function getCommandItems(actions = []) {
  return actions
    .filter(action => action.type === 'unit_command' || action.type === 'sell_building' || action.type === 'repair_building')
    .map(action => {
      if (action.type === 'unit_command') {
        const count = (action.unitIds || []).length
        return {
          kind: 'command',
          label: `${(action.command || 'move').toUpperCase()} (${count} unit${count !== 1 ? 's' : ''})`,
          icon: action.command === 'attack' ? '⚔️' : action.command === 'guard' ? '🛡️' : '➡️'
        }
      }
      if (action.type === 'sell_building') {
        return { kind: 'sell', label: 'Sell building', icon: '💰' }
      }
      if (action.type === 'repair_building') {
        return { kind: 'repair', label: 'Repair building', icon: '🔧' }
      }
      return null
    })
    .filter(Boolean)
}

function getStatusIcon(status) {
  switch (status) {
    case 'completed': return '✓'
    case 'building': return '⏳'
    case 'failed': return '✗'
    default: return ''
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'completed': return 'Done'
    case 'building': return 'In progress'
    case 'failed': return 'Failed'
    default: return 'Queued'
  }
}

function renderQueueContent(playerId) {
  const tooltip = ensureTooltip()
  const content = tooltip.querySelector('.money-tooltip__content')
  if (!content) return

  const plan = gameState.llmStrategic?.plansByPlayer?.[playerId]
  const actions = plan?.actions || []
  const notes = plan?.notes || ''
  const queueState = getLlmQueueState(gameState, playerId)
  const hasQueueItems = (queueState.buildings.length > 0 || queueState.units.length > 0)
  const queueItems = getQueueItems(actions, hasQueueItems ? queueState : null)
  const commandItems = getCommandItems(actions)

  // Show latest/newest items on top so the player sees what's coming next
  queueItems.reverse()

  if (!queueItems.length && !commandItems.length && !notes) {
    content.innerHTML = '<div class="money-tooltip__empty">No strategic plan from the LLM yet.</div>'
    return
  }

  let html = ''

  // Notes / intent section
  if (notes) {
    const escapedNotes = notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    html += `
      <div class="money-tooltip__section">
        <div class="money-tooltip__section-header">🧠 Strategic Intent</div>
        <div class="llm-queue-tooltip__notes">${escapedNotes}</div>
      </div>
    `
  }

  // Production plan section
  if (queueItems.length) {
    const rows = queueItems.map((item, index) => {
      const statusIcon = getStatusIcon(item.status)
      const statusLabel = getStatusLabel(item.status)
      const statusClass = item.status === 'completed' ? ' llm-queue-tooltip__row--completed'
        : item.status === 'building' ? ' llm-queue-tooltip__row--building'
          : item.status === 'failed' ? ' llm-queue-tooltip__row--failed' : ''
      return `
        <div class="money-tooltip__item llm-queue-tooltip__row${statusClass}" data-kind="${item.kind}" data-status="${item.status}">
          <span class="llm-queue-tooltip__index">${statusIcon || `#${index + 1}`}</span>
          <img class="llm-queue-tooltip__icon" src="images/sidebar/placeholder.webp" onload="if(this.dataset.src){this.src=this.dataset.src;delete this.dataset.src;}" data-src="${item.image}" alt="${item.label}" loading="lazy" />
          <div class="llm-queue-tooltip__details">
            <span class="llm-queue-tooltip__title">${item.label}</span>
            <span class="llm-queue-tooltip__meta">${item.kind === 'unit' ? 'Unit' : 'Building'} — ${statusLabel}</span>
          </div>
          <span class="money-tooltip__item-value">x${item.count}</span>
        </div>
      `
    }).join('')

    html += `
      <div class="money-tooltip__section">
        <div class="money-tooltip__section-header">🏭 Production Plan</div>
        <div class="money-tooltip__list llm-queue-tooltip__list">${rows}</div>
      </div>
    `
  }

  // Commands section (unit_command, sell, repair)
  if (commandItems.length) {
    const cmdRows = commandItems.map((item, index) => {
      return `
        <div class="money-tooltip__item llm-queue-tooltip__row" data-kind="${item.kind}">
          <span class="llm-queue-tooltip__index">#${index + 1}</span>
          <span class="llm-queue-tooltip__cmd-icon">${item.icon}</span>
          <div class="llm-queue-tooltip__details">
            <span class="llm-queue-tooltip__title">${item.label}</span>
          </div>
        </div>
      `
    }).join('')

    html += `
      <div class="money-tooltip__section">
        <div class="money-tooltip__section-header">⚡ Commands</div>
        <div class="money-tooltip__list llm-queue-tooltip__list">${cmdRows}</div>
      </div>
    `
  }

  content.innerHTML = html
}

function positionTooltipBelowBuilding(building) {
  const tooltip = ensureTooltip()
  tooltip.style.transform = 'translate(-50%, 0)'
  const tooltipRect = tooltip.getBoundingClientRect()
  const gutter = 12

  // Position below the building center
  const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE - gameState.scrollOffset.x
  const buildingBottomY = (building.y + building.height) * TILE_SIZE - gameState.scrollOffset.y

  let left = buildingCenterX
  let top = buildingBottomY + 8

  // Horizontal bounds check
  if (left - tooltipRect.width / 2 < gutter) {
    left = tooltipRect.width / 2 + gutter
  }
  if (left + tooltipRect.width / 2 > window.innerWidth - gutter) {
    left = window.innerWidth - tooltipRect.width / 2 - gutter
  }

  // Vertical bounds check - if doesn't fit below, show above
  if (top + tooltipRect.height > window.innerHeight - gutter) {
    const buildingTopY = building.y * TILE_SIZE - gameState.scrollOffset.y
    top = buildingTopY - tooltipRect.height - 8
  }
  if (top < gutter) {
    top = gutter
  }

  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

function attachListeners() {
  if (listenersAttached) return
  listenersAttached = true

  document.addEventListener('click', (event) => {
    if (!tooltipOpen) return
    const tooltip = document.getElementById('llmQueueTooltip')
    if (tooltip && tooltip.contains(event.target)) return

    // Don't hide if an enemy building is selected (keep tooltip open for selection)
    const humanPlayer = gameState.humanPlayer || 'player1'
    const isEnemy = (owner) => owner !== humanPlayer && !(humanPlayer === 'player1' && owner === 'player')
    const allBuildings = [
      ...(gameState.buildings || []),
      ...(gameState.factories || [])
    ]
    const selectedBuilding = allBuildings.find(building => {
      if (!building) return false
      if (!isEnemy(building.owner)) return false
      return building.selected === true
    })

    // If a hostile building is selected, don't hide the tooltip
    if (selectedBuilding) {
      return
    }

    hideLlmQueueTooltip()
  })

  window.addEventListener('resize', () => {
    if (!tooltipOpen) return
    hideLlmQueueTooltip()
  })
}

export function showLlmQueueTooltip(building) {
  const settings = getLlmSettings()
  if (!settings.strategic.enabled) return
  if (!building) return
  const humanPlayer = gameState.humanPlayer || 'player1'
  if (building.owner === humanPlayer || (humanPlayer === 'player1' && building.owner === 'player')) return

  attachListeners()
  if (activeBuildingId !== building.id) {
    renderQueueContent(building.owner)
    activeBuildingId = building.id
  }

  const tooltip = ensureTooltip()
  tooltip.setAttribute('aria-hidden', 'false')
  tooltip.classList.add('money-tooltip--visible')
  tooltipOpen = true

  positionTooltipBelowBuilding(building)
}

export function updateLlmQueueTooltipForSelection() {
  const settings = getLlmSettings()
  if (!settings.strategic.enabled) {
    hideLlmQueueTooltip()
    return
  }

  const humanPlayer = gameState.humanPlayer || 'player1'
  const isEnemy = (owner) => owner !== humanPlayer && !(humanPlayer === 'player1' && owner === 'player')

  const allBuildings = [
    ...(gameState.buildings || []),
    ...(gameState.factories || [])
  ]

  const selectedBuilding = allBuildings.find(building => {
    if (!building) return false
    if (!isEnemy(building.owner)) return false
    return building.selected === true
  })

  if (!selectedBuilding) {
    hideLlmQueueTooltip()
    return
  }

  showLlmQueueTooltip(selectedBuilding)
}

export function hideLlmQueueTooltip() {
  const tooltip = document.getElementById('llmQueueTooltip')
  if (!tooltip) return
  tooltip.setAttribute('aria-hidden', 'true')
  tooltip.classList.remove('money-tooltip--visible')
  tooltipOpen = false
  activeBuildingId = null
}
