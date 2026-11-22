import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../src/ui/notifications.js', () => ({ showNotification: vi.fn() }))
vi.mock('../../src/ui/policies/policyEditorModal.js', () => ({ openPolicyEditor: vi.fn() }))
vi.mock('../../src/ui/policies/policies.css', () => ({}))

describe('policy panel global switch', () => {
  let store
  let panelApi

  beforeEach(async() => {
    vi.resetModules()
    document.body.innerHTML = '<button id="policiesBtn"></button>'
    localStorage.clear()
    store = await import('../../src/policies/policyStore.js')
    store.resetPolicyStore()
    const { POLICY_TEMPLATES } = await import('../../src/policies/policyTemplates.js')
    const policy = POLICY_TEMPLATES.find(t => t.id === 'engage-in-range').create('p-engage')
    expect(store.savePolicy('player1', policy).ok).toBe(true)
    panelApi = await import('../../src/ui/policies/policyPanel.js')
  })

  function showPanel() {
    panelApi.installPolicyPanel()
    panelApi.openPolicyPanel()
  }

  afterEach(() => {
    panelApi?.closePolicyPanel()
    vi.unstubAllGlobals()
  })

  it('[U03387] shows the full state hint as visible text instead of a hover-only tooltip', () => {
    showPanel()
    const sw = document.querySelector('.policy-switch')
    expect(sw.hasAttribute('data-policy-tip')).toBe(false)
    expect(sw.querySelector('.policy-switch__track')).not.toBeNull()
    expect(sw.querySelector('.policy-switch__label').textContent).toBe('Off · click to enable')
  })

  it('[U03388] updates the visible label when the policy is enabled', () => {
    showPanel()
    document.querySelector('.policy-switch').click()
    const sw = document.querySelector('.policy-switch')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(sw.querySelector('.policy-switch__label').textContent).toBe('On · click to disable')
  })

  it.each([true, false])('[U07347] enables the matching automation choices after perk purchases (panel open: %s)', async panelOpen => {
    const { gameState } = await import('../../src/gameState.js')
    const { adjustPerkStars, applyPerkPurchase, resetPerkState } = await import('../../src/perks/perkState.js')
    const { openPolicyEditor } = await import('../../src/ui/policies/policyEditorModal.js')
    vi.stubGlobal('__AUTOMATION_PERK_MODE__', undefined)
    gameState.humanPlayer = 'player2'
    gameState.buildings = [{ type: 'commandCenter', owner: 'player2', health: 100 }]
    resetPerkState()
    adjustPerkStars('player2', 12)
    showPanel()

    const select = document.querySelector('#newAutomationSelect')
    for (const [variant, perkId, label, hint] of [
      ['unitBuild', 'cc.prod.start', 'build unit', 'needs Production Scheduler (3★)'],
      ['build', 'cc.base.start', 'build base', 'needs Base Planner (2★)'],
      ['unit', 'cc.unit.start', 'control unit', 'needs Unit Command Link (5★)'],
      ['defence', 'cc.def.start', 'control base defence', 'needs Defence Grid Uplink (2★)']
    ]) {
      const option = select.querySelector(`option[value="${variant}"]`)
      expect(option.disabled).toBe(true)
      expect(option.textContent).toBe(`🔒 ${label}: ${hint}`)
      expect(option.getAttribute('aria-description')).toBe(hint)

      if (!panelOpen) panelApi.closePolicyPanel()
      expect(applyPerkPurchase('player2', perkId).ok).toBe(true)
      if (!panelOpen) panelApi.openPolicyPanel()

      expect(option.disabled).toBe(false)
      expect(option.textContent).toBe(label)
      expect(option.hasAttribute('aria-description')).toBe(false)
      select.value = variant
      select.dispatchEvent(new Event('change'))
      expect(openPolicyEditor).toHaveBeenLastCalledWith({ variant, defenceBuilding: undefined })
      panelApi.openPolicyPanel()
      expect(select.value).toBe('')
    }
  })
})
