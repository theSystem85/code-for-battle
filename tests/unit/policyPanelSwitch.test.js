import { describe, it, expect, beforeEach, vi } from 'vitest'

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
    panelApi.installPolicyPanel()
    panelApi.openPolicyPanel()
  })

  it('shows the full state hint as visible text instead of a hover-only tooltip', () => {
    const sw = document.querySelector('.policy-switch')
    expect(sw.hasAttribute('data-policy-tip')).toBe(false)
    expect(sw.querySelector('.policy-switch__track')).not.toBeNull()
    expect(sw.querySelector('.policy-switch__label').textContent).toBe('Off · click to enable')
  })

  it('updates the visible label when the policy is enabled', () => {
    document.querySelector('.policy-switch').click()
    const sw = document.querySelector('.policy-switch')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(sw.querySelector('.policy-switch__label').textContent).toBe('On · click to disable')
  })
})
