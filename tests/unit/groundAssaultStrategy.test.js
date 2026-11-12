import { beforeEach, describe, expect, it } from 'vitest'
import '../setup.js'
import { generateDangerZoneMapForPlayer } from '../../src/game/dangerZoneMap.js'
import { createDynamicDangerState, updateDynamicDangerMap } from '../../src/game/dynamicDangerZoneMap.js'
import { updateGroundCombatDecision } from '../../src/ai/enemyGroundCombatDecision.js'
import {
  assaultPhaseForTarget,
  chooseNextSquadUnit,
  estimateEngagementOutcome,
  formSquads,
  mayGroundForceAttackBase,
  maySoloAirStrikeBase,
  orderAssaultTargets,
  planWeakestBreach,
  shouldRunStrategyEvaluation,
  STRATEGY_EVAL_INTERVAL_MS,
  updateGroundAssaultStrategy
} from '../../src/ai/groundAssaultStrategy.js'

function grid(width, height, type = 'grass') {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({ type })))
}

function tank(id, owner, tileX, tileY, extra = {}) {
  return {
    id,
    owner,
    type: 'tank_v1',
    health: 100,
    maxHealth: 100,
    tileX,
    tileY,
    x: tileX * 32,
    y: tileY * 32,
    ...extra
  }
}

function building(id, owner, type, x, y, extra = {}) {
  return {
    id,
    owner,
    type,
    x,
    y,
    width: extra.width || 1,
    height: extra.height || 1,
    health: extra.health || 400,
    maxHealth: extra.maxHealth || extra.health || 400,
    ...extra
  }
}

function strategyState(buildings, playerCount = 2) {
  return {
    humanPlayer: 'player1',
    playerCount,
    playerPowerSupply: 200,
    enemyPowerSupply: 200,
    buildings,
    occupancyMap: null
  }
}

describe('ground assault outcome estimator', () => {
  it('[U07092] keeps an even fight from retreating', () => {
    const friendly = tank('a', 'player2', 1, 1)
    const enemy = tank('b', 'player1', 2, 1)
    const outcome = estimateEngagementOutcome([friendly], [enemy])
    expect(outcome.shouldRetreat).toBe(false)
    expect(outcome.preferredTarget).toBeNull()
  })

  it('[U07093] retreats when enemy firepower and health win the exchange', () => {
    const friendly = [tank('a', 'player2', 1, 1), tank('b', 'player2', 1, 2)]
    const enemy = [tank('c', 'player1', 3, 1), tank('d', 'player1', 3, 2), tank('e', 'player1', 3, 3)]
    expect(estimateEngagementOutcome(friendly, enemy).shouldRetreat).toBe(true)
  })

  it('[U07094] treats a missing gunner as an easy target even with higher health', () => {
    const friendly = tank('a', 'player2', 1, 1, {
      health: 400,
      maxHealth: 400,
      crew: { driver: true, commander: true, gunner: false, loader: true }
    })
    const enemy = tank('b', 'player1', 2, 1, { health: 40, maxHealth: 100 })
    expect(estimateEngagementOutcome([friendly], [enemy]).shouldRetreat).toBe(true)
  })

  it('[U07095] treats a missing loader as an easy target and does not flee from them', () => {
    const friendly = tank('a', 'player2', 1, 1)
    const enemy = tank('b', 'player1', 2, 1, {
      health: 400,
      maxHealth: 400,
      crew: { driver: true, commander: true, gunner: true, loader: false }
    })
    const outcome = estimateEngagementOutcome([friendly], [enemy])
    expect(outcome.shouldRetreat).toBe(false)
    expect(outcome.preferredTarget).toBe(enemy)
  })

  it('[U07096] attacks the crippled enemy instead of the healthy one', () => {
    const healthy = tank('healthy', 'player1', 4, 1)
    const crippled = tank('crippled', 'player1', 3, 1, {
      crew: { driver: true, commander: true, gunner: false, loader: true }
    })
    const outcome = estimateEngagementOutcome([tank('a', 'player2', 1, 1)], [healthy, crippled])
    expect(outcome.shouldRetreat).toBe(false)
    expect(outcome.preferredTarget).toBe(crippled)
  })
})

