import { buildingData } from '../data/buildingData.js'
import { canPlaceBuilding, isBuildingFootprintInBuildRange } from '../validation/buildingPlacement.js'

export function isBaseDefence(type) {
  return type === 'concreteWall' || type === 'rocketTurret' || type === 'artilleryTurret' ||
    type === 'teslaCoil' || type?.startsWith('turretGun')
}

const live = building => building.health > 0 && !building.isBeingSold
const key = (x, y) => `${x},${y}`
const matches = (building, slot) => building.x === slot.x && building.y === slot.y &&
  (building.type === slot.type || (slot.type === 'turretGunV3' && building.type.startsWith('turretGun')))

// Called only on construction decisions (once per six seconds per AI), never per unit/frame.
// Bounds depend on economic buildings alone: adding a defence cannot expand its own perimeter.
export function planBaseDefence(owner, mapGrid, buildings, factories) {
  const yard = factories.find(f => (f.id === owner || f.owner === owner) && f.health > 0)
  if (!yard || !Number.isFinite(yard.x) || !Number.isFinite(yard.y) || !mapGrid?.[0]?.length) return null
  const core = [yard, ...buildings.filter(b => b.owner === owner && live(b) &&
    Number.isFinite(b.x) && Number.isFinite(b.y) && !isBaseDefence(b.type) && b.type !== 'street' && b.type !== 'shipyard')]
  const width = b => b.width || buildingData[b.type]?.width || 1
  const height = b => b.height || buildingData[b.type]?.height || 1
  const bounds = {
    left: Math.max(0, Math.min(...core.map(b => b.x)) - 3),
    right: Math.min(mapGrid[0].length - 1, Math.max(...core.map(b => b.x + width(b))) + 2),
    top: Math.max(0, Math.min(...core.map(b => b.y)) - 3),
    bottom: Math.min(mapGrid.length - 1, Math.max(...core.map(b => b.y + height(b))) + 2)
  }
  const sides = [
    { x: bounds.left, y: bounds.top, dx: 1, dy: 0, nx: 0, ny: -1, length: bounds.right - bounds.left },
    { x: bounds.left, y: bounds.bottom, dx: 1, dy: 0, nx: 0, ny: 1, length: bounds.right - bounds.left },
    { x: bounds.left, y: bounds.top, dx: 0, dy: 1, nx: -1, ny: 0, length: bounds.bottom - bounds.top },
    { x: bounds.right, y: bounds.top, dx: 0, dy: 1, nx: 1, ny: 0, length: bounds.bottom - bounds.top }
  ]
  const gates = []
  for (const side of sides) {
    let start = null
    for (let i = 0; i <= side.length + 1; i++) {
      const street = i <= side.length && mapGrid[side.y + side.dy * i]?.[side.x + side.dx * i]?.type === 'street'
      if (street && start === null) start = i
      if (!street && start !== null) {
        gates.push({ ...side, offset: Math.max(1, Math.min(side.length - 1, Math.floor((start + i - 1) / 2))) })
        start = null
      }
    }
  }
  const enemies = factories.filter(f => f.id !== owner && f.owner !== owner && f.health > 0)
  const cx = (bounds.left + bounds.right) / 2
  const cy = (bounds.top + bounds.bottom) / 2
  // Maps without roads still need an exit facing the nearest opponent.
  if (!gates.length) {
    const enemy = enemies.slice().sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0]
    const side = sides.slice().sort((a, b) => ((enemy?.x ?? cx) - cx) * (b.nx - a.nx) + ((enemy?.y ?? cy + 1) - cy) * (b.ny - a.ny))[0]
    gates.push({ ...side, offset: Math.floor(side.length / 2) })
  }
  const priority = gate => enemies.length ? Math.min(...enemies.map(e => Math.hypot(e.x - gate.x - gate.dx * gate.offset, e.y - gate.y - gate.dy * gate.offset))) : 0
  gates.sort((a, b) => priority(a) - priority(b))
  const openings = new Set()
  for (const gate of gates) {
    for (let i = -1; i <= 1; i++) openings.add(key(gate.x + gate.dx * (gate.offset + i), gate.y + gate.dy * (gate.offset + i)))
  }
  const walls = new Map()
  for (const side of sides) {
    for (let i = 0; i <= side.length; i++) {
      const x = side.x + side.dx * i
      const y = side.y + side.dy * i
      if (!openings.has(key(x, y))) walls.set(key(x, y), { type: 'concreteWall', x, y })
    }
  }
  const slots = []
  const reserved = new Set()
  for (const gate of gates) {
    // Three heavy weapons flank the entrance inside the wall; the gun covers it outside.
    clusterSearch: for (const sign of [-1, 1]) {
      for (const rearDepth of [-1, -2]) {
        const cluster = ['rocketTurret', 'teslaCoil', 'artilleryTurret', 'turretGunV3'].map((type, index) => {
          const data = buildingData[type]
          const offset = gate.offset + sign * (index === 3 ? 3 : 3 + index * 2)
          const depth = index === 3 ? 1 : rearDepth
          const centerX = gate.x + gate.dx * offset + gate.nx * depth
          const centerY = gate.y + gate.dy * offset + gate.ny * depth
          return { type, x: Math.floor(centerX - (data.width - 1) / 2), y: Math.floor(centerY - (data.height - 1) / 2) }
        })
        // At least one heavy weapon must anchor to infrastructure; the contiguous cluster
        // then extends normal build range to its neighbours and the gun outside the wall.
        if (!cluster.slice(0, 3).some(slot => isBuildingFootprintInBuildRange(
          slot.type, slot.x, slot.y, core.slice(1), [yard], owner
        ))) continue
        const cells = []
        const fits = cluster.every(slot => {
          const data = buildingData[slot.type]
          for (let y = slot.y; y < slot.y + data.height; y++) {
            for (let x = slot.x; x < slot.x + data.width; x++) {
              const tile = mapGrid[y]?.[x]
              const inside = x > bounds.left && x < bounds.right && y > bounds.top && y < bounds.bottom
              if (!tile || ['water', 'rock', 'street'].includes(tile.type) || tile.noBuild || tile.seedCrystal ||
                reserved.has(key(x, y)) || walls.has(key(x, y)) || openings.has(key(x, y)) ||
                (slot.type !== 'turretGunV3' && !inside) ||
                core.some(b => x >= b.x && x < b.x + width(b) && y >= b.y && y < b.y + height(b))) return false
              cells.push(key(x, y))
            }
          }
          return true
        })
        if (fits) {
          slots.push(...cluster)
          cells.forEach(cell => reserved.add(cell))
          break clusterSearch
        }
      }
    }
  }
  return { bounds, gates, walls: [...walls.values()], slots }
}

