import { getEffectiveFireRange } from '../../game/unitCombat/fireRange.js'
import { TILE_SIZE } from '../../config.js'
import { canCommandPolicy } from '../../policies/policyStore.js'
import { isGroundUnit } from '../../utils/groundUnit.js'
import { canServeUnit } from './unitActions.js'
import { initiateRetreat } from '../../behaviours/retreat.js'
import { getServiceRadiusPixels } from '../../utils/serviceRadius.js'
import { createReplayEntityReference, createReplayUnitReferences, recordReplayCommand } from '../../replaySystem.js'

export const GROUND_ACTIONS = ['retreatTo', 'retreatToBase', 'planPath', 'callSupply']
export const SUPPLY_TYPES = { supplyAmmo: 'ammunitionTruck', supplyRepair: 'recoveryTank', supplyGas: 'tankerTruck', supplyCrew: 'ambulance' }
export const GROUND_COMMANDS = [...GROUND_ACTIONS, ...Object.keys(SUPPLY_TYPES), 'defendBuilding', 'repairAtBuilding', 'fuelAtBuilding', 'crewAtBuilding', 'ammoAtBuilding', 'unloadAtBuilding']

export function groundSelection(selection, owner) {
  return selection.filter(unit => isGroundUnit(unit) && unit.health > 0 && !unit.factoryExit &&
    !unit.embarkedOnId && !unit.transportOperation && !unit.transportTransfer && !unit.transportBoardingLocked &&
    canCommandPolicy(owner, unit.owner))
}

export function buildingActionOptions(selection, building, owner) {
  if (!groundSelection(selection, owner).length || !building || building.health <= 0 || building.isBeingSold ||
    building.constructionFinished === false || !canCommandPolicy(owner, building.owner)) return []
  const actions = ['defendBuilding']
  if (building.type === 'vehicleWorkshop') actions.push('repairAtBuilding')
  if (building.type === 'gasStation') actions.push('fuelAtBuilding')
  if (building.type === 'hospital') actions.push('crewAtBuilding')
  if (building.type === 'ammunitionFactory') actions.push('ammoAtBuilding')
  if (building.type === 'refinery' && selection.some(unit => unit.type === 'harvester')) actions.push('unloadAtBuilding')
  return actions
}

export function availableSupply(selection, owner, context, action) {
  const requesters = groundSelection(selection, owner)
  return context.units.filter(provider => provider.type === SUPPLY_TYPES[action] && provider.health > 0 &&
    !provider.factoryExit && !provider.embarkedOnId && !provider.transportOperation && !provider.transportTransfer && !provider.transportBoardingLocked &&
    provider.crew?.commander !== false && canCommandPolicy(owner, provider.owner) &&
    requesters.some(unit => canServeUnit(provider, unit, context.buildings, context.commands)))
}

function passable(x, y, grid) {
  const tile = grid?.[y]?.[x]
  return tile && !['water', 'rock'].includes(tile.type) && !tile.building && !tile.seedCrystal
}

// Only invoked on orders, never per simulation tick. Pick a free perimeter tile.
function buildingApproach(unit, building, context, assigned = new Set()) {
  const radius = getServiceRadiusPixels(building) || TILE_SIZE * 4
  const cx = (building.x + building.width / 2) * TILE_SIZE
  const cy = (building.y + building.height / 2) * TILE_SIZE
  let best = null
  let distance = Infinity
  for (let y = building.y - 2; y <= building.y + building.height + 1; y++) {
    for (let x = building.x - 2; x <= building.x + building.width + 1; x++) {
      if ((x >= building.x && x < building.x + building.width && y >= building.y && y < building.y + building.height) ||
        !passable(x, y, context.mapGrid) || assigned.has(`${x},${y}`)) continue
      const wx = (x + 0.5) * TILE_SIZE
      const wy = (y + 0.5) * TILE_SIZE
      if (Math.hypot(wx - cx, wy - cy) > radius) continue
      const d = Math.hypot(wx - unit.x - TILE_SIZE / 2, wy - unit.y - TILE_SIZE / 2)
      if (d < distance) { best = { x: wx, y: wy }; distance = d }
    }
  }
  return best
}

export function retreatBasePoint(unit, owner, context) {
  const friendly = (context.buildings || []).filter(building => building.health > 0 && !building.isBeingSold &&
    building.constructionFinished !== false && canCommandPolicy(owner, building.owner))
  const workshops = friendly.filter(building => building.type === 'vehicleWorkshop')
  const bases = workshops.length ? workshops : friendly.filter(building => ['constructionYard', 'vehicleFactory', 'commandCenter'].includes(building.type))
  bases.sort((a, b) => Math.hypot(a.x * TILE_SIZE - unit.x, a.y * TILE_SIZE - unit.y) - Math.hypot(b.x * TILE_SIZE - unit.x, b.y * TILE_SIZE - unit.y))
  for (const base of bases) {
    if (workshops.length) {
      const point = buildingApproach(unit, base, context)
      if (point) return point
    } else {
      // The rear side of the base is opposite its nearest hostile structure.
      const enemy = (context.buildings || []).filter(building => building.health > 0 && !canCommandPolicy(owner, building.owner))
        .sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y))[0]
      const dx = base.x - (enemy?.x ?? unit.x / TILE_SIZE)
      const dy = base.y - (enemy?.y ?? unit.y / TILE_SIZE)
      const scale = Math.hypot(dx, dy) || 1
      const bx = Math.round(base.x + base.width / 2 + dx / scale * (Math.max(base.width, base.height) / 2 + 3))
      const by = Math.round(base.y + base.height / 2 + dy / scale * (Math.max(base.width, base.height) / 2 + 3))
      for (let r = 0; r <= 3; r++) for (let y = by - r; y <= by + r; y++) for (let x = bx - r; x <= bx + r; x++) {
        if (passable(x, y, context.mapGrid)) return { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE }
      }
    }
  }
  return null
}

