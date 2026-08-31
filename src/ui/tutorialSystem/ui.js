import { TUTORIAL_POSITION_KEY } from './constants.js'
import { writeToStorage } from './storage.js'

export function createTutorialUI(tutorial) {
  if (document.getElementById('tutorialOverlay')) {
    tutorial.overlay = document.getElementById('tutorialOverlay')
    tutorial.cursor = document.getElementById('tutorialCursor')
    tutorial.card = tutorial.overlay.querySelector('.tutorial-card')
    tutorial.dockButton = document.getElementById('tutorialDock')
    tutorial.stepTitle = tutorial.overlay.querySelector('.tutorial-title')
    tutorial.stepText = tutorial.overlay.querySelector('.tutorial-text')
    tutorial.stepHint = tutorial.overlay.querySelector('.tutorial-hint')
    tutorial.stepVisual = tutorial.overlay.querySelector('.tutorial-gesture-guide')
    tutorial.stepProgress = tutorial.overlay.querySelector('.tutorial-progress')
    tutorial.stepProgressFill = tutorial.overlay.querySelector('.tutorial-progress-fill')
    tutorial.stepProgressLabel = tutorial.overlay.querySelector('.tutorial-progress-label')
    tutorial.stepCount = tutorial.overlay.querySelector('.tutorial-step-count')
    tutorial.stepPhase = tutorial.overlay.querySelector('.tutorial-phase')
    tutorial.nextButton = tutorial.overlay.querySelector('[data-tutorial-action="next"]')
    tutorial.skipButton = tutorial.overlay.querySelector('[data-tutorial-action="skip"]')
    tutorial.skipStepButton = tutorial.overlay.querySelector('[data-tutorial-action="skip-step"]')
    tutorial.backButton = tutorial.overlay.querySelector('[data-tutorial-action="back"]')
    tutorial.minimizeButton = tutorial.overlay.querySelector('[data-tutorial-action="minimize"]')
    tutorial.voiceToggleButton = tutorial.overlay.querySelector('[data-tutorial-action="voice-toggle"]')
    tutorial.docsButton = tutorial.overlay.querySelector('[data-tutorial-action="open-docs"]')
    if (tutorial.minimizeButton) {
      tutorial.minimizeButton.innerHTML = '▬'
      tutorial.minimizeButton.title = 'Minimize tutorial'
      tutorial.minimizeButton.addEventListener('click', () => tutorial.toggleMinimize())
    }
    if (tutorial.voiceToggleButton) {
      tutorial.voiceToggleButton.addEventListener('click', () => tutorial.toggleVoice())
    }
    if (tutorial.backButton) {
      tutorial.backButton.addEventListener('click', () => tutorial.goToPreviousStep())
    }
    if (tutorial.docsButton) {
      tutorial.docsButton.innerHTML = '📖'
      tutorial.docsButton.title = 'Open documentation'
      tutorial.docsButton.addEventListener('click', () => window.openUserDocs?.())
    }
    if (tutorial.dockButton) {
      tutorial.dockButton.addEventListener('click', () => tutorial.toggleMinimize())
      if (!tutorial.settings.showTutorial || tutorial.progress.completed) {
        tutorial.dockButton.classList.add('tutorial-dock--hidden')
        tutorial.dockButton.hidden = true
      }
    }
    setupTutorialDragHandlers(tutorial)
    return
  }

  const overlay = document.createElement('div')
  overlay.id = 'tutorialOverlay'
  overlay.className = 'tutorial-overlay'

  const card = document.createElement('div')
  card.className = 'tutorial-card'

  const header = document.createElement('div')
  header.className = 'tutorial-header'

  const stepCount = document.createElement('span')
  stepCount.className = 'tutorial-step-count'

  const stepPhase = document.createElement('span')
  stepPhase.className = 'tutorial-phase'

  const minimizeButton = document.createElement('button')
  minimizeButton.type = 'button'
  minimizeButton.className = 'tutorial-minimize'
  minimizeButton.innerHTML = '▬'
  minimizeButton.title = 'Minimize tutorial'
  minimizeButton.setAttribute('data-tutorial-action', 'minimize')
  minimizeButton.setAttribute('aria-pressed', 'false')

  const voiceToggleButton = document.createElement('button')
  voiceToggleButton.type = 'button'
  voiceToggleButton.className = 'tutorial-voice-toggle'
  voiceToggleButton.textContent = 'Voice: On'
  voiceToggleButton.setAttribute('data-tutorial-action', 'voice-toggle')
  voiceToggleButton.setAttribute('aria-pressed', 'true')

  const docsButton = document.createElement('button')
  docsButton.type = 'button'
  docsButton.className = 'tutorial-voice-toggle'
  docsButton.innerHTML = '📖'
  docsButton.title = 'Open documentation'
  docsButton.setAttribute('data-tutorial-action', 'open-docs')

  header.appendChild(stepCount)
  header.appendChild(stepPhase)
  header.appendChild(voiceToggleButton)
  header.appendChild(docsButton)
  header.appendChild(minimizeButton)

  const title = document.createElement('h3')
  title.className = 'tutorial-title'

  const text = document.createElement('p')
  text.className = 'tutorial-text'

  const hint = document.createElement('p')
  hint.className = 'tutorial-hint'

  const gestureGuide = document.createElement('div')
  gestureGuide.className = 'tutorial-gesture-guide'
  gestureGuide.hidden = true
  gestureGuide.setAttribute('aria-label', 'Animated sidebar swipe and build stack controls')
  gestureGuide.innerHTML = `
    <div class="tutorial-gesture-guide__sidebar" aria-hidden="true">
      <span class="tutorial-gesture-guide__edge"></span>
      <span class="tutorial-gesture-guide__trail"></span>
      <span class="tutorial-gesture-guide__hand">☝</span>
      <span class="tutorial-gesture-guide__label">SWIPE TO RESIZE</span>
    </div>
    <div class="tutorial-gesture-guide__build" aria-hidden="true">
      <span class="tutorial-gesture-guide__build-title">BUILD</span>
      <span class="tutorial-gesture-guide__build-half tutorial-gesture-guide__build-half--add">＋ ADD</span>
      <span class="tutorial-gesture-guide__build-half tutorial-gesture-guide__build-half--remove">− REMOVE</span>
      <span class="tutorial-gesture-guide__tap"></span>
    </div>`

  const progress = document.createElement('div')
  progress.className = 'tutorial-progress'

  const progressLabel = document.createElement('span')
  progressLabel.className = 'tutorial-progress-label'

  const progressTrack = document.createElement('div')
  progressTrack.className = 'tutorial-progress-track'

  const progressFill = document.createElement('div')
  progressFill.className = 'tutorial-progress-fill'

  progressTrack.appendChild(progressFill)
  progress.appendChild(progressLabel)
  progress.appendChild(progressTrack)

  const actions = document.createElement('div')
  actions.className = 'tutorial-actions'

  const backButton = document.createElement('button')
  backButton.type = 'button'
  backButton.className = 'tutorial-button tutorial-button--ghost'
  backButton.textContent = 'Back'
  backButton.setAttribute('data-tutorial-action', 'back')

  const skipStepButton = document.createElement('button')
  skipStepButton.type = 'button'
  skipStepButton.className = 'tutorial-button tutorial-button--ghost'
  skipStepButton.textContent = 'Skip step'
  skipStepButton.setAttribute('data-tutorial-action', 'skip-step')

  const skipButton = document.createElement('button')
  skipButton.type = 'button'
  skipButton.className = 'tutorial-button tutorial-button--ghost'
  skipButton.textContent = 'Skip tutorial'
  skipButton.setAttribute('data-tutorial-action', 'skip')

  const nextButton = document.createElement('button')
  nextButton.type = 'button'
  nextButton.className = 'tutorial-button tutorial-button--primary'
  nextButton.textContent = 'Continue'
  nextButton.setAttribute('data-tutorial-action', 'next')

  actions.appendChild(backButton)
  actions.appendChild(skipStepButton)
  actions.appendChild(skipButton)
  actions.appendChild(nextButton)

  card.appendChild(header)
  card.appendChild(title)
  card.appendChild(text)
  card.appendChild(gestureGuide)
  card.appendChild(hint)
  card.appendChild(progress)
  card.appendChild(actions)
  overlay.appendChild(card)

  Object.assign(card.style, tutorial.position)

  const dockButton = document.createElement('button')
  dockButton.id = 'tutorialDock'
  dockButton.type = 'button'
  const shouldHide = !tutorial.settings.showTutorial || tutorial.progress.completed
  dockButton.className = shouldHide ? 'tutorial-dock tutorial-dock--hidden' : 'tutorial-dock'
  dockButton.textContent = '?'
  dockButton.hidden = true

  const cursor = document.createElement('div')
  cursor.id = 'tutorialCursor'
  cursor.className = 'tutorial-cursor'
  cursor.hidden = true
  cursor.innerHTML = '<div class="tutorial-cursor-dot"></div>'

  document.body.appendChild(overlay)
  document.body.appendChild(dockButton)
  document.body.appendChild(cursor)

  tutorial.overlay = overlay
  tutorial.cursor = cursor
  tutorial.card = card
  tutorial.dockButton = dockButton
  tutorial.stepTitle = title
  tutorial.stepText = text
  tutorial.stepHint = hint
  tutorial.stepVisual = gestureGuide
  tutorial.stepProgress = progress
  tutorial.stepProgressFill = progressFill
  tutorial.stepProgressLabel = progressLabel
  tutorial.stepCount = stepCount
  tutorial.stepPhase = stepPhase
  tutorial.nextButton = nextButton
  tutorial.skipButton = skipButton
  tutorial.skipStepButton = skipStepButton
  tutorial.backButton = backButton
  tutorial.minimizeButton = minimizeButton
  tutorial.voiceToggleButton = voiceToggleButton
  tutorial.docsButton = docsButton

  nextButton.addEventListener('click', () => tutorial.handleNext())
  skipButton.addEventListener('click', () => tutorial.skipTutorial())
  skipStepButton.addEventListener('click', () => tutorial.skipStep())
  backButton.addEventListener('click', () => tutorial.goToPreviousStep())
  minimizeButton.addEventListener('click', () => tutorial.toggleMinimize())
  voiceToggleButton.addEventListener('click', () => tutorial.toggleVoice())
  docsButton.addEventListener('click', () => window.openUserDocs?.())
  dockButton.addEventListener('click', () => tutorial.toggleMinimize())

  setupTutorialDragHandlers(tutorial)
}