describe('ground assault target order', () => {
  it('[U07097] orders breach, construction yard, weapons factory, other defences, then the rest', () => {
    const breach = building('turret-a', 'player1', 'turretGunV1', 4, 4)
    const yard = building('yard', 'player1', 'constructionYard', 8, 2, { width: 3, height: 3 })
    const factory = building('factory', 'player1', 'vehicleFactory', 8, 6, { width: 3, height: 3 })
    const other = building('turret-b', 'player1', 'teslaCoil', 2, 2)
    const power = building('power', 'player1', 'powerPlant', 1, 6)
    const ordered = orderAssaultTargets([power, other, factory, yard, breach], ['turret-a'])
    expect(ordered.map(entry => entry.id)).toEqual(['turret-a', 'yard', 'factory', 'turret-b', 'power'])
    expect(assaultPhaseForTarget(ordered[0], ['turret-a'])).toBe('breach')
    expect(assaultPhaseForTarget(ordered[1], ['turret-a'])).toBe('constructionYard')
    expect(assaultPhaseForTarget(ordered[2], ['turret-a'])).toBe('vehicleFactory')
    expect(assaultPhaseForTarget(ordered[3], ['turret-a'])).toBe('remainingDefences')
    expect(assaultPhaseForTarget(ordered[4], ['turret-a'])).toBe('remainingBuildings')
  })
})

describe('ground assault squads and exceptions', () => {
  it('[U07098] fills a squad in core, anti-air, howitzer, ambulance, recovery, then one ammo truck', () => {
    const owner = 'player2'
    const units = []
    const options = { hasHospital: true, hasAmmunitionFactory: true }
    const expected = ['tank_v1', 'lightTank', 'rocketTank', 'howitzer', 'tank-v2', 'ambulance', 'recoveryTank', 'ammunitionTruck', 'tank-v3', 'lightTank']
    expect(chooseNextSquadUnit(units, owner, options)).toBe(expected[0])
    const types = {
      tank_v1: 'tank_v1',
      lightTank: 'lightTank',
      rocketTank: 'rocketTank',
      howitzer: 'howitzer',
      'tank-v2': 'tank-v2',
      ambulance: 'ambulance',
      recoveryTank: 'recoveryTank',
      ammunitionTruck: 'ammunitionTruck',
      'tank-v3': 'tank-v3'
    }
    expected.slice(0, -1).forEach((type, index) => {
      units.push({ id: `u${index}`, owner, type: types[type] || type, health: 100, maxHealth: 100 })
      expect(chooseNextSquadUnit(units, owner, options)).toBe(expected[index + 1])
    })
  })

  it('[U07099] does not request a second ammunition truck for the open squad', () => {
    const units = [
      tank('t', 'player2', 0, 0),
      { id: 'ammo', owner: 'player2', type: 'ammunitionTruck', health: 100, maxHealth: 100 }
    ]
    expect(chooseNextSquadUnit(units, 'player2', { hasHospital: true, hasAmmunitionFactory: true })).toBe('lightTank')
  })

  it('[U07100] starts the next squad only after the current one is complete', () => {
    const units = [
      tank('c1', 'player2', 0, 0),
      tank('c2', 'player2', 1, 0, { type: 'tank-v2' }),
      tank('c3', 'player2', 2, 0, { type: 'tank-v3' }),
      tank('l1', 'player2', 3, 0, { type: 'lightTank' }),
      tank('l2', 'player2', 4, 0, { type: 'lightTank' }),
      tank('r', 'player2', 5, 0, { type: 'rocketTank' }),
      tank('h', 'player2', 6, 0, { type: 'howitzer' }),
      { id: 'amb', owner: 'player2', type: 'ambulance', health: 100, maxHealth: 100 },
      { id: 'rec', owner: 'player2', type: 'recoveryTank', health: 100, maxHealth: 100 },
      { id: 'ammo', owner: 'player2', type: 'ammunitionTruck', health: 100, maxHealth: 100 }
    ]
    expect(chooseNextSquadUnit(units, 'player2', { hasHospital: true, hasAmmunitionFactory: true })).toBe('tank_v1')
  })

  it('[U07101] puts one rocket tank in the first squad and leaves a leftover tank in the next', () => {
    const units = [
      tank('b', 'player2', 0, 0),
      tank('a', 'player2', 1, 0),
      tank('c', 'player2', 2, 0),
      tank('d', 'player2', 3, 0),
      tank('r', 'player2', 4, 0, { type: 'rocketTank' })
    ]
    const squads = formSquads(units, 'player2')
    expect(squads).toHaveLength(2)
    expect(squads[0].members.map(unit => unit.id)).toEqual(['a', 'b', 'c', 'r'])
    expect(squads[1].members.map(unit => unit.id)).toEqual(['d'])
  })

  it('[U07102] lets one ground unit attack only a defenceless base', () => {
    expect(mayGroundForceAttackBase({ combatantCount: 1, groundDefenceCount: 1, airDefenceCount: 0 })).toBe(false)
    expect(mayGroundForceAttackBase({ combatantCount: 1, groundDefenceCount: 0, airDefenceCount: 1 })).toBe(false)
    expect(mayGroundForceAttackBase({ combatantCount: 1, groundDefenceCount: 0, airDefenceCount: 0 })).toBe(true)
    expect(mayGroundForceAttackBase({ combatantCount: 2, groundDefenceCount: 2, airDefenceCount: 1 })).toBe(true)
  })

  it('[U07103] lets a single apache, f22, or f35 strike when the target has no anti-air', () => {
    expect(maySoloAirStrikeBase('apache', 0)).toBe(true)
    expect(maySoloAirStrikeBase('f22Raptor', 0)).toBe(true)
    expect(maySoloAirStrikeBase('f35', 0)).toBe(true)
    expect(maySoloAirStrikeBase('apache', 1)).toBe(false)
    expect(maySoloAirStrikeBase('tank_v1', 0)).toBe(false)
  })
})

