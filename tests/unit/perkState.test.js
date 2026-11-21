import { beforeEach, describe, expect, it } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { applyPerkPurchase, canPurchasePerk, exportPerkState, getPerkLedger, getPerkStateHash, grantPerkStars, hasLivingCommandCenter, isItemUnlocked, ownsPerk, resetPerkState, restorePerkState, setAutomationPerkMode } from '../../src/perks/perkState.js'

describe('perk ledger and purchases', () => {
  beforeEach(() => { resetPerkState(); gameState.buildings = [] })

  it('[U07277] tracks earned, spent and available stars without losing them on death', () => {
    const unit = { owner: 'player1' }
    grantPerkStars(unit, 2)
    grantPerkStars(unit, 3)
    expect(getPerkLedger('player1')).toMatchObject({ earned: 5, spent: 0, available: 5 })
    expect(getPerkLedger('player1').earned).toBe(5)
  })

  it('[U07278] validates a purchase and atomically grants included lane starters', () => {
    grantPerkStars({ owner: 'player1' }, 5)
    expect(canPurchasePerk('player1', 'cc.unit.start').reason).toBe('noCommandCenter')
    gameState.buildings.push({ type: 'commandCenter', owner: 'player1', health: 400 })
    expect(hasLivingCommandCenter('player1')).toBe(true)
    expect(applyPerkPurchase('player1', 'cc.unit.start', 5)).toEqual({ ok: true })
    expect(ownsPerk('player1', 'cc.unit.if.own')).toBe(true)
    expect(ownsPerk('player1', 'cc.unit.do.service')).toBe(true)
    expect(getPerkLedger('player1')).toMatchObject({ earned: 5, spent: 5, available: 0 })
    expect(canPurchasePerk('player1', 'cc.unit.start').reason).toBe('owned')
  })

  it('[U07279] round trips deterministic state and supports the sandbox escape hatch', () => {
    setAutomationPerkMode('allUnlocked')
    expect(isItemUnlocked('player1', 'unit', 'effect', 'takeoff')).toBe(true)
    const payload = exportPerkState()
    const hash = getPerkStateHash()
    resetPerkState()
    restorePerkState(payload)
    expect(getPerkStateHash()).toBe(hash)
  })

  it('[U07288] keeps the canonical ledger inside gameState', () => {
    grantPerkStars({ owner: 'player1' }, 4)
    expect(gameState.perks.owners.player1.earned).toBe(4)
    const payload = JSON.parse(JSON.stringify(gameState.perks))
    resetPerkState()
    restorePerkState(payload)
    expect(getPerkLedger('player1')).toMatchObject({ earned: 4, spent: 0, available: 4 })
  })
})
