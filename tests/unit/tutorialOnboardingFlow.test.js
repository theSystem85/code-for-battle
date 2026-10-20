import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map())
vi.mock('../../src/storage/indexedDbStorage.js', () => ({
  getStoredItem: key => storage.get(key) || null,
  setStoredItem: (key, value) => storage.set(key, value),
  removeStoredItem: key => storage.delete(key)
}))
vi.mock('../../src/ui/settingsModal.js', () => ({ openSettingsModal: vi.fn() }))
vi.mock('../../src/buildings.js', () => ({ buildingData: {}, canPlaceBuilding: () => true }))
vi.mock('../../src/units.js', () => ({ unitCosts: {} }))
vi.mock('../../src/productionQueue.js', () => ({ productionQueue: {} }))
vi.mock('../../src/input/remoteControlState.js', () => ({ clearRemoteControlSource: vi.fn(), setRemoteControlAction: vi.fn() }))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [], getUnitCommandsHandler: () => null }))
vi.mock('../../src/ui/tutorialSystem/helpers.js', async importOriginal => ({
  ...await importOriginal(), countPlayerBuildings: () => 0, countPlayerUnits: () => 0,
  findPlayerBuilding: () => null, getPlayerCrewSnapshot: () => new Map()
}))
import { initTutorialSystem } from '../../src/ui/tutorialSystem.js'
import { keybindingManager } from '../../src/input/keybindings.js'
import { openSettingsModal } from '../../src/ui/settingsModal.js'

let tutorial
beforeEach(() => {
  vi.useFakeTimers()
  storage.clear()
  document.body.innerHTML = '<div id="configSettingsModal" aria-hidden="true"></div>'
  keybindingManager.resetAll()
  document.body.className = ''
})
afterEach(() => { tutorial?.stop(); vi.clearAllTimers(); vi.useRealTimers() })

describe('tutorial input onboarding flow', () => {
  it('[U05430] shows ready-placement and produced-unit shortcuts as additional tutorial guidance', () => {
    tutorial = initTutorialSystem()
    tutorial.start({ reset: true, manual: true })
    const buildStep = tutorial.steps.find(step => step.id === 'build-power')
    tutorial.renderStep(buildStep)
    expect(tutorial.stepText.textContent).toContain('already-open Buildings tab')
    expect(tutorial.stepText.textContent).toContain('both options can be changed in Settings')
    const unitStep = tutorial.steps.find(step => step.id === 'tank-control')
    tutorial.renderStep(unitStep)
    expect(tutorial.stepText.textContent).toContain('newest to oldest')
  })

  it('[U04509] requires a choice, persists it, opens settings, then continues to the original welcome', () => {
    tutorial = initTutorialSystem()
    tutorial.start({ reset: true, manual: true })
    expect(tutorial.stepTitle.textContent).toBe('Choose your controls')
    expect(tutorial.nextButton.disabled).toBe(true)
    expect(tutorial.cursor.hidden).toBe(true)
    document.querySelector('[data-input-method="trackpad"]').click()
    expect(tutorial.nextButton.disabled).toBe(false)
    expect(JSON.parse(storage.get('rts_tutorial_settings')).preferredInputMethod).toBe('trackpad')
    ;[...document.querySelectorAll('button')].find(button => button.textContent === 'Open control settings').click()
    expect(openSettingsModal).toHaveBeenCalledWith('keybindings')
    tutorial.nextButton.click()
    expect(tutorial.stepTitle.textContent).toBe('Welcome to the Command Briefing')
    expect(tutorial.inputGuide.element.hidden).toBe(true)
    expect(JSON.parse(storage.get('rts_tutorial_progress'))).toMatchObject({ version: 2, stepId: 'welcome', stepIndex: 1 })
  })
  it('[U04510] shows onboarding to returning users, then resumes their original saved step', () => {
    storage.set('rts_tutorial_progress', JSON.stringify({ completed: false, stepIndex: 1 }))
    tutorial = initTutorialSystem()
    tutorial.start({ resume: true })
    expect(tutorial.steps[tutorial.stepIndex].id).toBe('input-method')
    expect(JSON.parse(storage.get('rts_tutorial_progress')).resumeAfterInputStepId).toBe('resources')
    document.querySelector('[data-input-method="touch"]').click()
    tutorial.nextButton.click()
    expect(tutorial.steps[tutorial.stepIndex].id).toBe('resources')
    expect(JSON.parse(storage.get('rts_tutorial_progress')).stepId).toBe('resources')
    expect(JSON.parse(storage.get('rts_tutorial_progress')).resumeAfterInputStepId).toBeUndefined()
  })
  it('[U04511] keeps completed and disabled tutorials off', () => {
    storage.set('rts_tutorial_progress', JSON.stringify({ completed: true, stepIndex: 5 }))
    tutorial = initTutorialSystem()
    expect(tutorial.active).toBe(false)
    expect(tutorial.overlay.hidden).toBe(true)
    expect(JSON.parse(storage.get('rts_tutorial_progress')).completed).toBe(true)
    tutorial.stop()
    storage.set('rts_tutorial_progress', JSON.stringify({ completed: false, stepIndex: 1 }))
    storage.set('rts_tutorial_settings', JSON.stringify({ showTutorial: false }))
    tutorial = initTutorialSystem()
    tutorial.start({ manual: true })
    expect(tutorial.active).toBe(false)
    expect(tutorial.overlay.hidden).toBe(true)
  })
  it('[U04512] refreshes current mappings when control settings close', async() => {
    tutorial = initTutorialSystem()
    tutorial.start({ reset: true, manual: true })
    document.querySelector('[data-input-method="trackpad"]').click()
    const modal = document.getElementById('configSettingsModal')
    modal.setAttribute('aria-hidden', 'false')
    keybindingManager.updateBinding('keyboard', 'escape', 'q')
    modal.setAttribute('aria-hidden', 'true')
    await Promise.resolve()
    expect(tutorial.inputGuide.element.textContent).toContain('q / Secondary click')
  })

  it('[U04513] uses one visibility state for minimize, stop, skip, completion and layout updates', () => {
    tutorial = initTutorialSystem()
    tutorial.start({ reset: true })
    expect(tutorial.dockButton.hidden).toBe(true)
    tutorial.toggleMinimize()
    expect(tutorial.dockButton.hidden).toBe(false)
    expect(tutorial.overlay.hidden).toBe(true)
    tutorial.stop()
    tutorial.updatePosition()
    tutorial.card.dispatchEvent(new Event('animationend'))
    expect(tutorial.dockButton.hidden).toBe(true)
    tutorial.start({ reset: true })
    tutorial.toggleMinimize()
    tutorial.skipTutorial()
    tutorial.updatePosition()
    expect(tutorial.dockButton.hidden).toBe(true)
    tutorial.settings.showTutorial = true
    tutorial.start({ reset: true })
    tutorial.stepIndex = tutorial.steps.length - 1
    tutorial.advanceStep()
    expect(tutorial.dockButton.hidden).toBe(true)
    expect(tutorial.overlay.hidden).toBe(true)
    tutorial.toggleMinimize()
    expect(tutorial.dockButton.hidden).toBe(true)
    expect(document.querySelector('[data-tutorial-tooltip][title]')).toBeNull()
  })

})
