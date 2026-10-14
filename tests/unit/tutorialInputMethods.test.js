import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INPUT_METHODS, createInputMethodGuide, getInputGuideData, inputAwareStepText } from '../../src/ui/inputMethodGuide.js'
import { migrateTutorialProgress } from '../../src/ui/tutorialSystem/progress.js'
import { buildTutorialSteps } from '../../src/ui/tutorialSystem/steps.js'
import { keybindingManager } from '../../src/input/keybindings.js'
import { createGamepadProfileStore, placeGamepadBinding } from '../../src/input/gamepad/gamepadProfiles.js'
import { getGamepadStore, replaceGamepadStore } from '../../src/input/gamepad/gamepadStore.js'
import { gamepadMonitor } from '../../src/input/gamepad/gamepadMonitor.js'
import { getTextForDevice } from '../../src/ui/tutorialSystem/helpers.js'

beforeEach(() => {
  document.body.replaceChildren()
  document.body.className = ''
  keybindingManager.resetAll()
  replaceGamepadStore(createGamepadProfileStore())
  gamepadMonitor.slots[0].connected = false
})
afterEach(() => { keybindingManager.resetAll() })

describe('tutorial progress migration', () => {
  const all = buildTutorialSteps()
  const desktop = all.filter(step => !step.mobileOnly)
  it('starts fresh tutorials with the interactive chooser and retains the original welcome', () => {
    expect(desktop[0]).toMatchObject({ id: 'input-method', interactive: true })
    expect(desktop[1].id).toBe('welcome')
    expect(migrateTutorialProgress(null, desktop).stepId).toBe('input-method')
  })
  it('preserves the meaning of old desktop and mobile index-only progress', () => {
    expect(migrateTutorialProgress({ stepIndex: 1, completed: false }, desktop)).toMatchObject({ stepId: 'resources', stepIndex: 2, version: 2 })
    expect(migrateTutorialProgress({ stepIndex: 1, completed: false }, all)).toMatchObject({ stepId: 'mobile-sidebar-gestures', stepIndex: 2, version: 2 })
    expect(migrateTutorialProgress({ stepIndex: 2, completed: false }, all)).toMatchObject({ stepId: 'resources', stepIndex: 3, version: 2 })
  })
  it('uses stable IDs when switching layouts and does not reopen completed tutorials', () => {
    expect(migrateTutorialProgress({ version: 2, stepId: 'resources', stepIndex: 3 }, desktop, all).stepIndex).toBe(2)
    expect(migrateTutorialProgress({ version: 2, stepId: 'mobile-sidebar-gestures', stepIndex: 2 }, desktop, all).stepId).toBe('resources')
    expect(migrateTutorialProgress({ version: 2, stepId: 'input-method', resumeAfterInputStepId: 'mobile-sidebar-gestures' }, desktop, all).resumeAfterInputStepId).toBe('resources')
    expect(migrateTutorialProgress({ completed: true, stepIndex: 9 }, desktop)).toMatchObject({ completed: true, stepId: null, stepIndex: desktop.length })
  })
})

describe('input method guide', () => {
  it('offers four accessible large-button choices and settings without changing bindings', () => {
    const onChoose = vi.fn()
    const onOpenSettings = vi.fn()
    const before = JSON.parse(keybindingManager.exportBindings())
    const guide = createInputMethodGuide({ onChoose, onOpenSettings })
    document.body.append(guide.element)
    expect([...document.querySelectorAll('[data-input-method]')].map(button => button.getAttribute('aria-label'))).toEqual(INPUT_METHODS.map(method => method.label))
    document.querySelector('[data-input-method="trackpad"]').click()
    expect(onChoose).toHaveBeenCalledWith('trackpad')
    expect(document.querySelector('[data-input-method="trackpad"]').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.input-method-guide__schematic--trackpad')).not.toBeNull()
    expect(document.querySelectorAll('.input-method-guide__finger')).toHaveLength(2)
    expect(document.body.textContent).toContain('Swipe between pages')
    expect(document.body.textContent).toContain('Drag to pan map')
    expect(document.body.textContent).not.toContain('Shift + primary drag')
    document.querySelector('[data-input-method="gamepad"]').click()
    ;[...document.querySelectorAll('button')].find(button => button.textContent === 'Open control settings').click()
    expect(onOpenSettings).toHaveBeenCalledWith('gamepads')
    expect(document.querySelector('.input-method-guide__schematic--gamepad')).not.toBeNull()
    expect(JSON.parse(keybindingManager.exportBindings()).bindings).toEqual(before.bindings)
  })
  it('reads current keyboard mappings and refreshes the displayed guide', () => {
    const guide = createInputMethodGuide({ selected: 'trackpad', onChoose: vi.fn(), onOpenSettings: vi.fn() })
    document.body.append(guide.element)
    keybindingManager.updateBinding('keyboard', 'escape', 'q')
    keybindingManager.updateBinding('keyboard', 'remote-fire', 'f')
    ;[...document.querySelectorAll('button')].find(button => button.textContent === 'Refresh mappings').click()
    expect(document.body.textContent).toContain('q / Secondary click')
    expect(document.body.textContent).toContain('fire with f')
    expect(inputAwareStepText({ id: 'deselect' }, 'trackpad')).toContain('Press q')
  })
  it('resolves active gamepad overrides and labels unbound actions instead of inventing defaults', () => {
    const store = getGamepadStore()
    placeGamepadBinding(store, { slot: 0, commandId: 'leftClick', input: { type: 'button', index: 5 } })
    placeGamepadBinding(store, { slot: 0, commandId: 'rightClick', input: null })
    const data = getInputGuideData('gamepad')
    expect(data.rows.find(row => row[0] === 'Select / order')[1]).toBe('Button 5')
    expect(data.rows.find(row => row[0] === 'Deselect / cancel')[1]).toContain('Unbound')
    expect(inputAwareStepText({ id: 'select-single' }, 'gamepad')).toContain('Button 5')
  })
  it('adapts selection and command text to the chosen method rather than screen size', () => {
    const select = buildTutorialSteps().find(step => step.id === 'select-single')
    const deselect = buildTutorialSteps().find(step => step.id === 'deselect')
    expect(getTextForDevice(select, 'touch')).toContain('tap')
    document.body.classList.add('is-touch')
    expect(getTextForDevice(select, 'trackpad')).toContain('Primary click')
    expect(getTextForDevice(deselect, 'touch')).toContain('two fingers')
    expect(inputAwareStepText({ id: 'attack' }, 'trackpad')).toContain('Primary click on an enemy')
    expect(inputAwareStepText({ id: 'move-units' }, 'trackpad')).toContain('two-finger scrolling')
  })
})
