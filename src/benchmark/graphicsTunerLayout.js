import { buildingData } from '../data/buildingData.js'
import { TILE_SIZE, UNIT_PROPERTIES } from '../config.js'
import { getNavalHullDimensions, navalUnitTypes } from '../utils/navalUtils.js'

export const GRAPHICS_BATTLE_MAP = Object.freeze({ width: 60, height: 48 })
export const GRAPHICS_BATTLE_VIEW = Object.freeze({ x: 8, y: 4, width: 46, height: 40 })

const BASE = [
  ['constructionYard', 19, 7], ['powerPlant', 12, 7], ['powerPlant', 15, 7],
  ['powerPlant', 12, 11], ['powerPlant', 15, 11], ['oreRefinery', 12, 15],
  ['powerPlant', 12, 19], ['powerPlant', 15, 19],
  ['vehicleFactory', 19, 13], ['vehicleWorkshop', 24, 13], ['hospital', 24, 7],
  ['airstrip', 29, 6], ['helipad', 29, 14], ['radarStation', 33, 14],
  ['gasStation', 19, 18], ['ammunitionFactory', 24, 18], ['fireDepartment', 29, 18],
  ['turretGunV1', 34, 17], ['turretGunV2', 35, 19], ['turretGunV3', 36, 21],
  ['teslaCoil', 36, 12], ['artilleryTurret', 24, 23], ['rocketTurret', 33, 23],
  ['shipyard', 15, 24], ['concreteWall', 37, 15], ['concreteWall', 37, 16], ['concreteWall', 37, 17],
  ['street', 18, 16]
]
export const GRAPHICS_AIR_TYPES = ['apache', 'f22Raptor', 'f35']
const LAND = Object.keys(UNIT_PROPERTIES).filter(type => type !== 'base' && !GRAPHICS_AIR_TYPES.includes(type) && !navalUnitTypes.includes(type))
export const GRAPHICS_TANK_TYPES = ['tank_v1', 'tank-v2', 'tank-v3', 'lightTank', 'rocketTank']
const FLEET = [
  ['aircraftCarrier', 23, 32], ['supplyShip', 12, 33], ['vehicleFerry', 33, 31],
  ['hovercraft', 39, 30], ['navalMineLayer', 31, 36], ['battleship', 25, 39],
  ['submarine', 16, 39], ['destroyer', 37, 39]
]

export function graphicsBattleTerrain(x, y) {
  const shore = x < 10 ? 24 + Math.floor(x / 3) : x > 51 ? 26 - Math.floor((x - 51) / 3) : 26
  if (y >= shore) return 'water'
  if (y === 22 || y === 16 || x === 18 || x === 28 || (x >= 38 && x <= 50 && y >= 14 && y <= 24)) return 'street'
  if ((x < 7 || x >= 55) && y > 3 && y < 19 && (x * 7 + y * 11) % 13 < 3) return 'rock'
  return 'land'
}

export function graphicsBattleLayout() {
  const structures = BASE.map(([type, x, y]) => ({ type, x, y, owner: 'player1' }))
  structures.push({ type: 'constructionYard', x: 49, y: 8, owner: 'player2' })
  const spawns = LAND.map((type, i) => ({ type, x: 10 + 2 * i, y: 22, owner: 'player1' }))
  const add = (type, x, y, owner = 'player1') => spawns.push({ type, x, y, owner })
  GRAPHICS_TANK_TYPES.forEach((type, i) => {
    add(type, 39, 15 + i * 2)
    add(type, 41, 16 + i * 2)
    add(type, 45, 15 + i * 2, 'player2')
    add(type, 47, 16 + i * 2, 'player2')
  })
  FLEET.forEach(([type, x, y]) => add(type, x, y))
  add('destroyer', 44, 39, 'player2')
  add('battleship', 47, 34, 'player2')
  add('submarine', 49, 41, 'player2')
  GRAPHICS_AIR_TYPES.forEach((type, i) => {
    add(type, [26, 31, 32][i], [12, 13, 18][i])
    add(type, 47 + i * 2, 12 + 3 * i, 'player2')
  })
  return { structures, spawns }
}

export function validateGraphicsBattleLayout({ structures, spawns }) {
  const occupied = new Set()
  const reserved = new Set()
  const tileKey = (x, y) => y * GRAPHICS_BATTLE_MAP.width + x
  for (const { type, x, y } of structures) {
    const { width, height } = buildingData[type]
    for (let ty = y; ty < y + height; ty++) {
      for (let tx = x; tx < x + width; tx++) {
        const key = tileKey(tx, ty)
        const wantsWater = type === 'shipyard' && ty - y >= 2
        if (occupied.has(key) || (graphicsBattleTerrain(tx, ty) === 'water') !== wantsWater) throw new Error(`Invalid benchmark building placement: ${type}`)
        occupied.add(key)
      }
    }
  }
  for (const { type, x, y } of spawns) {
    const naval = navalUnitTypes.includes(type)
    const hull = naval ? getNavalHullDimensions(type) : null
    const halfLength = hull ? Math.floor(hull.length / (2 * TILE_SIZE) + 0.5) : 0
    const halfWidth = hull ? Math.floor(hull.width / (2 * TILE_SIZE) + 0.5) : 0
    for (let ty = y - halfWidth; ty <= y + halfWidth; ty++) {
      for (let tx = x - halfLength; tx <= x + halfLength; tx++) {
        const key = tileKey(tx, ty)
        const terrain = graphicsBattleTerrain(tx, ty)
        if (tx < 0 || ty < 0 || tx >= GRAPHICS_BATTLE_MAP.width || ty >= GRAPHICS_BATTLE_MAP.height ||
          occupied.has(key) || reserved.has(key) || terrain === 'rock' || (terrain === 'water') !== naval) {
          throw new Error(`Invalid benchmark unit placement: ${type} at ${x},${y}`)
        }
        reserved.add(key)
      }
    }
  }
}