describe('ground assault breach planning', () => {
  it('[U07104] uses the danger-zone map and breaches only the weaker defence on the path', () => {
    const mapGrid = grid(16, 8)
    const yard = building('yard', 'player1', 'constructionYard', 13, 3, { width: 2, height: 2, health: 800 })
    const strong = building('strong', 'player1', 'artilleryTurret', 8, 0, {
      fireRange: 4,
      damage: 100,
      fireCooldown: 7000,
      health: 300
    })
    const weak = building('weak', 'player1', 'turretGunV1', 8, 6, {
      fireRange: 2,
      damage: 10,
      fireCooldown: 3000,
      health: 300
    })
    const gameState = strategyState([yard, strong, weak])
    const dangerMap = generateDangerZoneMapForPlayer('player2', mapGrid, [yard, strong, weak], gameState)
    const plan = planWeakestBreach({
      mapGrid,
      dangerMap,
      buildings: [yard, strong, weak],
      origin: { x: 1, y: 4 },
      goalBuilding: yard,
      gameState
    })
    expect(dangerMap.length).toBe(8)
    expect(plan.peakDanger).toBeGreaterThan(0)
    expect(plan.breachIds).toEqual(['weak'])
  })
})

describe('ground assault orchestrator', () => {
  let mapGrid

  beforeEach(() => {
    mapGrid = grid(18, 10)
    delete globalThis.__cfbFrameHeadroomMs
  })

  it('[U07105] holds a single tank outside a defended base and sends two tanks through the weak breach', () => {
    const yard = building('yard', 'player1', 'constructionYard', 14, 4, { width: 2, height: 2, health: 800 })
    const strong = building('strong', 'player1', 'artilleryTurret', 8, 1, {
      fireRange: 4, damage: 100, fireCooldown: 7000, health: 300
    })
    const weak = building('weak', 'player1', 'turretGunV1', 8, 7, {
      fireRange: 2, damage: 10, fireCooldown: 3000, health: 300
    })
    const soloState = strategyState([yard, strong, weak])
    const solo = [tank('solo', 'player2', 1, 4)]
    updateGroundAssaultStrategy('player2', solo, soloState, mapGrid, 1000)
    expect(solo[0].aiAssault.mode).toBe('hold')
    expect(solo[0].aiAssault.target).toBeNull()

    const pair = [tank('a', 'player2', 1, 4), tank('b', 'player2', 2, 4)]
    const wounded = pair[1]
    wounded.health = 40
    updateGroundAssaultStrategy('player2', pair, strategyState([yard, strong, weak]), mapGrid, 1000)
    expect(pair[0].aiAssault.mode).toBe('attack')
    expect(pair[0].aiAssault.target.id).toBe('weak')
    expect(pair[1].aiAssault.target).toBe(pair[0].aiAssault.target)
    expect(pair[0].aiAssault.squadId).toBe(pair[1].aiAssault.squadId)
    expect(pair[0].aiAssault.role).toBe('front')
    expect(pair[1].aiAssault.role).toBe('rear')
    const target = pair[0].aiAssault.target
    const frontDistance = Math.hypot(pair[0].aiAssault.frontTile.x - target.x, pair[0].aiAssault.frontTile.y - target.y)
    const rearDistance = Math.hypot(pair[1].aiAssault.rearTile.x - target.x, pair[1].aiAssault.rearTile.y - target.y)
    expect(rearDistance).toBeGreaterThan(frontDistance)
  })

  it('[U07106] lets one tank attack a base with no ground or air defence', () => {
    const yard = building('yard', 'player1', 'constructionYard', 12, 4, { width: 3, height: 3, health: 800 })
    const power = building('power', 'player1', 'powerPlant', 12, 1, { width: 2, height: 2 })
    const state = strategyState([yard, power])
    const solo = [tank('solo', 'player2', 1, 4)]
    updateGroundAssaultStrategy('player2', solo, state, mapGrid, 1000)
    expect(solo[0].aiAssault.mode).toBe('attack')
    expect(solo[0].aiAssault.target.id).toBe('yard')
  })

  it('[U07107] targets another AI player instead of assuming the human is the only enemy', () => {
    const yard = building('yard', 'player3', 'constructionYard', 12, 4, { width: 3, height: 3, health: 800 })
    const state = strategyState([yard], 3)
    const solo = [tank('solo', 'player2', 1, 4)]
    updateGroundAssaultStrategy('player2', solo, state, mapGrid, 1000)
    expect(solo[0].aiAssault.opponentId).toBe('player3')
    expect(solo[0].aiAssault.target.owner).toBe('player3')
  })

  it('[U07108] retreats the squad from a winning enemy and attacks a crippled one', () => {
    const yard = building('yard', 'player1', 'constructionYard', 14, 4, { width: 2, height: 2, health: 800 })
    const state = strategyState([yard])
    const friends = [tank('a', 'player2', 2, 4), tank('b', 'player2', 3, 4)]
    const bullies = [tank('c', 'player1', 4, 4), tank('d', 'player1', 4, 5), tank('e', 'player1', 5, 4)]
    updateGroundAssaultStrategy('player2', [...friends, ...bullies], state, mapGrid, 1000)
    expect(friends[0].aiAssault.mode).toBe('retreat')
    expect(friends[1].aiAssault.mode).toBe('retreat')
    expect(friends[0].aiAssault.target).toBeNull()

    const crippled = tank('c', 'player1', 4, 4, {
      health: 200,
      maxHealth: 200,
      crew: { driver: true, commander: true, gunner: true, loader: false }
    })
    const hunter = [tank('a', 'player2', 2, 4)]
    updateGroundAssaultStrategy('player2', [...hunter, crippled], state, mapGrid, 1000 + STRATEGY_EVAL_INTERVAL_MS)
    expect(hunter[0].aiAssault.mode).toBe('attack')
    expect(hunter[0].aiAssault.target).toBe(crippled)
  })

  it('[U07109] assigns exactly one ammunition truck to each squad', () => {
    const yard = building('yard', 'player1', 'constructionYard', 14, 4, { width: 2, height: 2, health: 800 })
    const state = strategyState([yard])
    const units = [
      tank('a', 'player2', 1, 3),
      tank('b', 'player2', 2, 3),
      tank('c', 'player2', 3, 3),
      tank('d', 'player2', 1, 6),
      { id: 'ammo-b', owner: 'player2', type: 'ammunitionTruck', health: 100, maxHealth: 30, tileX: 1, tileY: 2, x: 32, y: 64 },
      { id: 'ammo-a', owner: 'player2', type: 'ammunitionTruck', health: 100, maxHealth: 30, tileX: 2, tileY: 2, x: 64, y: 64 }
    ]
    updateGroundAssaultStrategy('player2', units, state, mapGrid, 1000)
    const trucks = units.filter(unit => unit.type === 'ammunitionTruck')
    expect(trucks.map(unit => unit.squadId).sort()).toEqual(['player2-squad-1', 'player2-squad-2'])
    expect(new Set(trucks.map(unit => unit.squadId)).size).toBe(2)
  })

  it('[U07110] runs the planner at most once every five seconds and skips it without frame headroom', () => {
    const yard = building('yard', 'player1', 'constructionYard', 12, 4, { width: 2, height: 2 })
    const state = strategyState([yard])
    const units = [tank('solo', 'player2', 1, 4)]
    updateGroundAssaultStrategy('player2', units, state, mapGrid, 1000)
    expect(state.aiGroundAssault.player2.runs).toBe(1)
    updateGroundAssaultStrategy('player2', units, state, mapGrid, 1000 + STRATEGY_EVAL_INTERVAL_MS - 1)
    expect(state.aiGroundAssault.player2.runs).toBe(1)
    updateGroundAssaultStrategy('player2', units, state, mapGrid, 1000 + STRATEGY_EVAL_INTERVAL_MS)
    expect(state.aiGroundAssault.player2.runs).toBe(2)
    globalThis.__cfbFrameHeadroomMs = 0
    updateGroundAssaultStrategy('player2', units, state, mapGrid, 1000 + STRATEGY_EVAL_INTERVAL_MS * 3)
    expect(state.aiGroundAssault.player2.runs).toBe(2)
    delete globalThis.__cfbFrameHeadroomMs
    expect(shouldRunStrategyEvaluation(0, STRATEGY_EVAL_INTERVAL_MS, 0)).toBe(false)
    expect(shouldRunStrategyEvaluation(0, STRATEGY_EVAL_INTERVAL_MS, STRATEGY_EVAL_INTERVAL_MS)).toBe(true)
  })
})

