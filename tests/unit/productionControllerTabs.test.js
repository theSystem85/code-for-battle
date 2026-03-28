import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
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

  it('toggles from buildings to units even when non-production tab buttons are active', () => {
    const controller = {
      activateTab: vi.fn()
    }

    handleMobileCategoryToggle(controller)

    expect(controller.activateTab).toHaveBeenCalledWith('units', { scrollIntoView: true })
  })

  it('uses the production active tab for mobile toggle label state', () => {
    const controller = {
      mobileCategoryToggle: document.getElementById('mobileCategoryToggle'),
      ensureMobileToggle: vi.fn()
    }

    updateMobileCategoryToggle(controller)

    expect(controller.mobileCategoryToggle.textContent).toBe('BUILDINGS')
    expect(controller.mobileCategoryToggle.getAttribute('aria-label')).toBe('Switch to UNITS build options')
  })
})
