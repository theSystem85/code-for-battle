import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/ui/notifications.js', () => ({ showNotification: vi.fn() }))
vi.mock('../../src/ui/policies/policies.css', () => ({}))

function change(element, value) {
  element.value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('editor: marking a policy as a build policy', () => {
  let store
  let editor
  let gameStateModule

  beforeEach(async() => {
    vi.resetModules()
    document.body.innerHTML = '<button id="pauseBtn"></button>'
    localStorage.clear()
    store = await import('../../src/policies/policyStore.js')
    store.resetPolicyStore()
    gameStateModule = await import('../../src/gameState.js')
    gameStateModule.gameState.gamePaused = false
    editor = await import('../../src/ui/policies/policyEditorModal.js')
  })

  const typeSelect = () => document.querySelector('select[aria-label="Policy type"]')

  it('starts as a unit policy and offers the policy type switch for a new draft', () => {
    editor.openPolicyEditor()
    expect(document.getElementById('policyEditorTitle').textContent).toBe('New unit policy')
    expect([...typeSelect().options].map(item => item.value)).toEqual(['unit', 'build'])
    expect(document.querySelector('select[aria-label="Scope"]')).not.toBeNull()
  })

  it('switches the draft to a build policy with base-only conditions and actions', () => {
    const api = editor.openPolicyEditor()
    change(typeSelect(), 'build')
    expect(api.getDraft().variant).toBe('build')
    expect(api.getDraft().scope).toBe('global')
    expect(document.getElementById('policyEditorTitle').textContent).toBe('New build (base) policy')
    expect(document.querySelector('select[aria-label="Scope"]')).toBeNull()
    expect(document.body.textContent).toContain('My base (when Base automation is on)')

    const actionOptions = [...document.querySelectorAll('select[aria-label="State 1 action"] option')].map(item => item.value)
    expect(actionOptions).toContain('buildBuilding')
    expect(actionOptions).not.toContain('retreat')

    const templateOptions = [...document.querySelectorAll('select[aria-label="Template"] option')].map(item => item.value)
    expect(templateOptions).toContain('build-power-when-short')
    expect(templateOptions).not.toContain('retreat-if-hurt')
  })

  it('can add a rule on available money and the draft stays valid and saveable', () => {
    const api = editor.openPolicyEditor()
    change(typeSelect(), 'build')
    change(document.querySelector('select[aria-label="State 1 action"]'), 'buildBuilding')
    const addRule = [...document.querySelectorAll('button')].find(button => button.textContent === '+ rule')
    addRule.click()
    const draft = api.getDraft()
    expect(draft.states[0].transitions[0].when.field).toBe('money')
    const kinds = [...document.querySelectorAll('.policy-cond select option')].map(item => item.value)
    expect(kinds).toEqual(expect.arrayContaining(['money', 'moneyPerMinute', 'buildingCount', 'unitCount', 'enemyUnitCount', 'enemyBuildingCount']))
    expect(kinds).not.toContain('hp')
    expect(kinds).not.toContain('airborne')

    const save = [...document.querySelectorAll('button')].find(button => button.textContent === 'Save policy')
    expect(save.disabled).toBe(false)
    save.click()
    const saved = store.listPolicies('player1')
    expect(saved).toHaveLength(1)
    expect(saved[0].policy.variant).toBe('build')
    expect(saved[0].policy.scope).toBe('global')
  })

  it('groups conditions with a visible logical bracket and an AND/OR choice', () => {
    const api = editor.openPolicyEditor()
    const addRule = [...document.querySelectorAll('button')].find(button => button.textContent === '+ rule')
    addRule.click()

    const groupButton = [...document.querySelectorAll('button')].find(button => button.textContent === 'Group conditions')
    groupButton.click()

    expect(document.querySelector('.policy-cond__group')).not.toBeNull()
    expect(document.querySelector('.policy-cond__groupmark').textContent).toBe('Match all conditions')
    expect(api.getDraft().states[0].transitions[0].when).toMatchObject({ type: 'and' })
    expect(api.getDraft().states[0].transitions[0].when.of).toHaveLength(2)

    change(document.querySelector('select[aria-label="Condition combine"]'), 'or')
    expect(document.querySelector('.policy-cond__groupmark').textContent).toBe('Match any condition')
    expect(api.getDraft().states[0].transitions[0].when.type).toBe('or')
  })

  it('shows the type of an existing policy but does not let it change', () => {
    const build = {
      schemaVersion: 1,
      id: 'existing',
      name: 'Existing',
      variant: 'build',
      scope: 'global',
      execution: 'continuous',
      initialStateId: 'a',
      states: [{ id: 'a', name: 'A', effect: null, transitions: [] }]
    }
    expect(store.savePolicy('player1', build).ok).toBe(true)
    editor.openPolicyEditor({ policyId: 'existing' })
    expect(document.getElementById('policyEditorTitle').textContent).toBe('Edit build (base) policy')
    expect(typeSelect()).toBeNull()
    expect(document.body.textContent).toContain('Build policy (base)')
  })

  it('opens straight into a build draft from the panel shortcut', () => {
    const api = editor.openPolicyEditor({ variant: 'build' })
    expect(api.getDraft().variant).toBe('build')
  })
})

describe('policy panel: base automation section', () => {
  let store
  let panelApi
  let gameStateModule

  beforeEach(async() => {
    vi.resetModules()
    document.body.innerHTML = '<button id="policiesBtn"></button><button id="pauseBtn"></button>'
    localStorage.clear()
    store = await import('../../src/policies/policyStore.js')
    store.resetPolicyStore()
    const engine = await import('../../src/policies/basePolicyEngine.js')
    engine.resetBasePolicyEngine()
    gameStateModule = await import('../../src/gameState.js')
    gameStateModule.gameState.gamePaused = false
    gameStateModule.gameState.humanPlayer = 'player1'
    const { templatesForVariant } = await import('../../src/policies/policyTemplates.js')
    store.savePolicy('player1', templatesForVariant('build')[0].create('p-build'))
    const { POLICY_TEMPLATES } = await import('../../src/policies/policyTemplates.js')
    store.savePolicy('player1', POLICY_TEMPLATES.find(item => item.id === 'engage-in-range').create('p-unit'))
    panelApi = await import('../../src/ui/policies/policyPanel.js')
    panelApi.installPolicyPanel()
    panelApi.openPolicyPanel()
  })

  it('lists build policies in their own section with an opt-in switch that is off by default', () => {
    expect(document.getElementById('basePoliciesHeading')).not.toBeNull()
    const optIn = document.getElementById('baseAutomationSwitch')
    expect(optIn.getAttribute('aria-checked')).toBe('false')
    const buildCard = document.querySelector('.policy-card[data-policy-id="p-build"]')
    expect(buildCard.textContent).toContain('My base')
    expect(buildCard.querySelector('[data-role="enabled-count"]')).toBeNull()
    expect(buildCard.querySelector('[data-role="base-status"]').textContent).toBe('Not applied to my base')
    const unitCard = document.querySelector('.policy-card[data-policy-id="p-unit"]')
    expect(unitCard.querySelector('[data-role="enabled-count"]')).not.toBeNull()
  })

  it('applies a build policy and opts in without pausing the game', () => {
    const pause = document.getElementById('pauseBtn')
    const pauseClicks = vi.fn()
    pause.addEventListener('click', pauseClicks)
    const buildSwitch = () => document.querySelector('.policy-card[data-policy-id="p-build"] .policy-switch')
    buildSwitch().click()
    expect(store.isPolicyEnabled('p-build')).toBe(true)
    expect(buildSwitch().querySelector('.policy-switch__label').textContent).toBe('On · applied to my base')
    expect(document.querySelector('[data-role="base-status"]').textContent).toBe('Waiting: base automation is off')

    document.getElementById('baseAutomationSwitch').click()
    expect(store.isBuildAutomationOptedIn('player1')).toBe(true)
    expect(document.getElementById('baseAutomationSwitch').querySelector('.policy-switch__label').textContent).toBe('On · my base')
    expect(pauseClicks).not.toHaveBeenCalled()
    expect(gameStateModule.gameState.gamePaused).toBe(false)
  })

  it('keeps build policies out of the unit radial list', async() => {
    store.setPolicyEnabled('player1', 'p-build', true)
    const entries = store.listPolicies('player1').filter(entry => entry.policy.scope === 'perUnit' && entry.policy.variant !== 'build')
    expect(entries.map(entry => entry.policy.id)).not.toContain('p-build')
    const unit = { id: 'u', owner: 'player1', type: 'tank_v1', health: 100 }
    expect(store.applyPolicyToUnit('player1', unit, 'p-build').ok).toBe(false)
  })
})