export function nextBaseDefence(plan, owner, mapGrid, units, buildings, factories, budget) {
  if (!plan) return null
  const owned = buildings.filter(b => b.owner === owner && live(b))
  const hasRadar = owned.some(b => b.type === 'radarStation')
  // Complete mixed clusters before filling the rest of the perimeter.
  for (const slot of [...plan.slots, ...plan.walls]) {
    const data = buildingData[slot.type]
    if (owned.some(b => matches(b, slot)) || (data.requiresRadar && !hasRadar) || budget < data.cost) continue
    if (canPlaceBuilding(slot.type, slot.x, slot.y, mapGrid, units, buildings, factories, owner)) return slot
  }
  return null
}

export function relocateBaseDefences(plan, owner, buildings, factory, now) {
  if (!plan) return
  const slots = [...plan.slots, ...plan.walls]
  // Sell a single obsolete weapon per decision to avoid removing all protection at once.
  let soldWeapon = false
  for (const building of buildings) {
    if (building.owner !== owner || !live(building) || !isBaseDefence(building.type) || slots.some(slot => matches(building, slot))) continue
    if (building.type !== 'concreteWall') {
      if (soldWeapon || !plan.slots.length || factory.budget < buildingData[building.type].cost) continue
      soldWeapon = true
    }
    building.isBeingSold = true
    building.sellStartTime = now
    factory.budget += Math.floor(buildingData[building.type].cost * 0.7)
  }
}
