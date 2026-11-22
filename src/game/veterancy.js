import { UNIT_COSTS } from '../config.js'

export const DEFENCE_VETERANCY_TYPES = Object.freeze([
  'turretGunV1', 'turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret'
])

const defenceTypes = new Set(DEFENCE_VETERANCY_TYPES)
// Kept lightweight so importing the ubiquitous utils module does not initialize
// the full building catalog (and its runtime-config dependencies).
const BUILDING_COSTS = Object.freeze({
  powerPlant: 2000, oreRefinery: 2500, vehicleFactory: 3000, fireDepartment: 2500,
  vehicleWorkshop: 3000, constructionYard: 5000, radarStation: 1500, hospital: 4000,
  helipad: 1000, airstrip: 10000, shipyard: 5000, gasStation: 2000,
  droneFactory: 4500, aiCenter: 5500, rocketLaunchBase: 7500, spaceshipFactory: 6500, planeFactory: 5500,
  ammunitionFactory: 2000, turretGunV1: 1200, turretGunV2: 2000, turretGunV3: 3000,
  rocketTurret: 4000, teslaCoil: 5000, artilleryTurret: 4000, street: 10, concreteWall: 100
})
const warnedUnknownTypes = new Set()
let starGrantListener = () => {}
let turretVeterancyGate = () => false

export function setStarGrantListener(fn) {
  starGrantListener = typeof fn === 'function' ? fn : () => {}
}

export function setTurretVeterancyGate(fn) {
  turretVeterancyGate = typeof fn === 'function' ? fn : () => false
}

export function canEarnVeterancy(entity) {
  if (!entity || entity.type === 'harvester') return false
  if (defenceTypes.has(entity.type)) return Boolean(turretVeterancyGate(entity.owner))
  return Object.hasOwn(UNIT_COSTS, entity.type)
}

export function getKillValue(target) {
  if (!target?.type) return 0
  if (Object.hasOwn(UNIT_COSTS, target.type)) return UNIT_COSTS[target.type]
  const buildingCost = Number.isFinite(target.cost) ? target.cost : BUILDING_COSTS[target.type]
  if (Number.isFinite(buildingCost)) {
    return buildingCost
  }
  if (!warnedUnknownTypes.has(target.type)) {
    warnedUnknownTypes.add(target.type)
    globalThis.window?.logger?.warn?.(`No kill XP value for unknown type: ${target.type}`)
  }
  return 0
}

function requiredExperience(entity) {
  return [2, 4, 6][entity.level] * entity.baseCost
}

function applyLevelBonus(entity) {
  if (defenceTypes.has(entity.type)) {
    if (entity.level === 1) entity.rangeMultiplier = (entity.rangeMultiplier || 1) * 1.2
    if (entity.level === 2) entity.fireRateMultiplier = (entity.fireRateMultiplier || 1) * 1.33
    if (entity.level === 3) {
      entity.selfRepair = true
      entity.armor = (entity.armor || 1) * 1.5
    }
    return
  }
  if (entity.type === 'howitzer') {
    if (entity.level === 1) entity.fireRateMultiplier = (entity.fireRateMultiplier || 1) * 1.33
    if (entity.level === 2) entity.damageMultiplier = (entity.damageMultiplier || 1) * 1.33
    if (entity.level === 3) entity.rangeMultiplier = (entity.rangeMultiplier || 1) * 1.33
    return
  }
  if (entity.level === 1) entity.rangeMultiplier = (entity.rangeMultiplier || 1) * 1.2
  if (entity.level === 2) entity.armor = (entity.armor || 1) * 1.5
  if (entity.level === 3) {
    entity.selfRepair = true
    entity.fireRateMultiplier = (entity.fireRateMultiplier || 1) * 1.33
  }
}

export function applyLevelUps(entity) {
  if (!canEarnVeterancy(entity)) return 0
  entity.level = Number.isFinite(entity.level) ? Math.max(0, Math.min(3, entity.level)) : 0
  entity.experience = Number.isFinite(entity.experience) ? Math.max(0, entity.experience) : 0
  entity.baseCost ||= UNIT_COSTS[entity.type] || BUILDING_COSTS[entity.type] || entity.cost || 0
  let gained = 0
  while (entity.level < 3) {
    const required = requiredExperience(entity)
    if (!required || entity.experience < required) break
    entity.experience -= required
    entity.level += 1
    gained += 1
    applyLevelBonus(entity)
  }
  if (entity.level >= 3) entity.experience = 0
  if (gained) starGrantListener(entity, gained)
  return gained
}

export function applyKillBonus(killer, victim) {
  if (!canEarnVeterancy(killer) || !victim?.level || killer.owner === victim.owner) return 0
  let remaining = Math.min(3, Math.max(0, victim.level)) * 0.5
  let gained = 0
  while (remaining > 0 && killer.level < 3) {
    const portion = Math.min(remaining, 1)
    killer.experience += Math.round(portion * requiredExperience(killer))
    remaining -= portion
    gained += applyLevelUps(killer)
  }
  return gained
}

export function drawLevelStars(ctx, centerX, topY, count, size = 6) {
  if (!count) return
  const spacing = size + 2
  const startX = centerX - ((count - 1) * spacing) / 2
  ctx.save()
  ctx.fillStyle = '#FFD700'
  ctx.strokeStyle = '#FFA500'
  ctx.lineWidth = 1
  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing
    ctx.beginPath()
    for (let point = 0; point < 10; point++) {
      const radius = point % 2 === 0 ? size / 2 : size / 4
      const angle = -Math.PI / 2 + point * Math.PI / 5
      const px = x + Math.cos(angle) * radius
      const py = topY + Math.sin(angle) * radius
      if (point === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

export function grantHarvesterStars(entity, count) {
  if (count > 0) starGrantListener(entity, count)
}
