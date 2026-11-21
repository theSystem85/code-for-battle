import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { applyPerkPurchase, grantPerkStars, resetPerkState } from '../../src/perks/perkState.js'
import { closePerkTree, openPerkTree } from '../../src/ui/perks/perkTree.js'

describe('perk tree overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="outside">outside</button>'
    gameState.humanPlayer = 'player1'; gameState.gamePaused = false; gameState.multiplayerSession = null
    gameState.buildings = [{ type: 'commandCenter', owner: 'player1', health: 100 }]
    resetPerkState(); grantPerkStars({ owner: 'player1' }, 10)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => { closePerkTree(); vi.restoreAllMocks() })
  it('[U07291] renders every catalog node, ledger and purchasable state, and pauses single player', () => {
    openPerkTree()
    expect(document.querySelectorAll('.perk-node')).toHaveLength(35)
    expect(document.querySelector('[data-perk-id="cc.base.start"]')?.classList.contains('is-available')).toBe(true)
    expect(document.querySelector('.perk-ledger').textContent).toContain('10 available')
    expect(gameState.gamePaused).toBe(true)
  })
  it('[U07292] refreshes owned and auto-granted node states after a purchase', () => {
    openPerkTree(); applyPerkPurchase('player1', 'cc.base.start', 2)
    expect(document.querySelector('[data-perk-id="cc.base.start"]')?.classList.contains('is-owned')).toBe(true)
    expect(document.querySelector('[data-perk-id="cc.base.if.economy"]')?.classList.contains('is-owned')).toBe(true)
    expect(document.querySelector('.perk-ledger').textContent).toContain('8 available')
  })
  it('[U07293] renders view-only state without a living Command Center', () => {
    gameState.buildings = []; openPerkTree()
    expect(document.querySelector('.perk-tree__cc-state').textContent).toContain('View only')
    expect(document.querySelector('[data-perk-id="cc.base.start"]')?.classList.contains('is-no-command-center')).toBe(true)
  })
  it('[U07302] uses eight live SVG merge lanes and an inline purchase confirmation', () => {
    openPerkTree()
    expect(document.querySelectorAll('.perk-capstone__merge path')).toHaveLength(8)
    const buy = document.querySelector('[data-perk-id="cc.base.start"] .perk-buy')
    buy.click()
    expect(buy.textContent).toContain('Unlock Base Planner for 2★? 10★ → 8★')
    expect(document.querySelector('[data-perk-id="cc.base.start"]')?.classList.contains('is-owned')).toBe(false)
  })
})
