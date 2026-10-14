import { describe, expect, it } from 'vitest'
import { createMusicDirector, selectMusicState, evaluateMusicDirector, recordMusicDamage, resetMusicDirector } from '../../src/audio/musicDirector.js'

describe('music director', () => {
  it('selects states in priority order without changing inputs', () => {
    const conditions = Object.freeze({ nearDefeat: true, underAttackOutnumbered: true, firstAttack: true })
    expect(selectMusicState(conditions)).toBe('nearDefeat')
    expect(selectMusicState({ ...conditions, nearDefeat: false })).toBe('underAttackOutnumbered')
    expect(selectMusicState({ firstAttack: true })).toBe('firstAttack')
    expect(selectMusicState({})).toBe('normal')
  })
  it('plays first attack once, dwells 50s and does not retrigger', () => {
    const director = createMusicDirector()
    director.attack()
    expect(director.update(0, {})).toBe('firstAttack')
    expect(director.update(1000, {})).toBe('firstAttack')
    expect(director.update(49000, {})).toBe('firstAttack')
    expect(director.update(50000, {})).toBe('normal')
    director.attack()
    expect(director.update(100000, {})).toBe('normal')
  })
  it('allows defeat to preempt dwell only after the 20s cooldown', () => {
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
  it('requires 15 continuous seconds clear after a long active situation', () => {
    const director = createMusicDirector()
    director.update(0, { underAttackOutnumbered: true })
    director.update(60000, { underAttackOutnumbered: true })
    expect(director.update(61000, {})).toBe('underAttackOutnumbered')
    director.update(70000, { underAttackOutnumbered: true })
    director.update(71000, {})
    expect(director.update(85000, {})).toBe('underAttackOutnumbered')
    expect(director.update(86000, {})).toBe('normal')
  })
  it('detects local enemy damage, excludes utilities and expires damage after 10s', () => {
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
  it('detects economic collapse and the empty non-producing base metric', () => {
    resetMusicDirector()
    const state = { simulationTime: 0, humanPlayer: 'p1', money: 999, availableUnitTypes: new Set(['tank']) }
    const own = { type: 'tank', owner: 'p1', health: 100, x: 0, y: 0 }
    expect(evaluateMusicDirector(state, [own], [], [], {}, 32, { tank: 1000 })).toBe('nearDefeat')
    resetMusicDirector()
    state.money = 1000
    expect(evaluateMusicDirector(state, [own], [], [], {}, 32, { tank: 1000 })).toBe('normal')
    resetMusicDirector()
    expect(evaluateMusicDirector(state, [], [], [], { currentUnit: {} }, 32, { tank: 1000 })).toBe('normal')
    resetMusicDirector()
    expect(evaluateMusicDirector(state, [], [], [], { currentUnit: {}, pausedUnit: true }, 32, { tank: 1000 })).toBe('nearDefeat')
    resetMusicDirector()
    expect(evaluateMusicDirector(state, [], [], [], {}, 32, { tank: 1000 })).toBe('nearDefeat')
  })
})