describe('ground assault orders in the unit decision', () => {
  it('[U07111] does not let a held unit keep a base target', () => {
    const unit = tank('solo', 'player2', 2, 2, {
      target: building('yard', 'player1', 'constructionYard', 6, 6, { width: 2, height: 2 }),
      aiAssault: { mode: 'hold', rallyTile: { x: 1, y: 1 }, squadId: 'player2-squad-1' }
    })
    updateGroundCombatDecision(unit, [unit], strategyState([]), grid(10, 10), 5000, 'player2')
    expect(unit.target).toBeNull()
    expect(unit.allowedToAttack).toBe(false)
  })

  it('[U07112] keeps squad mates on the shared target', () => {
    const target = building('weak', 'player1', 'turretGunV1', 6, 4, { health: 200 })
    const healthy = tank('a', 'player2', 2, 4, {
      aiAssault: {
        mode: 'attack',
        target,
        frontTile: { x: 5, y: 4 },
        rearTile: { x: 3, y: 4 },
        squadId: 'player2-squad-1'
      }
    })
    const wounded = tank('b', 'player2', 1, 4, {
      health: 30,
      aiAssault: healthy.aiAssault
    })
    const state = strategyState([])
    const mapGrid = grid(12, 10)
    updateGroundCombatDecision(healthy, [healthy, wounded], state, mapGrid, 5000, 'player2')
    updateGroundCombatDecision(wounded, [healthy, wounded], state, mapGrid, 5000, 'player2')
    expect(healthy.target).toBe(target)
    expect(wounded.target).toBe(target)
    expect(healthy.allowedToAttack).toBe(true)
    expect(wounded.moveTarget).toEqual({ x: 3, y: 4 })
  })

  it('[U07116] keeps firing at an attacker in range while the retreat move continues', () => {
    const attacker = tank('enemy', 'player1', 5, 4)
    const unit = tank('a', 'player2', 2, 4, {
      aiAssault: {
        mode: 'retreat',
        retreatTile: { x: 0, y: 4 },
        rallyTile: { x: 0, y: 4 },
        returnFire: [attacker],
        squadId: 'player2-squad-1'
      }
    })
    const mapGrid = grid(12, 10)
    updateGroundCombatDecision(unit, [unit, attacker], strategyState([]), mapGrid, 5000, 'player2')
    expect(unit.target).toBe(attacker)
    expect(unit.allowedToAttack).toBe(true)
    expect(unit.moveTarget).toEqual({ x: 0, y: 4 })
  })
})

