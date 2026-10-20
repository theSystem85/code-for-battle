import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/productionQueue.js', () => ({ productionQueue: { startReadyBuildingPlacement: vi.fn() } }))
vi.mock('../../src/ui/productionUnitFocus.js', () => ({ focusProducedUnit: vi.fn() }))

import { productionQueue } from '../../src/productionQueue.js'
import { focusProducedUnit } from '../../src/ui/productionUnitFocus.js'

import {
  initProductionTabs,
  handleMobileCategoryToggle,
  updateMobileCategoryToggle
} from '../../src/ui/productionControllerTabs.js'

describe('productionControllerTabs mobile toggle selectors', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="productionTabs">
        <button class="tab-button" data-tab="units">Units</button>
        <button class="tab-button active" data-tab="buildings">Buildings</button>
        <button id="mobileCategoryToggle" type="button">Buildings</button>
      </div>
      <div id="saveLoadMenu">
        <button id="saveListTab" class="tab-button active" type="button">Save Games</button>
      </div>
    `
  })

  it('[U03472] toggles from buildings to units even when non-production tab buttons are active', () => {
    const controller = {
      activateTab: vi.fn()
    }

    handleMobileCategoryToggle(controller)

    expect(controller.activateTab).toHaveBeenCalledWith('units', { scrollIntoView: true })
  })

  it('[U03473] uses the production active tab for mobile toggle label state', () => {
    const controller = {
      mobileCategoryToggle: document.getElementById('mobileCategoryToggle'),
      ensureMobileToggle: vi.fn()
    }

    updateMobileCategoryToggle(controller)

    expect(controller.mobileCategoryToggle.textContent).toBe('BUILDINGS')
    expect(controller.mobileCategoryToggle.getAttribute('aria-label')).toBe('Switch to UNITS build options')
  })
  it('[U05423] runs secondary actions only for the already-active production tab', () => {
    const controller = { activateTab: vi.fn(), ensureMobileToggle: vi.fn(), updateTabStates: vi.fn() }
    initProductionTabs(controller)
    initProductionTabs(controller)
    controller.activateTab.mockClear()
    document.querySelector('[data-tab="buildings"]').click()
    expect(productionQueue.startReadyBuildingPlacement).toHaveBeenCalledOnce()
    document.querySelector('[data-tab="units"]').click()
    expect(focusProducedUnit).not.toHaveBeenCalled()
    document.querySelector('[data-tab="units"]').classList.add('active')
    document.querySelector('[data-tab="units"]').click()
    expect(focusProducedUnit).toHaveBeenCalledWith(controller)
  })

})
