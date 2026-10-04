import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../src/ui/notifications.js', () => ({ showNotification: vi.fn() }))
vi.mock('../../src/ui/policies/policyEditorModal.js', () => ({ openPolicyEditor: vi.fn() }))
vi.mock('../../src/ui/policies/policies.css', () => ({}))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))

function bound(id, policyId, active) {
  return { id, type: 'tank_v1', owner: 'player1', health: 50, x: 0, y: 0, policyActive: active, policyBindings: [{ policyId, active }] }
}

describe('policy activity UI', () => {
  let store
  let gameState

  beforeEach(async() => {
    vi.resetModules()
    vi.useFakeTimers()
    document.body.innerHTML = `
      <button id="policiesBtn"></button>
      <div id="productionTabs"><button class="tab-button" data-tab="units">Units</button></div>
      <button id="mobileCategoryToggle"></button>`
    localStorage.clear()
    store = await import('../../src/policies/policyStore.js')
    store.resetPolicyStore()
    const { POLICY_TEMPLATES } = await import('../../src/policies/policyTemplates.js')
    store.savePolicy('player1', POLICY_TEMPLATES.find(t => t.id === 'engage-in-range').create('p-engage'))
    gameState = (await import('../../src/gameState.js')).gameState
    gameState.humanPlayer = 'player1'
    gameState.units = [bound('a', 'p-engage', true), bound('b', 'p-engage', false), bound('c', 'p-engage', false)]
  })

  afterEach(() => {
    vi.useRealTimers()
    gameState.units = []
  })

  it('shows enabled and in-control counts on each policy card and keeps them fresh', async() => {
    const panel = await import('../../src/ui/policies/policyPanel.js')
    panel.installPolicyPanel()
    panel.openPolicyPanel()
    const card = document.querySelector('.policy-card')
    expect(card.querySelector('[data-role="enabled-count"]').textContent).toBe('3')
    expect(card.querySelector('[data-role="active-count"]').textContent).toBe('1')
    expect(card.querySelector('.policy-count--active').classList.contains('is-lit')).toBe(true)

    gameState.units[1].policyBindings[0].active = true
    gameState.units[2].health = 0
    vi.advanceTimersByTime(panel.PANEL_REFRESH_MS + 10)
    expect(document.querySelector('.policy-card')).toBe(card)
    expect(card.querySelector('[data-role="enabled-count"]').textContent).toBe('2')
    expect(card.querySelector('[data-role="active-count"]').textContent).toBe('2')
  })

  it('uses custom tooltips only: no native title attribute anywhere in the panel', async() => {
    const panel = await import('../../src/ui/policies/policyPanel.js')
    panel.installPolicyPanel()
    panel.openPolicyPanel()
    expect(document.querySelectorAll('#policyPanel [title]').length).toBe(0)
    const chip = document.querySelector('.policy-count')
    chip.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false, clientX: 20, clientY: 20 }))
    const tip = document.querySelector('.policy-tooltip')
    expect(tip.classList.contains('is-visible')).toBe(true)
    expect(tip.textContent).toContain('Units with this policy enabled')
  })
})
