import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))
vi.mock('../../src/buildings.js', () => ({ buildingData: {} }))
vi.mock('../../src/utils.js', () => ({ getUnitCost: () => 300 }))
vi.mock('../../src/ui/tutorialSystem/helpers.js', () => ({ focusCameraOnPoint: vi.fn() }))

function tank(id, extra = {}) {
  return {
    id, type: 'tank_v1', owner: 'player1', health: 100, maxHealth: 100, gas: 50, maxGas: 100,
    ammunition: 10, maxAmmunition: 20, crew: { driver: true }, level: 0, damageValue: 10, ...extra
  }
}

describe('production tooltip: automation status per unit', () => {
  let gameState
  let tooltip

  beforeEach(async() => {
    vi.resetModules()
    vi.useFakeTimers()
    document.body.innerHTML = '<button class="production-button" id="b"></button>'
    gameState = (await import('../../src/gameState.js')).gameState
    gameState.humanPlayer = 'player1'
    gameState.unitWrecks = [{ id: 'w1', owner: 'player1', unitType: 'tank_v1', health: 5, maxHealth: 100, x: 0, y: 0 }]
    gameState.units = [
      tank('a', { policyBindings: [{ policyId: 'p1', active: true }] }),
      tank('b', { policyBindings: [{ policyId: 'p1', active: false }, { policyId: 'p2', active: false }] }),
      tank('c')
    ]
    tooltip = await import('../../src/ui/productionTooltip.js')
    const button = document.getElementById('b')
    tooltip.attachProductionTooltipHandlers(button, { kind: 'unit', type: 'tank' }, {})
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    vi.advanceTimersByTime(900)
  })

  afterEach(() => {
    document.getElementById('productionTooltip')?.remove()
    gameState.units = []
    gameState.unitWrecks = []
    vi.useRealTimers()
  })

  const chip = id => document.querySelector(`[data-unit-id="${id}"] .production-tooltip__automation`)

  it('shows in-control, waiting and manual status on each live unit row', () => {
    expect(chip('a').dataset.automation).toBe('controlling')
    expect(chip('a').textContent).toContain('⚡')
    expect(chip('b').dataset.automation).toBe('enabled')
    expect(chip('b').textContent).toContain('2 waiting')
    expect(chip('c').dataset.automation).toBe('none')
  })

  it('marks wrecks as inactive', () => {
    const wreckChip = document.querySelector('[data-wreck-id="w1"] .production-tooltip__automation')
    expect(wreckChip.dataset.automation).toBe('none')
    expect(wreckChip.textContent).toContain('inactive')
  })

  it('refreshes the status in place while the panel is open', () => {
    const before = chip('c')
    gameState.units[2].policyBindings = [{ policyId: 'p1', active: true }]
    vi.advanceTimersByTime(tooltip.AUTOMATION_REFRESH_MS + 10)
    expect(chip('c')).toBe(before)
    expect(chip('c').dataset.automation).toBe('controlling')
  })

  it('uses no native title attributes', () => {
    expect(document.querySelectorAll('#productionTooltip [title]').length).toBe(0)
  })
})