describe('combined danger planning', () => {
  beforeEach(() => {
    delete globalThis.__cfbFrameHeadroomMs
  })

  it('[U07117] picks the corridor whose combined static and mobile danger is lower', () => {
    const mapGrid = grid(24, 16)
    for (let y = 6; y <= 10; y++) mapGrid[y][10].type = 'rock'
    const yard = building('yard', 'player1', 'constructionYard', 18, 7, { width: 2, height: 2, health: 800 })
    const north = building('north', 'player1', 'turretGunV1', 10, 2, {
      fireRange: 3, damage: 10, fireCooldown: 3000, health: 300
    })
    const south = building('south', 'player1', 'turretGunV1', 10, 13, {
      fireRange: 3, damage: 10, fireCooldown: 3000, health: 300
    })
    const gameState = strategyState([yard, north, south])
    const dangerMap = generateDangerZoneMapForPlayer('player2', mapGrid, [yard, north, south], gameState)
    const mobile = createDynamicDangerState(24, 16)
    updateDynamicDangerMap(mobile, [
      tank('guard', 'player1', 10, 2, { health: 200, maxHealth: 200 })
    ], 'player2')
    const plan = planWeakestBreach({
      mapGrid,
      dangerMap,
      buildings: [yard, north, south],
      origin: { x: 2, y: 8 },
      goalBuilding: yard,
      gameState,
      dynamicState: mobile
    })
    expect(plan.breachIds).toEqual(['south'])
  })

  it('[U07118] fights an in-range attacker before the construction yard and retreats toward lower danger', () => {
    const mapGrid = grid(22, 12)
    const own = building('own', 'player2', 'constructionYard', 1, 4, { width: 2, height: 2, health: 800 })
    const yard = building('yard', 'player1', 'constructionYard', 18, 4, { width: 2, height: 2, health: 800 })
    const state = strategyState([own, yard])
    const friends = [tank('a', 'player2', 4, 5), tank('b', 'player2', 5, 5)]
    const attacker = tank('enemy', 'player1', 7, 5)
    updateGroundAssaultStrategy('player2', [...friends, attacker], state, mapGrid, 2000)
    expect(friends[0].aiAssault.mode).toBe('attack')
    expect(friends[0].aiAssault.target.id).toBe('enemy')
    expect(friends[1].aiAssault.target).toBe(friends[0].aiAssault.target)

    const bullies = [
      tank('c', 'player1', 10, 5),
      tank('d', 'player1', 11, 5),
      tank('e', 'player1', 10, 6)
    ]
    const fallingBack = [tank('a', 'player2', 4, 5), tank('b', 'player2', 5, 5)]
    updateGroundAssaultStrategy('player2', [...fallingBack, ...bullies], state, mapGrid, 2000 + STRATEGY_EVAL_INTERVAL_MS)
    expect(fallingBack[0].aiAssault.mode).toBe('retreat')
    expect(fallingBack[0].aiAssault.retreatTile.x).toBeLessThan(4)
    expect(fallingBack[0].aiAssault.returnFire.map(unit => unit.id).sort()).toEqual(['c', 'd', 'e'])
  })

  it('[U07119] shoots a defence building that is already in range before the construction yard', () => {
    const mapGrid = grid(22, 12)
    const turret = building('turret', 'player1', 'turretGunV1', 8, 5, {
      fireRange: 6, damage: 10, fireCooldown: 3000, health: 200
    })
    const yard = building('yard', 'player1', 'constructionYard', 18, 4, { width: 2, height: 2, health: 800 })
    const friends = [tank('a', 'player2', 4, 5), tank('b', 'player2', 5, 5)]
    updateGroundAssaultStrategy('player2', friends, strategyState([turret, yard]), mapGrid, 3000)
    expect(friends[0].aiAssault.mode).toBe('attack')
    expect(friends[0].aiAssault.target.id).toBe('turret')
  })
})
