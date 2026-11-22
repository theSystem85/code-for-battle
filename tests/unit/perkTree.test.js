import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { applyPerkPurchase, grantPerkStars, resetPerkState } from '../../src/perks/perkState.js'
import { closePerkTree, openPerkTree } from '../../src/ui/perks/perkTree.js'

function dispatchPointer(node, type, pointerType = 'mouse') {
  node.dispatchEvent(new window.PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, isPrimary: true, pointerType }))
}

describe('perk tree overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="outside">outside</button>'
    gameState.humanPlayer = 'player1'; gameState.gamePaused = false; gameState.multiplayerSession = null
    gameState.buildings = [{ type: 'commandCenter', owner: 'player1', health: 100 }]
    resetPerkState(); grantPerkStars({ owner: 'player1' }, 10)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => { closePerkTree(); vi.useRealTimers(); vi.restoreAllMocks() })
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
    const node = document.querySelector('[data-perk-id="cc.base.start"]')
    expect(node.classList.contains('is-no-command-center')).toBe(true)
    node.click()
    expect(node.querySelector('.perk-tooltip__hold').textContent).toBe('Hold for 2s to unlock!')
    expect(node.querySelector('.perk-tooltip__state').textContent).toContain('Rebuild the Command Center')
    dispatchPointer(node, 'pointerdown')
    expect(node.classList.contains('is-holding')).toBe(false)
  })
  it('[U07304] opens tooltips by pointer-compatible click and closes the previous node', () => {
    openPerkTree()
    const first = document.querySelector('[data-perk-id="cc.base.start"]')
    const second = document.querySelector('[data-perk-id="cc.prod.start"]')
    first.click(); expect(first.classList.contains('show-tooltip')).toBe(true)
    expect(first.querySelector('.perk-tooltip__hold').textContent).toBe('Hold for 2s to unlock!')
    second.click(); expect(first.classList.contains('show-tooltip')).toBe(false)
    expect(second.classList.contains('show-tooltip')).toBe(true)
  })
  it('[U07305] resets an early mouse release and purchases only after a fresh two-second hold', () => {
    vi.useFakeTimers()
    openPerkTree()
    const findNode = () => document.querySelector('[data-perk-id="cc.base.start"]')
    const node = findNode()
    dispatchPointer(node, 'pointerdown')
    expect(node.classList.contains('is-holding')).toBe(true)
    vi.advanceTimersByTime(1500)
    dispatchPointer(node, 'pointerup')
    expect(node.classList.contains('is-holding')).toBe(false)
    vi.advanceTimersByTime(500)
    expect(findNode()).toBe(node)
    dispatchPointer(node, 'pointerdown')
    vi.advanceTimersByTime(1999)
    expect(findNode()).toBe(node)
    vi.advanceTimersByTime(1)
    expect(findNode().classList.contains('is-owned')).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(document.querySelector('.perk-ledger').textContent).toContain('8 available')
  })
  it('[U07302] keeps the eight live SVG merge lanes and cancels interrupted touch holds', () => {
    vi.useFakeTimers()
    openPerkTree()
    expect(document.querySelectorAll('.perk-capstone__merge path')).toHaveLength(8)
    const node = document.querySelector('[data-perk-id="cc.base.start"]')
    dispatchPointer(node, 'pointerdown', 'touch')
    expect(node.classList.contains('is-holding')).toBe(true)
    dispatchPointer(node, 'pointercancel', 'touch')
    expect(node.classList.contains('is-holding')).toBe(false)
    vi.advanceTimersByTime(2000)
    dispatchPointer(node, 'pointerdown', 'touch')
    closePerkTree()
    vi.advanceTimersByTime(2000)
    openPerkTree()
    expect(document.querySelector('[data-perk-id="cc.base.start"]').classList.contains('is-owned')).toBe(false)
  })
})
