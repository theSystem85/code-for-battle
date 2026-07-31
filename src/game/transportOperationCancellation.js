import { TILE_SIZE } from '../config.js'

const TRANSPORT_TYPES = new Set(['hovercraft', 'vehicleFerry'])

function stopUnit(unit) {
  unit.path = []
  unit.moveTarget = null
  if (unit.movement) {
    unit.movement.velocity = { x: 0, y: 0 }
    unit.movement.targetVelocity = { x: 0, y: 0 }
    unit.movement.currentSpeed = 0
    unit.movement.isMoving = false
  }
}

function clearGuardState(unit) {
  unit.guardMode = false
  unit.guardTarget = null
  unit.guardTargets = null
}

function addUnitOccupancyAtCenter(unit, occupancyMap) {
  if (!occupancyMap) return
  const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  unit.tileX = tileX
  unit.tileY = tileY
  if (occupancyMap?.[tileY]?.[tileX] === undefined) return
  occupancyMap[tileY][tileX] = (occupancyMap[tileY][tileX] || 0) + 1
}

function cancelSingleTransportOperation(transport, units, occupancyMap, selectedIds) {
  const pendingIds = new Set([
    ...(transport.pendingLoadUnitIds || []),
    ...(transport.transportOperation?.cargoIds || []),
    transport.transportOperation?.activeCargoId
  ].filter(Boolean))
  const linkedCargo = units.filter(unit =>
    unit.transportTransfer?.transportId === transport.id ||
    unit.pendingTransportId === transport.id ||
    pendingIds.has(unit.id)
  )

  linkedCargo.forEach(cargo => {
    const transfer = cargo.transportTransfer
    if (transfer?.transportId === transport.id && transfer.kind === 'load') {
      cargo.x = transfer.startX
      cargo.y = transfer.startY
      cargo.embarkedOnId = null
      cargo.transportTransfer = null
      addUnitOccupancyAtCenter(cargo, occupancyMap)
    } else if (transfer?.transportId === transport.id && transfer.kind === 'unload') {
      cargo.transportTransfer = null
      cargo.embarkedOnId = transport.id
      cargo.x = transport.x
      cargo.y = transport.y
      cargo.tileX = Math.floor((cargo.x + TILE_SIZE / 2) / TILE_SIZE)
      cargo.tileY = Math.floor((cargo.y + TILE_SIZE / 2) / TILE_SIZE)
      if (!transport.embarkedUnitIds.includes(cargo.id)) transport.embarkedUnitIds.unshift(cargo.id)
    }

    cargo.pendingTransportId = null
    cargo.transportBoardingLocked = false
    cargo.target = null
    stopUnit(cargo)
    clearGuardState(cargo)
    if (selectedIds.has(cargo.id)) cargo.selected = true
  })

  transport.pendingLoadUnitId = null
  transport.pendingLoadUnitIds = []
  transport.pendingLoadRendezvous = null
  transport.pendingUnloadTile = null
  transport.transportOperation = null
  transport.transportAngularVelocity = 0
  transport.embarkedUnitTypes = transport.embarkedUnitIds
    .map(id => units.find(unit => unit.id === id)?.type)
    .filter(Boolean)
  stopUnit(transport)
  clearGuardState(transport)
}

export function cancelTransportOperations(selectedUnits, units, occupancyMap = null) {
  if (!Array.isArray(selectedUnits) || !Array.isArray(units)) return 0
  const selectedIds = new Set(selectedUnits.map(unit => unit?.id).filter(Boolean))
  const transportIds = new Set()

  selectedUnits.forEach(unit => {
    if (TRANSPORT_TYPES.has(unit?.type)) transportIds.add(unit.id)
    if (unit?.transportTransfer?.transportId) transportIds.add(unit.transportTransfer.transportId)
    if (unit?.pendingTransportId) transportIds.add(unit.pendingTransportId)
  })
  units.forEach(transport => {
    if (!TRANSPORT_TYPES.has(transport?.type)) return
    const participantIds = [
      ...(transport.pendingLoadUnitIds || []),
      ...(transport.transportOperation?.cargoIds || []),
      transport.transportOperation?.activeCargoId
    ].filter(Boolean)
    if (participantIds.some(id => selectedIds.has(id))) transportIds.add(transport.id)
  })

  let canceledCount = 0
  transportIds.forEach(transportId => {
    const transport = units.find(unit => unit.id === transportId && TRANSPORT_TYPES.has(unit.type))
    if (!transport) return
    const hasOperation = Boolean(
      transport.transportOperation ||
      transport.pendingLoadRendezvous ||
      transport.pendingUnloadTile ||
      transport.pendingLoadUnitId ||
      transport.pendingLoadUnitIds?.length
    )
    if (!hasOperation) return
    cancelSingleTransportOperation(transport, units, occupancyMap, selectedIds)
    canceledCount++
  })
  return canceledCount
}
