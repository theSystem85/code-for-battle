import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'

vi.mock('../../src/ui/notifications.js', () => ({ showNotification: vi.fn() }))
vi.mock('../../src/ui/policies/policyEditorModal.js', () => ({ openPolicyEditor: vi.fn() }))
vi.mock('../../src/ui/policies/policies.css', () => ({}))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))
vi.mock('../../src/input/selectionManager.js', () => ({ getUnitSelectionCenter: () => ({ centerX: 0, centerY: 0 }) }))

function makeUnit(owner = 'player1') {
  return {
    id: 'u1', type: 'tank_v1', owner, x: 20 * TILE_SIZE, y: 20 * TILE_SIZE, tileX: 20, tileY: 20,
    health: 20, maxHealth: 100, path: [], moveTarget: null, target: null
  }
}

describe('policy applied from the radial menu', () => {
  let store
  let engine
  let radial
  let activity
  let gameState
  let panel

  beforeEach(async() => {
    vi.resetModules()
    document.body.innerHTML = '<button id="policiesBtn"></button>'
    localStorage.clear()
    store = await import('../../src/policies/policyStore.js')
    store.resetPolicyStore()
    gameState = (await import('../../src/gameState.js')).gameState
    gameState.humanPlayer = 'player1'
    engine = await import('../../src/policies/policyEngine.js')
    radial = await import('../../src/ui/policies/unitPolicyRadial.js')
    activity = await import('../../src/policies/policyActivity.js')
    panel = await import('../../src/ui/policies/policyPanel.js')
    const { POLICY_TEMPLATES } = await import('../../src/policies/policyTemplates.js')
    store.savePolicy('player1', POLICY_TEMPLATES.find(t => t.id === 'retreat-while-hurt').create('p-while'))
  })

  function pick(unit, id) {
    const items = radial.buildUnitPolicyItems(unit)
    items.find(item => item.id === id).onSelect()
  }

  function stepEngine(unit, now) {
    const units = [unit]
    const context = {
      units, mapGrid: Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'grass' }))),
      buildings: [], factories: [{ id: 'player1', type: 'constructionYard', owner: 'player1', x: 2, y: 2, width: 3, height: 3, health: 100 }],
      commands: { handleMovementCommand: vi.fn(), handleAttackCommand: vi.fn() }
    }
    engine.updateUnitPolicies(units, context, now)
  }

  it('counts the unit as in control as soon as the policy takes hold, and as enabled right away', () => {
    const unit = makeUnit()
    pick(unit, 'p-while')
    expect(activity.countPolicyActivity([unit]).get('p-while')).toEqual({ enabled: 1, active: 0 })

    stepEngine(unit, 1000)
    expect(unit.policyActive).toBe(true)
    expect(activity.countPolicyActivity([unit]).get('p-while')).toEqual({ enabled: 1, active: 1 })
    expect(activity.shouldShowPolicyIndicator(unit, 'player1')).toBe(true)
  })

  it('shows the indicator for the legacy "player" owner and hides it for other owners', () => {
    const unit = makeUnit('player')
    unit.policyActive = true
    expect(activity.shouldShowPolicyIndicator(unit, 'player1')).toBe(true)
    expect(activity.shouldShowPolicyIndicator(makeUnit('player2'), 'player1')).toBe(false)
  })

  it('clears the indicator immediately when the policy is removed again', () => {
    const unit = makeUnit()
    pick(unit, 'p-while')
    stepEngine(unit, 1000)
    expect(unit.policyActive).toBe(true)
    pick(unit, 'p-while')
    expect(unit.policyBindings).toHaveLength(0)
    expect(unit.policyActive).toBe(false)
    expect(unit.policyActiveCount).toBe(0)
  })

  it('updates the policy panel "in control" chip for a per-unit policy', () => {
    vi.useFakeTimers()
    const unit = makeUnit()
    gameState.units = [unit]
    panel.installPolicyPanel()
    panel.openPolicyPanel()
    pick(unit, 'p-while')
    stepEngine(unit, 1000)
    vi.advanceTimersByTime(panel.PANEL_REFRESH_MS + 10)
    const card = document.querySelector('.policy-card')
    expect(card.querySelector('[data-role="enabled-count"]').textContent).toBe('1')
    expect(card.querySelector('[data-role="active-count"]').textContent).toBe('1')
    gameState.units = []
    vi.useRealTimers()
  })

  it('offers a state machine toggle in the unit menu and opens the view', async() => {
    const unit = makeUnit()
    pick(unit, 'p-while')
    const items = radial.buildUnitPolicyItems(unit)
    const machine = items.find(item => item.id === '__machine')
    expect(machine).toBeTruthy()
    expect(machine.ready).toBe(false)
    machine.onSelect()
    const view = await import('../../src/ui/policies/policyMachineView.js')
    expect(view.isPolicyMachineViewOpen(unit)).toBe(true)
    expect(radial.buildUnitPolicyItems(unit).find(item => item.id === '__machine').ready).toBe(true)
    machine.onSelect()
    expect(view.isPolicyMachineViewOpen(unit)).toBe(false)
  })
})