function replay(units, owner, details) {
  recordReplayCommand({ type: 'unit_command', owner, unitIds: units.map(unit => unit.id),
    unitRefs: createReplayUnitReferences(units.map(unit => unit.id)), ...details }, { source: 'human' })
}

export function applyGroundAction(payload, owner, context) {
  const ids = new Set(payload.entityIds)
  const owned = groundSelection(context.units.filter(unit => ids.has(unit.id)), owner)
  const selected = SUPPLY_TYPES[payload.action] ? owned : owned.filter(unit => unit.crew?.commander !== false)
  if (!selected.length) return false
  const { action } = payload
  if (action === 'retreatTo' || action === 'retreatToBase') {
    let accepted = false
    for (const unit of selected) {
      const point = action === 'retreatToBase' ? retreatBasePoint(unit, owner, context) : payload
      if (!point || !passable(Math.floor(point.x / TILE_SIZE), Math.floor(point.y / TILE_SIZE), context.mapGrid)) continue
      const target = unit.target
      context.commands.handleMovementCommand([unit], point.x, point.y, context.mapGrid)
      const path = unit.path
      if (!path?.length) continue
      unit.target = target
      initiateRetreat([unit], point.x, point.y, context.mapGrid, { allGround: true, forceBackward: true, owner: unit.owner })
      unit.path = path
      unit.retreatUsesPath = true
      unit.retreatFireRange = getEffectiveFireRange(unit)
      replay([unit], owner, { command: 'retreat', targetPos: { space: 'world', x: point.x, y: point.y }, retreatOptions: { allGround: true, forceBackward: true, owner: unit.owner }, retreatPath: path, retreatFireRange: unit.retreatFireRange })
      accepted = true
    }
    return accepted
  }
  if (action === 'planPath') {
    if (!Array.isArray(payload.points) || !payload.points.length || payload.points.length > 256 ||
      payload.points.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y) ||
        !passable(Math.floor(point.x / TILE_SIZE), Math.floor(point.y / TILE_SIZE), context.mapGrid))) return false
    const [first, ...rest] = payload.points
    context.commands.handleMovementCommand(selected, first.x, first.y, context.mapGrid)
    for (const unit of selected) unit.commandQueue = payload.points.map(point => ({ type: 'move', x: point.x, y: point.y }))
    // The queue owns the first move as well; it waits for completion before the next.
    for (const unit of selected) { unit.currentCommand = unit.commandQueue.shift() }
    replay(selected, owner, { command: 'move', targetPos: { space: 'world', ...first }, plannedRouteStart: true })
    for (const point of rest) replay(selected, owner, { command: 'move', targetPos: { space: 'world', ...point }, queueAppend: true })
    return true
  }
  if (SUPPLY_TYPES[action]) {
    const providers = availableSupply(selected, owner, context, action)
    if (!providers.length) return false
    const assignments = new Map()
    for (const requester of selected) {
      const nearest = providers.filter(provider => canServeUnit(provider, requester, context.buildings, context.commands))
        .sort((a, b) => Math.hypot(a.x - requester.x, a.y - requester.y) - Math.hypot(b.x - requester.x, b.y - requester.y))[0]
      if (!nearest) continue
      if (!assignments.has(nearest)) assignments.set(nearest, [])
      assignments.get(nearest).push(requester)
    }
    let accepted = false
    for (const [provider, requesters] of assignments) {
      if (context.commands.handleServiceProviderRequest(provider, requesters, context.mapGrid)) {
        replay([provider], owner, { command: 'service_provider_request', providerRef: createReplayEntityReference(provider), requesterRefs: requesters.map(createReplayEntityReference) })
        accepted = true
      }
    }
    return accepted
  }
  const building = context.buildings?.find(candidate => candidate.id === payload.targetId)
  if (!buildingActionOptions(selected, building, owner).includes(action)) return false
  if (action === 'repairAtBuilding' || action === 'unloadAtBuilding') {
    const recipients = action === 'repairAtBuilding' ? selected : selected.filter(unit => unit.type === 'harvester')
    // Reset utility/guard/retreat state before entering the existing service order.
    for (const unit of recipients) context.commands.handleMovementCommand([unit], unit.x + TILE_SIZE / 2, unit.y + TILE_SIZE / 2, context.mapGrid)
    const method = action === 'repairAtBuilding' ? 'handleRepairWorkshopCommand' : 'handleRefineryUnloadCommand'
    context.commands[method](recipients, building, context.mapGrid)
    replay(recipients, owner, { command: action === 'repairAtBuilding' ? 'repair_workshop' : 'refinery_unload', targetRef: createReplayEntityReference(building) })
    return true
  }
  const assigned = new Set()
  let accepted = false
  for (const unit of selected) {
    const point = buildingApproach(unit, building, context, assigned)
    if (!point) continue
    assigned.add(`${Math.floor(point.x / TILE_SIZE)},${Math.floor(point.y / TILE_SIZE)}`)
    context.commands.handleMovementCommand([unit], point.x, point.y, context.mapGrid)
    replay([unit], owner, { command: 'move', targetPos: { space: 'world', ...point } })
    if (action === 'defendBuilding') {
      unit.guardTargets = [building]
      unit.guardTarget = building
      unit.guardMode = true
      unit.guardOrderMode = null
      replay([unit], owner, { command: 'guard', targetRef: createReplayEntityReference(building) })
    }
    accepted = true
  }
  return accepted
}
