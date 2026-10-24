import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map())
vi.mock('../../src/storage/indexedDbStorage.js', () => ({
  getStoredItem: key => storage.get(key) || null,
  setStoredItem: (key, value) => storage.set(key, value),
  removeStoredItem: key => storage.delete(key)
}))
vi.mock('../../src/ui/settingsModal.js', () => ({ openSettingsModal: vi.fn() }))
vi.mock('../../src/buildings.js', () => ({ buildingData: {}, canPlaceBuilding: (type, x, y) => x >= 0 && y >= 0 }))
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
  storage.set('rts_tutorial_settings', JSON.stringify({ showTutorial: true, speechEnabled: false }))
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

describe('player-driven tutorial progression', () => {
  it('[U05467] waits for task fulfillment and narration in either order', async() => {
    tutorial = initTutorialSystem()
    let fulfilled = false
    tutorial.steps = [
      { id: 'test', title: 'Test', text: 'Briefing', completion: () => fulfilled },
      { id: 'next', title: 'Next', interactive: true, completion: () => false }
    ]
    tutorial.active = true
    tutorial.stepIndex = 0
    tutorial.speak = () => { tutorial.speaking = true }
    tutorial.runCurrentStep()
    fulfilled = true
    await vi.advanceTimersByTimeAsync(200)
    expect(tutorial.stepIndex).toBe(0)
    expect(tutorial.nextButton.disabled).toBe(true)
    tutorial.handleNext()
    expect(tutorial.stepIndex).toBe(0)
    tutorial.speaking = false
    await vi.advanceTimersByTimeAsync(200)
    expect(tutorial.stepIndex).toBe(1)
    tutorial.stepIndex = 0
    fulfilled = false
    tutorial.runCurrentStep()
    tutorial.speaking = false
    await vi.advanceTimersByTimeAsync(200)
    expect(tutorial.stepIndex).toBe(0)
    fulfilled = true
    await vi.advanceTimersByTimeAsync(200)
    expect(tutorial.stepIndex).toBe(1)
  })

  it('[U05468] continues when a completed movement condition is latched after the order finishes', () => {
    tutorial = initTutorialSystem()
    tutorial.steps = [
      { id: 'move', title: 'Move', completion: () => false },
      { id: 'next', title: 'Next', interactive: true, completion: () => false }
    ]
    tutorial.active = true
    tutorial.phase = 'practice'
    tutorial.stepState.completed = true
    tutorial.updateContinueState(tutorial.steps[0])
    expect(tutorial.nextButton.disabled).toBe(false)
    tutorial.nextButton.click()
    expect(tutorial.stepIndex).toBe(1)
  })

  it('[U05469] only guides the first building button and map placement until the player acts', async() => {
    const { gameState } = await import('../../src/gameState.js')
    const { productionQueue } = await import('../../src/productionQueue.js')
    productionQueue.addItem = vi.fn()
    productionQueue.completeCurrentBuildingProduction = vi.fn()
    gameState.mapGrid = [[{}]]
    gameState.buildingPlacementMode = false
    gameState.currentBuildingType = null
    document.body.insertAdjacentHTML('beforeend', '<button class="tab-button active" data-tab="buildings"></button><button class="production-button" data-building-type="powerPlant"></button><canvas id="gameCanvas"></canvas>')
    document.getElementById('gameCanvas').getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600 })
    const button = document.querySelector('.production-button')
    button.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 60 })
    const click = vi.fn(() => { gameState.buildingPlacementMode = true; gameState.currentBuildingType = 'powerPlant' })
    button.addEventListener('click', click)
    tutorial = initTutorialSystem()
    tutorial.active = true
    tutorial.stepIndex = tutorial.steps.findIndex(step => step.id === 'build-power')
    tutorial.runCurrentStep()
    await vi.advanceTimersByTimeAsync(1500)
    expect(click).not.toHaveBeenCalled()
    expect(productionQueue.addItem).not.toHaveBeenCalled()
    expect(productionQueue.completeCurrentBuildingProduction).not.toHaveBeenCalled()
    expect(tutorial.cursor.getAttribute('data-instruction')).toBe('Click here!')
    expect(tutorial.cursor.style.left).toBe('60px')
    button.click()
    await vi.advanceTimersByTimeAsync(1500)
    expect(click).toHaveBeenCalledTimes(1)
    expect(tutorial.cursor.getAttribute('data-instruction')).toBe('Click here!')
    expect(tutorial.cursor.style.left).not.toBe('60px')
    expect(productionQueue.addItem).not.toHaveBeenCalled()
    gameState.mapGrid = []
  })

  it('[U05470] requires all four crew roles on the marked tank, ignoring other tanks', async() => {
    const { gameState } = await import('../../src/gameState.js')
    tutorial = initTutorialSystem()
    const crew = { driver: false, commander: false, gunner: false, loader: false }
    const tank = { id: 'lesson-tank', health: 100, crew }
    gameState.units = [tank, { id: 'other', crew: { driver: true } }]
    tutorial.stepState = { crewPrepared: true, crewTankId: tank.id }
    expect(tutorial.trackCrewRestoration()).toBe(false)
    crew.driver = true
    expect(tutorial.trackCrewRestoration()).toBe(false)
    crew.commander = crew.gunner = crew.loader = true
    expect(tutorial.trackCrewRestoration()).toBe(true)
    gameState.units = []
  })

  it('[U05471] offers a tutorial money grant only on an explicit player click', async() => {
    const { gameState } = await import('../../src/gameState.js')
    tutorial = initTutorialSystem()
    tutorial.active = true
    gameState.money = 0
    tutorial.updateStepExtras(tutorial.steps[0])
    expect(tutorial.fundsHelp.hidden).toBe(false)
    expect(tutorial.fundsHelp.textContent).toContain('Harvesters to deliver ore to a Refinery')
    expect(gameState.money).toBe(0)
    tutorial.fundsHelp.querySelector('button').click()
    expect(gameState.money).toBe(20000)
  })
})
