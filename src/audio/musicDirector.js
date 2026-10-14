// Local presentation state only. All times are simulation milliseconds.
export const MUSIC_TRACKS = {
  firstAttack: 'music_attack_motivational.mp3',
  underAttackOutnumbered: 'music_under_attack_danger.mp3',
  nearDefeat: 'music_defeat_sad.mp3'
}
const priority = { normal: 0, firstAttack: 1, underAttackOutnumbered: 2, nearDefeat: 3 }
const combatTypes = new Set(['tank', 'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'howitzer', 'apache', 'f22Raptor', 'f35', 'destroyer', 'battleship', 'submarine', 'aircraftCarrier'])
export const isMusicCombatUnit = unit => unit.health > 0 && combatTypes.has(unit.type)

export function selectMusicState({ nearDefeat, underAttackOutnumbered, firstAttack }) {
  if (nearDefeat) return 'nearDefeat'
  if (underAttackOutnumbered) return 'underAttackOutnumbered'
  return firstAttack ? 'firstAttack' : 'normal'
}

export function createMusicDirector() {
  let state = 'normal'
  let switchedAt = -Infinity
  let clearAt = null
  let firstAttackSeen = false
  let firstAttackPending = false
  return {
    get state() { return state },
    attack() {
      if (!firstAttackSeen) firstAttackPending = true
      firstAttackSeen = true
    },
    update(now, conditions) {
      const desired = selectMusicState({ ...conditions, firstAttack: firstAttackPending })
      const active = state === 'firstAttack' ? false : desired === state
      if (active) clearAt = null
      else if (clearAt === null) clearAt = now
      if (desired === state) return state
      const elapsed = now - switchedAt
      if (elapsed < 20000) return state
      const higher = priority[desired] > priority[state]
      if (state !== 'normal' && elapsed < 50000 && desired !== 'nearDefeat') return state
      if (!higher && now - clearAt < 15000) return state
      state = desired
      switchedAt = now
      clearAt = null
      if (state === 'firstAttack') firstAttackPending = false
      return state
    }
  }
}

let director = createMusicDirector()
let lastEvaluation = -Infinity
let lastTime = -Infinity
let damageAt = -Infinity
let damageX = 0
let damageY = 0
const inspectedBuildings = new Set()
export function resetMusicDirector() {
  director = createMusicDirector()
  lastEvaluation = lastTime = damageAt = -Infinity
}

export function recordMusicAttack(shooter, target, state) {
  if (state.simulationTime < lastTime) resetMusicDirector()
  lastTime = state.simulationTime
  if (shooter?.owner === state.humanPlayer && combatTypes.has(shooter.type) && target?.owner && target.owner !== shooter.owner) director.attack()
}

export function recordMusicDamage(shooter, target, damage, state, tileSize) {
  if (damage <= 0 || !shooter?.owner || !target?.owner || shooter.owner === target.owner) return
  if (state.simulationTime < lastTime) resetMusicDirector()
  lastTime = state.simulationTime
  recordMusicAttack(shooter, target, state)
  if (target.owner === state.humanPlayer) {
    damageAt = state.simulationTime
    // Units use pixel top-left coordinates; buildings use tile coordinates.
    damageX = target.isBuilding || target.width ? (target.x + (target.width || 1) / 2) * tileSize : target.x + tileSize / 2
    damageY = target.isBuilding || target.height ? (target.y + (target.height || 1) / 2) * tileSize : target.y + tileSize / 2
  }
}

export function evaluateMusicDirector(state, units, buildings, factories, queue, tileSize, unitCosts) {
  const now = state.simulationTime
  if (now < lastTime) resetMusicDirector()
  lastTime = now
  if (now - lastEvaluation < 1000) return null
  lastEvaluation = now
  let own = 0
  let nearbyOwn = 0
  let nearbyEnemy = 0
  let harvesters = 0
  for (const unit of units) {
    if (unit.health <= 0) continue
    if (unit.owner === state.humanPlayer && unit.type === 'harvester') harvesters++
    if (!isMusicCombatUnit(unit)) continue
    const friendly = unit.owner === state.humanPlayer
    if (friendly) own++
    if (now - damageAt <= 10000 && Math.hypot(unit.x + tileSize / 2 - damageX, unit.y + tileSize / 2 - damageY) <= 12 * tileSize) {
      if (friendly) nearbyOwn++
      else if (unit.owner) nearbyEnemy++
    }
  }
  // Buildable means currently unlocked in the local tech tree, regardless of
  // affordability (otherwise the comparison would be circular).
  let cheapestCost = Infinity
  for (const type of state.availableUnitTypes || []) {
    if (unitCosts[type] > 0) cheapestCost = Math.min(cheapestCost, unitCosts[type])
  }
  let count = 0
  let yard = false
  let refinery = false
  inspectedBuildings.clear()
  const inspect = building => {
    const key = building.id ?? building
    if (building.health <= 0 || building.owner !== state.humanPlayer || inspectedBuildings.has(key)) return
    inspectedBuildings.add(key)
    count++
    yard ||= building.type === 'constructionYard' || !building.type
    refinery ||= building.type === 'oreRefinery'
  }
  buildings.forEach(inspect)
  factories.forEach(inspect)
  const producing = Boolean((queue.currentBuilding && !queue.pausedBuilding) || Object.values(queue.unitQueues || { ground: queue }).some(lane => lane.currentUnit && !lane.pausedUnit))
  return director.update(now, {
    // Latest enemy damage stays relevant for 10s. Compare armed non-utility
    // units within 12 tiles, or all own combat units against nearby attackers.
    underAttackOutnumbered: now - damageAt <= 10000 && nearbyEnemy > 0 && (nearbyEnemy > nearbyOwn || nearbyEnemy > own),
    // Recovery collapse: no yard, missing refinery/harvester, and insufficient
    // money for any unlocked unit. Or <=2 buildings, no active production,
    // and no living combat units. Include initial factory yards only once.
    nearDefeat: (!yard && (!refinery || !harvesters) && state.money < cheapestCost) || (count <= 2 && !producing && own === 0)
  })
}
