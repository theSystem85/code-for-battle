import { gameState } from '../gameState.js'

// Map sprites, including the separate tank layers. These are prepared once when
// production controls are initialized; pointer events only move one DOM node.
export const unitDragSprites = {
  tank: ['tankV1_wagon', 'tankV1_turret', 'tankV1_barrel'],
  'tank-v2': ['tankV2_wagon', 'tankV2_turret', 'tankV2_barrel'],
  'tank-v3': ['tankV3_wagon', 'tankV3_turret', 'tankV3_barrel'],
  lightTank: ['lightTank_wagon', 'lightTank_turret', 'lightTank_barrel'],
  rocketTank: ['rocket_tank'], harvester: ['harvester'],
  howitzer: ['howitzer_map', 'howitzer_barrel'],
  tankerTruck: ['tanker_truck'], ammunitionTruck: ['ammunition_truck_map'],
  recoveryTank: ['recovery_tank'], ambulance: ['ambulance'],
  mineLayer: ['mine_layer_map'], mineSweeper: ['minesweeper_map'],
  apache: ['apache_map'], f22Raptor: ['f22_raptor_map'], f35: ['f35_map'],
  destroyer: ['destroyer_map'], hovercraft: ['hovercraft_map'],
  vehicleFerry: ['vehicle_ferry_map'], aircraftCarrier: ['aircraft_carrier_map'],
  navalMineLayer: ['naval_mine_layer_map'], battleship: ['battleship_map'],
  submarine: ['submarine_map'], supplyShip: ['supply_ship_map']
}

export function initUnitDragPreview(doc = document) {
  if (doc.getElementById('unitDragPreview')) return
  const preview = doc.createElement('div')
  preview.id = 'unitDragPreview'
  preview.hidden = true
  preview.setAttribute('aria-hidden', 'true')
  Object.assign(preview.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '10010',
    width: '48px', height: '48px', opacity: '0.8',
    transform: 'translate(-50%, -50%)'
  })
  const sprites = new Map()
  for (const [type, layers] of Object.entries(unitDragSprites)) {
    const node = doc.createElement('div')
    node.hidden = true
    for (const layer of layers) {
      const img = doc.createElement('img')
      img.src = `/images/map/units/${layer}.webp`
      img.alt = ''
      img.draggable = false
      Object.assign(img.style, { position: 'absolute', inset: '0', width: '48px', height: '48px', objectFit: 'contain' })
      node.append(img)
    }
    sprites.set(type, node)
    preview.append(node)
  }
  doc.body.append(preview)
  let shown = null
  const hide = () => { preview.hidden = true }
  const move = event => {
    const type = gameState.draggedUnitType
    const canvas = doc.getElementById('gameCanvas')
    if (!type || !canvas) return hide()
    const bounds = canvas.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return hide()
    if (shown !== type) {
      if (shown) sprites.get(shown).hidden = true
      shown = sprites.has(type) ? type : null
      if (shown) sprites.get(shown).hidden = false
    }
    preview.hidden = !shown
    preview.style.left = `${event.clientX}px`
    preview.style.top = `${event.clientY}px`
  }
  doc.addEventListener('dragover', move)
  doc.addEventListener('pointermove', move)
  for (const event of ['drop', 'dragend', 'pointerup', 'pointercancel']) doc.addEventListener(event, hide)
  doc.defaultView?.addEventListener('blur', hide)
}
