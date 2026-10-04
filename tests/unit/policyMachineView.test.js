import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { layoutPolicyMachine, wrapLabel, LABEL_CHARS } from '../../src/ui/policies/policyMachineLayout.js'

vi.mock('../../src/ui/notifications.js', () => ({ showNotification: vi.fn() }))
vi.mock('../../src/ui/policies/policyEditorModal.js', () => ({ openPolicyEditor: vi.fn() }))
vi.mock('../../src/ui/policies/policies.css', () => ({}))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))
vi.mock('../../src/input/selectionManager.js', () => ({ getUnitSelectionCenter: () => ({ centerX: 0, centerY: 0 }) }))

describe('wrapLabel', () => {
  it('wraps long labels onto further lines without losing text', () => {
    const text = 'while(ammo == 100% and hp < 25% and enemy in weapon range) until(hp > 50%)'
    const lines = wrapLabel(text)
    expect(lines.length).toBeGreaterThan(1)
    lines.forEach(line => expect(line.length).toBeLessThanOrEqual(LABEL_CHARS))
    expect(lines.join(' ')).toBe(text)
  })

  it('keeps a short label on one line and hard-breaks a word without spaces', () => {
    expect(wrapLabel('if(ammo == 100%)')).toEqual(['if(ammo == 100%)'])
    expect(wrapLabel('x'.repeat(70)).length).toBe(3)
  })
})

describe('layoutPolicyMachine', () => {
  const policy = {
    initialStateId: 'a',
    states: [
      { id: 'a', name: 'A', effect: null, transitions: [{ id: 't1', kind: 'if', to: 'b' }, { id: 't2', kind: 'after', to: 'a', delaySeconds: 5 }] },
      { id: 'b', name: 'B', effect: { type: 'retreat' }, transitions: [{ id: 't3', kind: 'while', to: 'a' }] }
    ]
  }

  it('gives every edge a lane of its own and keeps labels left of all lanes', () => {
    const layout = layoutPolicyMachine(policy, t => `${t.kind}(a very long condition text that has to wrap onto several lines)`, () => '')
    expect(layout.edges).toHaveLength(3)
    const lanes = new Set(layout.edges.map(edge => edge.laneX))
    expect(lanes.size).toBe(3)
    layout.edges.forEach(edge => {
      expect(edge.lines.length).toBeGreaterThan(1)
      expect(edge.labelX).toBeLessThan(Math.min(...lanes))
    })
    expect(layout.nodes[1].y).toBeGreaterThan(layout.nodes[0].y + layout.nodes[0].height)
  })

  it('makes room for wrapped labels so states never overlap', () => {
    const short = layoutPolicyMachine(policy, () => 'if(x)', () => '')
    const long = layoutPolicyMachine(policy, () => 'if(x) '.repeat(20), () => '')
    expect(long.nodes[1].y).toBeGreaterThan(short.nodes[1].y)
    expect(long.height).toBeGreaterThan(short.height)
  })
})

describe('policy state machine view', () => {
  let store
  let view
  let gameState
  let unit

  beforeEach(async() => {
    vi.resetModules()
    vi.useFakeTimers()
    document.body.innerHTML = ''
    localStorage.clear()
    store = await import('../../src/policies/policyStore.js')
    store.resetPolicyStore()
    gameState = (await import('../../src/gameState.js')).gameState
    gameState.humanPlayer = 'player1'
    const { POLICY_TEMPLATES } = await import('../../src/policies/policyTemplates.js')
    store.savePolicy('player1', POLICY_TEMPLATES.find(t => t.id === 'retreat-while-hurt').create('p-while'))
    unit = { id: 'u1', type: 'tank_v1', owner: 'player1', health: 50, maxHealth: 100, x: 0, y: 0 }
    store.applyPolicyToUnit('player1', unit, 'p-while')
    view = await import('../../src/ui/policies/policyMachineView.js')
  })

  afterEach(() => {
    view.closePolicyMachineView()
    vi.useRealTimers()
  })

  it('shows every state, the full rule text and highlights the current state live', () => {
    view.openPolicyMachineView(unit)
    const nodes = document.querySelectorAll('.policy-machine__node')
    expect(nodes).toHaveLength(2)
    expect(document.querySelector('.policy-machine__label').textContent).toContain('while(')
    expect(document.querySelector('[data-state-id="watch"]').classList.contains('is-current')).toBe(true)
    expect(document.querySelector('[data-state-id="react"]').classList.contains('is-current')).toBe(false)

    const runtime = unit.policyBindings[0].runtime
    runtime.currentStateId = 'react'
    runtime.entered = { watch: 1, react: 3 }
    runtime.hold = { transitionId: 'rule1', returnStateId: 'watch' }
    vi.advanceTimersByTime(view.MACHINE_REFRESH_MS + 10)
    expect(document.querySelector('[data-state-id="react"]').classList.contains('is-current')).toBe(true)
    expect(document.querySelector('[data-state-id="watch"]').classList.contains('is-current')).toBe(false)
    expect(document.querySelector('[data-state-id="react"] .policy-machine__node-count').textContent).toBe('entered 3×')
    expect(document.querySelector('[data-state-id="watch"] .policy-machine__node-count').textContent).toBe('entered 1×')
  })

  it('updates in place instead of rebuilding the diagram', () => {
    view.openPolicyMachineView(unit)
    const svgBefore = document.querySelector('.policy-machine__svg')
    vi.advanceTimersByTime(view.MACHINE_REFRESH_MS * 4)
    expect(document.querySelector('.policy-machine__svg')).toBe(svgBefore)
  })

  it('toggles open and closed and never uses native titles', () => {
    expect(view.togglePolicyMachineView(unit)).toBe(true)
    expect(view.isPolicyMachineViewOpen(unit)).toBe(true)
    expect(document.querySelectorAll('.policy-machine [title]').length).toBe(0)
    expect(view.togglePolicyMachineView(unit)).toBe(false)
    expect(document.querySelector('.policy-machine').classList.contains('is-open')).toBe(false)
  })

  it('shows the running delay of an after rule', async() => {
    const { POLICY_TEMPLATES } = await import('../../src/policies/policyTemplates.js')
    store.savePolicy('player1', POLICY_TEMPLATES.find(t => t.id === 'advance-after-delay').create('p-after'))
    const other = { id: 'u2', type: 'tank_v1', owner: 'player1', health: 50, maxHealth: 100, x: 0, y: 0 }
    store.applyPolicyToUnit('player1', other, 'p-after')
    const { getSimulationTime } = await import('../../src/game/time.js')
    view.openPolicyMachineView(other)
    expect(document.querySelector('.policy-machine__delay').textContent).toBe('delay not running')
    other.policyBindings[0].runtime.pending = { rule1: getSimulationTime(gameState) + 7000 }
    vi.advanceTimersByTime(view.MACHINE_REFRESH_MS + 10)
    expect(document.querySelector('.policy-machine__delay').textContent).toBe('7s left')
  })
})