export function setupTutorialDragHandlers(tutorial) {
  if (!tutorial.card) return

  let isDragging = false
  let dragStartX = 0
  let dragStartY = 0
  let initialLeft = 0
  let initialTop = 0

  const startDrag = (clientX, clientY) => {
    isDragging = true
    dragStartX = clientX
    dragStartY = clientY
    const rect = tutorial.card.getBoundingClientRect()
    initialLeft = rect.left
    initialTop = rect.top
    tutorial.card.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  const moveDrag = (clientX, clientY) => {
    if (!isDragging) return
    const deltaX = clientX - dragStartX
    const deltaY = clientY - dragStartY
    const newLeft = Math.max(0, Math.min(window.innerWidth - tutorial.card.offsetWidth, initialLeft + deltaX))
    const newTop = Math.max(0, Math.min(window.innerHeight - tutorial.card.offsetHeight, initialTop + deltaY))
    tutorial.card.style.left = `${newLeft}px`
    tutorial.card.style.top = `${newTop}px`
    tutorial.card.style.bottom = 'auto'
    tutorial.card.style.right = 'auto'
  }

  const endDrag = () => {
    if (!isDragging) return
    isDragging = false
    tutorial.card.style.cursor = 'move'
    document.body.style.userSelect = ''
    tutorial.position = {
      left: tutorial.card.style.left,
      top: tutorial.card.style.top,
      bottom: tutorial.card.style.bottom,
      right: tutorial.card.style.right
    }
    writeToStorage(TUTORIAL_POSITION_KEY, tutorial.position)
  }

  tutorial.card.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return
    e.preventDefault()
    startDrag(e.clientX, e.clientY)
  })

  document.addEventListener('mousemove', (e) => {
    moveDrag(e.clientX, e.clientY)
  })

  document.addEventListener('mouseup', endDrag)

  tutorial.card.addEventListener('touchstart', (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return
    e.preventDefault()
    const touch = e.touches[0]
    startDrag(touch.clientX, touch.clientY)
  }, { passive: false })

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return
    e.preventDefault()
    const touch = e.touches[0]
    moveDrag(touch.clientX, touch.clientY)
  }, { passive: false })

  document.addEventListener('touchend', endDrag)
}
