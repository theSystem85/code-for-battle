import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildTutorialSteps } from '../../src/ui/tutorialSystem/steps.js'
import { createTutorialUI } from '../../src/ui/tutorialSystem/ui.js'

describe('mobile sidebar tutorial guidance', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('describes both sidebar gestures and both build-stack button regions', () => {
    const step = buildTutorialSteps().find(candidate => candidate.id === 'mobile-sidebar-gestures')

    expect(step.mobileOnly).toBe(true)
    expect(step.text.mobile).toMatch(/Swipe right.*extend/i)
    expect(step.text.mobile).toMatch(/Swipe left.*dense/i)
    expect(step.hint).toMatch(/upper half.*add/i)
    expect(step.hint).toMatch(/lower half.*remove/i)
    expect(step.visual).toBe('mobile-build-gestures')
  })

  it('creates an initially hidden animated gesture guide in the tutorial card', () => {
    const tutorial = {
      settings: { showTutorial: true },
      progress: { completed: false },
      position: {},
      toggleMinimize: vi.fn(),
      toggleVoice: vi.fn(),
      goToPreviousStep: vi.fn(),
      handleNext: vi.fn(),
      skipTutorial: vi.fn(),
      skipStep: vi.fn()
    }

    createTutorialUI(tutorial)

    expect(tutorial.stepVisual.hidden).toBe(true)
    expect(tutorial.stepVisual.querySelector('.tutorial-gesture-guide__hand')).not.toBeNull()
    expect(tutorial.stepVisual.textContent).toContain('ADD')
    expect(tutorial.stepVisual.textContent).toContain('REMOVE')
  })
})
