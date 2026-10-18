import { describe, expect, it } from 'vitest'
import { createMusicDirector, selectMusicState, evaluateMusicDirector, recordMusicDamage, resetMusicDirector, NEAR_DEFEAT_MIN_GAME_TIME_MS } from '../../src/audio/musicDirector.js'

describe('music director', () => {
  it('[U03115] selects states in priority order without changing inputs', () => {
    const conditions = Object.freeze({ nearDefeat: true, underAttackOutnumbered: true, firstAttack: true })
    expect(selectMusicState(conditions)).toBe('nearDefeat')
    expect(selectMusicState({ ...conditions, nearDefeat: false })).toBe('underAttackOutnumbered')
    expect(selectMusicState({ firstAttack: true })).toBe('firstAttack')
    expect(selectMusicState({})).toBe('normal')
  })
  it('[U03116] plays first attack once, dwells 50s and does not retrigger', () => {
    const director = createMusicDirector()
    director.attack()
    expect(director.update(0, {})).toBe('firstAttack')
    expect(director.update(1000, {})).toBe('firstAttack')
    expect(director.update(49000, {})).toBe('firstAttack')
    expect(director.update(50000, {})).toBe('normal')
    director.attack()
    expect(director.update(100000, {})).toBe('normal')
  })
  it('[U03117] allows defeat to preempt dwell only after the 20s cooldown', () => {
    const director = createMusicDirector()
    director.attack()
    director.update(0, {})
    expect(director.update(19000, { nearDefeat: true })).toBe('firstAttack')
    expect(director.update(20000, { nearDefeat: true })).toBe('nearDefeat')
    expect(director.update(55000, {})).toBe('nearDefeat')
    expect(director.update(69000, {})).toBe('nearDefeat')
    expect(director.update(70000, {})).toBe('normal')
    expect(director.update(89000, { underAttackOutnumbered: true })).toBe('normal')
    expect(director.update(90000, { underAttackOutnumbered: true })).toBe('underAttackOutnumbered')
  })
  it('[U03118] requires 15 continuous seconds clear after a long active situation', () => {
    const director = createMusicDirector()
    director.update(0, { underAttackOutnumbered: true })
    director.update(60000, { underAttackOutnumbered: true })
    expect(director.update(61000, {})).toBe('underAttackOutnumbered')
    director.update(70000, { underAttackOutnumbered: true })
    director.update(71000, {})
    expect(director.update(85000, {})).toBe('underAttackOutnumbered')
    expect(director.update(86000, {})).toBe('normal')
  })
  it('[U03119] detects local enemy damage, excludes utilities and expires damage after 10s', () => {
    resetMusicDirector()
    const state = { simulationTime: 0, humanPlayer: 'p1', money: 500, availableUnitTypes: new Set(['tank']) }
    const own = { type: 'tank', owner: 'p1', health: 100, x: 0, y: 0 }
    const enemy = { ...own, owner: 'p2' }
    const buildings = [{ type: 'constructionYard', owner: 'p1', health: 100 }]
    recordMusicDamage(enemy, own, 10, state, 32)
    const evaluate = units => evaluateMusicDirector(state, units, buildings, [], {}, 32, { tank: 1000 })
    expect(evaluate([own, enemy, { ...enemy }])).toBe('underAttackOutnumbered')
    state.simulationTime = 11000
    evaluate([own, enemy])
    state.simulationTime = 50000
    expect(evaluate([own, enemy])).toBe('normal')
    resetMusicDirector()
    expect(evaluate([own, enemy, { ...enemy, type: 'harvester' }])).toBe('normal')
  })
  it('[U03120] detects economic collapse and the empty non-producing base metric once a base existed', () => {
    resetMusicDirector()
    const state = { simulationTime: 0, humanPlayer: 'p1', money: 999, availableUnitTypes: new Set(['tank']) }
    const own = { type: 'tank', owner: 'p1', health: 100, x: 0, y: 0 }
    const yard = { type: 'constructionYard', owner: 'p1', health: 100 }
    const evaluate = (...args) => {
      // Establish a base early, then evaluate after the start-of-game guard.
      resetMusicDirector()
      state.simulationTime = 1000
      evaluateMusicDirector(state, [], [yard], [], { currentUnit: {} }, 32, { tank: 1000 })
      state.simulationTime = NEAR_DEFEAT_MIN_GAME_TIME_MS
      return evaluateMusicDirector(state, ...args, 32, { tank: 1000 })
    }
    expect(evaluate([own], [], [], {})).toBe('nearDefeat')
    state.money = 1000
    expect(evaluate([own], [], [], {})).toBe('normal')
    expect(evaluate([], [], [], { currentUnit: {} })).toBe('normal')
    expect(evaluate([], [], [], { currentUnit: {}, pausedUnit: true })).toBe('nearDefeat')
    expect(evaluate([], [], [], {})).toBe('nearDefeat')
  })
  it('[U03121] never plays near defeat at game start, before a base or before 3 minutes', () => {
    resetMusicDirector()
    const state = { simulationTime: 0, humanPlayer: 'p1', money: 0, availableUnitTypes: new Set(['tank']) }
    // Loading/initial phase: no buildings, no units, no money.
    for (let t = 0; t <= 10 * 60000; t += 1000) {
      state.simulationTime = t
      const result = evaluateMusicDirector(state, [], [], [], {}, 32, { tank: 1000 })
      if (result) expect(result).toBe('normal')
    }
    // Starting yard, but still within the first three minutes.
    resetMusicDirector()
    const yard = { type: 'constructionYard', owner: 'p1', health: 100 }
    for (let t = 0; t < NEAR_DEFEAT_MIN_GAME_TIME_MS; t += 1000) {
      state.simulationTime = t
      const result = evaluateMusicDirector(state, [], [yard], [], {}, 32, { tank: 1000 })
      if (result) expect(result).toBe('normal')
    }
    expect(NEAR_DEFEAT_MIN_GAME_TIME_MS).toBeGreaterThanOrEqual(180000)
    state.simulationTime = NEAR_DEFEAT_MIN_GAME_TIME_MS
    expect(evaluateMusicDirector(state, [], [yard], [], {}, 32, { tank: 1000 })).toBe('nearDefeat')
  })
})
