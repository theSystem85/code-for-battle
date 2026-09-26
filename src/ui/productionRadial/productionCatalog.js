export const CONDENSED_SIDEBAR_BUTTON_PX = 96
export const RADIAL_BUTTON_SCALE = 0.5

export const VEHICLE_FACTORY_UNITS = Object.freeze([
  'tank',
  'tank-v2',
  'tank-v3',
  'rocketTank',
  'howitzer',
  'recoveryTank',
  'harvester',
  'ambulance',
  'tankerTruck',
  'ammunitionTruck',
  'mineLayer',
  'mineSweeper'
])

export const HELIPAD_UNITS = Object.freeze(['apache', 'f35'])
export const AIRSTRIP_UNITS = Object.freeze(['f22Raptor', 'f35'])
export const SHIPYARD_UNITS = Object.freeze([
  'destroyer',
  'supplyShip',
  'hovercraft',
  'vehicleFerry',
  'aircraftCarrier',
  'navalMineLayer',
  'battleship',
  'submarine'
])

export const PRODUCTION_BUILDING_TYPES = Object.freeze([
  'constructionYard',
  'vehicleFactory',
  'helipad',
  'airstrip',
  'shipyard'
])

export function isProductionBuildingType(type) {
  return PRODUCTION_BUILDING_TYPES.includes(type)
}

export function radialProductionButtonSize() {
  let full = CONDENSED_SIDEBAR_BUTTON_PX
  if (typeof document !== 'undefined' && document.body) {
    const raw = window.getComputedStyle(document.body).getPropertyValue('--portrait-condensed-bar-height')
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0) full = parsed
  }
  return Math.round(full * RADIAL_BUTTON_SCALE)
}

export function catalogForBuilding(type) {
  if (type === 'constructionYard') return { kind: 'building', types: null }
  if (type === 'vehicleFactory') return { kind: 'unit', types: VEHICLE_FACTORY_UNITS }
  if (type === 'helipad') return { kind: 'unit', types: HELIPAD_UNITS }
  if (type === 'airstrip') return { kind: 'unit', types: AIRSTRIP_UNITS }
  if (type === 'shipyard') return { kind: 'unit', types: SHIPYARD_UNITS }
  return null
}

export function isSidebarProductionButtonVisible(button) {
  if (!button || !button.classList) return false
  if (button.style && button.style.display === 'none') return false
  return button.classList.contains('unlocked')
    || button.classList.contains('active')
    || button.classList.contains('paused')
    || button.classList.contains('ready-for-placement')
}

function buttonIcon(button) {
  const img = button.querySelector('img')
  if (!img) return ''
  return img.dataset?.src || img.getAttribute('data-src') || img.getAttribute('src') || ''
}

function buttonLabel(button, fallback) {
  const name = button.querySelector('.building-name, .unit-name')
  const text = name && name.textContent ? name.textContent.trim() : ''
  return text || fallback
}

export function buildProductionRadialItems(buildingType, options = {}) {
  const catalog = catalogForBuilding(buildingType)
  if (!catalog) return []
  const root = options.root || (typeof document !== 'undefined' ? document : null)
  if (!root || typeof root.querySelectorAll !== 'function') return []
  const attribute = catalog.kind === 'building' ? 'data-building-type' : 'data-unit-type'
  const buttons = Array.from(root.querySelectorAll(`.production-button[${attribute}]`))
  const allowed = catalog.types ? new Set(catalog.types) : null
  const items = []
  buttons.forEach(button => {
    const type = button.getAttribute(attribute)
    if (!type || (allowed && !allowed.has(type))) return
    if (!isSidebarProductionButtonVisible(button)) return
    items.push({
      id: `${catalog.kind}:${type}`,
      type,
      kind: catalog.kind,
      icon: buttonIcon(button),
      label: buttonLabel(button, type),
      disabled: button.classList.contains('disabled'),
      ready: button.classList.contains('ready-for-placement'),
      title: button.title || '',
      button
    })
  })
  return items
}
