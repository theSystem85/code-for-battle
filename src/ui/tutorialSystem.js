import { gameState } from '../gameState.js'
import { STORY_INTRO_CLOSED_EVENT, isStoryIntroOpen } from '../story/storyIntro.js'
import { productionQueue } from '../productionQueue.js'
import { buildingData } from '../buildings.js'
import { selectedUnits } from '../inputHandler.js'
import { unitCosts } from '../units.js'
import { clearRemoteControlSource } from '../input/remoteControlState.js'
import { buildTutorialSteps } from './tutorialSystem/steps.js'
import { isInputMethod } from './inputMethodGuide.js'
import { migrateTutorialProgress, TUTORIAL_PROGRESS_VERSION } from './tutorialSystem/progress.js'
import { createTutorialUI, setTutorialTooltip } from './tutorialSystem/ui.js'
import {
  countPlayerBuildings,
  countPlayerUnits,
  dispatchCanvasClick,
  dispatchCanvasDrag,
  dispatchClick,
  findBuildLocation,
  findPlayerBuilding,
  getBoundingCenter,
  getCanvasPointForTile,
  getIsTouchLayout,
  getHintForDevice,
  getPlayerCrewSnapshot,
  getSpokenTextForStep,
  getTextForDevice,
  resolveTutorialInputMethod,
  getUnitTile,
  sleep
} from './tutorialSystem/helpers.js'
import {
  DEFAULT_PROGRESS,
  DEFAULT_SETTINGS,
  TUTORIAL_POSITION_KEY,
  TUTORIAL_PROGRESS_KEY,
  TUTORIAL_REMOTE_SOURCE,
  TUTORIAL_SETTINGS_KEY
} from './tutorialSystem/constants.js'
import { readFromStorage, writeToStorage } from './tutorialSystem/storage.js'
import { isHeadlessAudioMuted } from '../utils/headlessAudioMute.js'
import { createTutorialNarrator } from './tutorialSystem/narration.js'
import { getEffectsVolume, routeNarrationElement, setMusicDuck } from '../sound.js'
import { configureAudioElement } from '../pwa/audioElementPolicy.js'

class TutorialSystem {
  constructor() {
    this.settings = { ...readFromStorage(TUTORIAL_SETTINGS_KEY, DEFAULT_SETTINGS) }
    const allSteps = buildTutorialSteps()
    this.steps = allSteps.filter(step => !step.mobileOnly || getIsTouchLayout())
    this.progress = migrateTutorialProgress(readFromStorage(TUTORIAL_PROGRESS_KEY, null), this.steps, allSteps)
    if (!isInputMethod(this.settings.preferredInputMethod)) this.settings.preferredInputMethod = null
    if (!this.progress.completed && !this.settings.preferredInputMethod && this.progress.stepId !== 'input-method') {
      this.progress.resumeAfterInputStepId = this.progress.stepId
      this.progress.stepId = 'input-method'
      this.progress.stepIndex = 0
    }
    this.position = readFromStorage(TUTORIAL_POSITION_KEY, this.getDefaultPosition())
    this.active = false
    this.phase = 'demo'
    this.stepIndex = this.progress.stepIndex || 0
    this.saveProgress()
    this.overlay = null
    this.cursor = null
    this.card = null
    this.dockButton = null
    this.stepTitle = null
    this.stepText = null
    this.stepHint = null
    this.stepVisual = null
    this.stepCount = null
    this.stepPhase = null
    this.nextButton = null
    this.skipButton = null
    this.skipStepButton = null
    this.backButton = null
    this.minimizeButton = null
    this.voiceToggleButton = null
    this.highlighted = null
    this.lastAction = null
    this.stepState = {}
    this.animationFrame = null
    this.speaking = false
    this.minimized = false
    this.stepGeneration = 0
    this.isInviteSession = false

    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search || '')
        this.isInviteSession = Boolean(params.get('invite'))
      } catch {
        this.isInviteSession = false
      }
    }
  }

  saveProgress() {
    this.progress.version = TUTORIAL_PROGRESS_VERSION
    this.progress.stepId = this.steps[this.stepIndex]?.id || null
    writeToStorage(TUTORIAL_PROGRESS_KEY, this.progress)
  }

  chooseInputMethod(method) {
    if (!isInputMethod(method)) return
    this.settings.preferredInputMethod = method
    writeToStorage(TUTORIAL_SETTINGS_KEY, this.settings)
    this.inputGuide?.update(method)
    const step = this.steps[this.stepIndex]
    if (step?.id === 'input-method') this.markStepCompleted()
    this.updateContinueState(step)
  }

  getDefaultPosition() {
    const isMobilePortrait = document?.body?.classList?.contains('mobile-portrait')
    return isMobilePortrait
      ? {
        left: '0px',
        top: '0px',
        bottom: 'auto',
        right: 'auto'
      }
      : {
        left: 'calc(var(--sidebar-width) + 20px)',
        top: 'auto',
        bottom: '20px',
        right: 'auto'
      }
  }

  updatePosition() {
    this.syncVisibility()
    const newPosition = this.getDefaultPosition()
    // Only update if the position actually changed
    if (JSON.stringify(this.position) !== JSON.stringify(newPosition)) {
      this.position = newPosition
      writeToStorage(TUTORIAL_POSITION_KEY, this.position)
      if (this.card) {
        Object.assign(this.card.style, this.position)
      }
    }
  }

  init() {
    createTutorialUI(this)
    this.bindSettingsControls()
    this.bindActionTracking()
    this.bindLayoutChangeListeners()
    const settingsModal = document.getElementById('configSettingsModal')
    if (settingsModal) {
      this.settingsObserver = new window.MutationObserver(() => {
        if (this.active && settingsModal.getAttribute('aria-hidden') === 'true') this.renderStep(this.steps[this.stepIndex])
      })
      this.settingsObserver.observe(settingsModal, { attributes: true, attributeFilter: ['aria-hidden'] })
    }

    if (this.isInviteSession) {
      this.settings.showTutorial = false
      this.progress.completed = true
      this.hideUI()
      return
    }

    // Only start tutorial if enabled and not completed
    if (this.settings.showTutorial && !this.progress.completed) {
      const begin = () => setTimeout(() => this.start({ resume: true }), 600)
      // Never talk over the story intro narration: start once it closes.
      if (isStoryIntroOpen()) window.addEventListener(STORY_INTRO_CLOSED_EVENT, begin, { once: true })
      else begin()
    } else {
      // Ensure overlay is hidden when tutorial is completed or disabled
      this.hideUI()
    }
  }

  bindLayoutChangeListeners() {
    // Listen for mobile layout changes
    document.addEventListener('mobile-landscape-layout-changed', () => {
      this.updatePosition()
    })

    // Also listen for orientation changes directly
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.updatePosition(), 100)
    })

    // And resize events
    window.addEventListener('resize', () => {
      this.updatePosition()
    })
  }


  bindSettingsControls() {
    const showToggle = document.getElementById('tutorialShowOnStartup')
    const speechToggle = document.getElementById('tutorialSpeechEnabled')
    const startButton = document.getElementById('tutorialStartBtn')
    const restartButton = document.getElementById('tutorialRestartBtn')

    if (showToggle) {
      showToggle.checked = this.settings.showTutorial
      showToggle.addEventListener('change', () => {
        this.settings.showTutorial = Boolean(showToggle.checked)
        writeToStorage(TUTORIAL_SETTINGS_KEY, this.settings)
        if (!this.settings.showTutorial) {
          this.stop()
        }
        this.syncVisibility()
        if (startButton) {
          startButton.disabled = !this.settings.showTutorial
        }
        if (restartButton) {
          restartButton.disabled = !this.settings.showTutorial
        }
      })
    }

    if (speechToggle) {
      speechToggle.checked = this.settings.speechEnabled
      speechToggle.addEventListener('change', () => {
        this.settings.speechEnabled = Boolean(speechToggle.checked)
        if (!this.settings.speechEnabled) {
          this.stopSpeech()
        }
        writeToStorage(TUTORIAL_SETTINGS_KEY, this.settings)
      })
    }

    const voiceSelect = document.getElementById('tutorialVoiceSelect')
    if (voiceSelect) {
      // Populate voices - filter to English only
      const populateVoices = () => {
        const allVoices = window.speechSynthesis?.getVoices?.() || []
        const englishVoices = allVoices.filter(voice => voice.lang.startsWith('en'))
        voiceSelect.innerHTML = '<option value="">Browser Default</option>'

        // Auto-select preferred voice if no voice is stored
        if (this.settings.selectedVoice === null || this.settings.selectedVoice === undefined) {
          // Priority 1: Google US English (en-US)
          let preferredVoice = allVoices.findIndex(v =>
            v.name.toLowerCase().includes('google') &&
            v.name.toLowerCase().includes('us') &&
            v.lang.toLowerCase().startsWith('en-us')
          )

          // Priority 2: Any Google English voice
          if (preferredVoice === -1) {
            preferredVoice = allVoices.findIndex(v =>
              v.name.toLowerCase().includes('google') &&
              v.lang.toLowerCase().startsWith('en')
            )
          }

          // Priority 3: Any available English voice
          if (preferredVoice === -1 && englishVoices.length > 0) {
            preferredVoice = allVoices.indexOf(englishVoices[0])
          }

          // Store the auto-selected voice
          if (preferredVoice !== -1) {
            this.settings.selectedVoice = preferredVoice
            writeToStorage(TUTORIAL_SETTINGS_KEY, this.settings)
          }
        }

        englishVoices.forEach((voice) => {
          // Find original index in full voices array for proper selection
          const originalIndex = allVoices.indexOf(voice)
          const option = document.createElement('option')
          option.value = originalIndex
          option.textContent = `${voice.name} (${voice.lang})`
          if (this.settings.selectedVoice === originalIndex) {
            option.selected = true
          }
          voiceSelect.appendChild(option)
        })
      }

      // Voices may load asynchronously
      if (window.speechSynthesis) {
        populateVoices()
        window.speechSynthesis.onvoiceschanged = populateVoices
      }

      voiceSelect.addEventListener('change', () => {
        const value = voiceSelect.value
        this.settings.selectedVoice = value === '' ? null : parseInt(value, 10)
        writeToStorage(TUTORIAL_SETTINGS_KEY, this.settings)
      })
    }

    if (startButton) {
      startButton.disabled = !this.settings.showTutorial
      startButton.addEventListener('click', () => {
        this.start({ reset: false, manual: true })
      })
    }

    if (restartButton) {
      restartButton.disabled = !this.settings.showTutorial
      restartButton.addEventListener('click', () => {
        this.start({ reset: true, manual: true })
      })
    }
  }

  bindActionTracking() {
    document.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof Element)) return

      if (target.closest('#moneyBarContainer') || target.closest('#mobileMoneyDisplay')) {
        this.lastAction = 'money'
      }
      if (target.closest('#energyBarContainer') || target.closest('#mobileEnergyBarContainer')) {
        this.lastAction = 'energy'
      }

      const productionButton = target.closest('.production-button')
      if (productionButton) {
        const buildingType = productionButton.getAttribute('data-building-type')
        const unitType = productionButton.getAttribute('data-unit-type')
        if (buildingType) {
          this.lastAction = `building:${buildingType}`
        }
        if (unitType) {
          this.lastAction = `unit:${unitType}`
        }
      }
    })
  }

  start({ reset = false, resume = false, manual = false } = {}) {
    if (!this.settings.showTutorial) {
      this.stop()
      return
    }

    // Don't allow starting if completed (unless reset or manual restart)
    if (this.progress.completed && !reset && !manual) {
      this.hideUI()
      return
    }

    if (reset || (manual && this.progress.completed)) {
      this.progress = { ...DEFAULT_PROGRESS }
      this.stepIndex = 0
      this.progress.completed = false
      this.saveProgress()
    } else if (resume) {
      this.stepIndex = this.progress.stepIndex || 0
    }

    // Validate step exists before showing UI
    const step = this.steps[this.stepIndex]
    if (!step || !step.title) {
      this.stop()
      return
    }

    this.active = true
    this.showUI()
    this.runCurrentStep()
  }

  // The only writer of overlay/dock visibility. CSS must honor [hidden].
  syncVisibility() {
    const enabled = this.active && this.settings.showTutorial && !this.progress.completed && !this.isInviteSession
    if (this.overlay) {
      this.overlay.hidden = !enabled || this.minimized
      this.overlay.classList.toggle('tutorial-overlay--minimized', enabled && this.minimized)
    }
    if (this.dockButton) {
      this.dockButton.hidden = !enabled || !this.minimized
      // Remove the legacy visibility flag when reusing an existing UI.
      this.dockButton.classList.remove('tutorial-dock--hidden')
    }
    this.syncCursorVisibility()
  }

  showUI() {
    this.minimized = false
    this.syncVisibility()
  }

  hideUI() {
    this.active = false
    this.minimized = false
    this.syncVisibility()
  }

  stop() {
    this.active = false
    this.phase = 'demo'
    this.minimized = false
    this.clearHighlight()
    this.hideUI()
    this.stopSpeech()
    clearRemoteControlSource(TUTORIAL_REMOTE_SOURCE)
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }

  skipTutorial() {
    this.settings.showTutorial = false
    writeToStorage(TUTORIAL_SETTINGS_KEY, this.settings)
    const showToggle = document.getElementById('tutorialShowOnStartup')
    if (showToggle) {
      showToggle.checked = false
    }
    const startButton = document.getElementById('tutorialStartBtn')
    if (startButton) {
      startButton.disabled = true
    }
    const restartButton = document.getElementById('tutorialRestartBtn')
    if (restartButton) {
      restartButton.disabled = true
    }
    this.progress.completed = true
    this.progress.stepIndex = this.steps.length
    this.saveProgress()
    this.stop()
  }

  skipStep() {
    this.advanceStep()
  }

  goToPreviousStep() {
    if (this.stepIndex <= 0) return
    this.stepIndex -= 1
    this.progress.stepIndex = this.stepIndex
    this.saveProgress()
    this.runCurrentStep()
  }

  handleNext() {
    if (!this.active) return
    const step = this.steps[this.stepIndex]
    if (step && step.completion && !step.completion(this)) {
      return
    }
    this.advanceStep()
  }

  advanceStep() {
    const resumeIndex = this.steps[this.stepIndex]?.id === 'input-method'
      ? this.steps.findIndex(step => step.id === this.progress.resumeAfterInputStepId)
      : -1
    if (resumeIndex > 0) {
      this.stepIndex = resumeIndex
      delete this.progress.resumeAfterInputStepId
    } else this.stepIndex += 1
    this.progress.stepIndex = this.stepIndex
    if (this.stepIndex >= this.steps.length) {
      this.progress.completed = true
      this.saveProgress()
      this.stop()
      this.speak('Great, you completed the basic tutorial!', 'tutorial-complete')
      return
    }
    this.saveProgress()
    this.runCurrentStep()
  }

  runCurrentStep() {
    if (!this.active) return
    const step = this.steps[this.stepIndex]
    // Never show empty tutorial - stop if no valid step
    if (!step || !step.title) {
      this.stop()
      return
    }

    this.stepGeneration += 1
    if (this.animationFrame) { cancelAnimationFrame(this.animationFrame); this.animationFrame = null }
    this.phase = step.interactive ? 'practice' : 'demo'
    this.lastAction = null
    this.stepState = {
      action: null,
      resourceClicked: new Set(),
      selectionSeen: false,
      completed: false,
      startSelectedCount: selectedUnits.length,
      startPowerPlants: countPlayerBuildings('powerPlant'),
      startRefineries: countPlayerBuildings('oreRefinery'),
      startFactories: countPlayerBuildings('vehicleFactory'),
      startHarvesters: countPlayerUnits('harvester'),
      startTanks: countPlayerUnits('tank'),
      startRallyPoint: findPlayerBuilding('vehicleFactory')?.rallyPoint || null,
      moveTargets: new Map((gameState.units || []).map(unit => [unit.id, unit.moveTarget ? { ...unit.moveTarget } : null]))
    }

    this.renderStep(step)
    if (step.interactive) {
      this.speak(getSpokenTextForStep(step, this.getInputMethod()))
      return
    }
    this.runDemo(step)
  }

  // Effective method for copy and narration (preference, else current layout).
  getInputMethod() {
    return resolveTutorialInputMethod(this.settings.preferredInputMethod)
  }

  renderStep(step) {
    if (this.stepTitle) {
      this.stepTitle.textContent = step.title
    }
    if (this.stepText) {
      this.stepText.textContent = [getTextForDevice(step, this.getInputMethod()), step.additionalGuidance].filter(Boolean).join(' ')
    }
    if (this.stepHint) {
      this.stepHint.textContent = getHintForDevice(step, this.getInputMethod())
    }
    if (this.stepVisual) {
      this.stepVisual.hidden = step.visual !== 'mobile-build-gestures'
    }
    if (this.inputGuide) {
      this.inputGuide.element.hidden = step.id !== 'input-method'
      if (step.id === 'input-method') this.inputGuide.update(this.settings.preferredInputMethod)
    }
    this.card?.classList.toggle('tutorial-card--input-guide', step.id === 'input-method')
    this.syncCursorVisibility()
    this.updateStepProgress(step)
    if (this.stepCount) {
      this.stepCount.textContent = `Step ${this.stepIndex + 1} of ${this.steps.length}`
    }
    if (this.stepPhase) {
      this.stepPhase.textContent = step.interactive ? 'Controls' : this.phase === 'demo' ? 'Demo' : 'Your turn'
    }
    if (this.minimizeButton) {
      this.minimizeButton.innerHTML = this.minimized ? '▴' : '▬'
      setTutorialTooltip(this.minimizeButton, this.minimized ? 'Expand tutorial' : 'Minimize tutorial')
      this.minimizeButton.setAttribute('aria-pressed', this.minimized ? 'true' : 'false')
    }
    if (this.voiceToggleButton) {
      this.voiceToggleButton.textContent = `Voice: ${this.settings.speechEnabled ? 'On' : 'Off'}`
      this.voiceToggleButton.setAttribute('aria-pressed', this.settings.speechEnabled ? 'true' : 'false')
    }

    this.updateContinueState(step)
    if (this.backButton) {
      this.backButton.disabled = this.stepIndex === 0
    }

    this.clearHighlight()
    if (step.highlightSelector) {
      const element = document.querySelector(step.highlightSelector)
      if (element) {
        element.classList.add('tutorial-highlight')
        this.highlighted = element
      }
    }
  }

  setContinueEnabled() {
    this.markStepCompleted()
    this.updateContinueState(this.steps[this.stepIndex])
  }

  toggleMinimize() {
    if (!this.active || !this.settings.showTutorial || this.progress.completed) {
      this.syncVisibility()
      return
    }
    this.minimized = !this.minimized
    this.syncVisibility()
    this.renderStep(this.steps[this.stepIndex])
  }

  syncCursorVisibility() {
    if (!this.cursor) return
    this.cursor.hidden = !this.active || !this.settings.showTutorial || this.progress.completed || this.minimized || this.steps[this.stepIndex]?.interactive === true
  }

  updateContinueState(step) {
    if (!this.nextButton) return
    if (this.phase === 'demo') {
      this.nextButton.disabled = true
      return
    }

    if (!step.completion) {
      this.nextButton.disabled = false
      return
    }

    const satisfied = this.stepState.completed || step.completion(this)
    this.nextButton.disabled = !satisfied
  }

  markStepCompleted() {
    if (this.stepState.completed) return
    this.stepState.completed = true
    if (this.nextButton) {
      this.nextButton.classList.remove('tutorial-continue--ready')
      void this.nextButton.offsetWidth
      this.nextButton.classList.add('tutorial-continue--ready')
      setTimeout(() => {
        this.nextButton?.classList.remove('tutorial-continue--ready')
      }, 1200)
    }
  }

  toggleVoice() {
    this.settings.speechEnabled = !this.settings.speechEnabled
    if (!this.settings.speechEnabled) {
      this.stopSpeech()
    }
    writeToStorage(TUTORIAL_SETTINGS_KEY, this.settings)
    this.renderStep(this.steps[this.stepIndex])
  }

  clearHighlight() {
    if (this.highlighted) {
      this.highlighted.classList.remove('tutorial-highlight')
      this.highlighted = null
    }
  }

  updateStepProgress(step) {
    if (!this.stepProgress || !this.stepProgressFill || !this.stepProgressLabel) return
    if (!step?.progress) {
      this.stepProgress.hidden = true
      return
    }
    const value = Math.max(0, Math.min(1, step.progress(this)))
    this.stepProgress.hidden = false
    this.stepProgressFill.style.width = `${Math.round(value * 100)}%`
    this.stepProgressLabel.textContent = step.progressLabel || 'Progress'
  }

  trackCrewRestoration() {
    if (this.stepState.crewRestored) return true
    if (!this.stepState.crewSnapshot) {
      this.stepState.crewSnapshot = getPlayerCrewSnapshot()
      return false
    }
    const current = getPlayerCrewSnapshot()
    let restored = false
    current.forEach((crew, unitId) => {
      const previous = this.stepState.crewSnapshot.get(unitId)
      if (!previous) return
      Object.keys(crew).some(role => {
        if (previous[role] === false && crew[role] === true) {
          restored = true
          return true
        }
        return false
      })
    })
    this.stepState.crewSnapshot = current
    if (restored) {
      this.stepState.crewRestored = true
      if (!this.stepState.crewRestoredAnnounced) {
        this.stepState.crewRestoredAnnounced = true
        this.speak('Great, you completed all sub tasks of the crew system tutorial!', 'crew-complete')
      }
    }
    return this.stepState.crewRestored
  }

  async runDemo(step) {
    const generation = this.stepGeneration
    this.stopSpeech()
    if (step.demo) {
      await step.demo(this)
    }
    if (!this.active || generation !== this.stepGeneration || this.steps[this.stepIndex] !== step) return
    this.phase = 'practice'
    this.renderStep(step)
    this.speak(getSpokenTextForStep(step, this.getInputMethod()))
    this.awaitCompletion(step)
  }

  awaitCompletion(step) {
    if (!step.completion) {
      if (this.nextButton) {
        this.nextButton.disabled = false
      }
      return
    }

    const check = () => {
      if (!this.active) return
      const done = this.stepState.completed || step.completion(this)
      this.updateContinueState(step)
      this.updateStepProgress(step)
      if (done) {
        this.markStepCompleted()
        return
      }
      this.animationFrame = requestAnimationFrame(check)
    }
    this.animationFrame = requestAnimationFrame(check)
  }

  moveCursorToPoint(point) {
    if (!this.cursor || !point) return
    this.cursor.style.left = `${point.x}px`
    this.cursor.style.top = `${point.y}px`
  }

  async moveCursorToElement(element) {
    if (!element) return
    const point = getBoundingCenter(element)
    this.moveCursorToPoint(point)
    await sleep(350)
  }

  async clickElement(element) {
    if (!element) return
    await this.moveCursorToElement(element)
    this.cursor?.classList.add('tutorial-cursor--click')
    dispatchClick(element)
    await sleep(250)
    this.cursor?.classList.remove('tutorial-cursor--click')
  }

  async clickCanvasTile(tile) {
    if (!tile) return
    const point = getCanvasPointForTile(tile.x, tile.y)
    if (!point) return
    this.moveCursorToPoint(point)
    await sleep(250)
    this.cursor?.classList.add('tutorial-cursor--click')
    dispatchCanvasClick(point)
    await sleep(250)
    this.cursor?.classList.remove('tutorial-cursor--click')
  }

  getNarrator() {
    if (!this.narrator) {
      this.narrator = createTutorialNarrator({
        createAudio: src => {
          const audio = new Audio(src)
          configureAudioElement(audio, src, window.location.origin)
          return audio
        },
        getVolume: () => getEffectsVolume(),
        routeVoice: (audio, relative) => routeNarrationElement(audio, relative),
        setDuck: factor => setMusicDuck(factor),
        speakTts: text => this.speakWithTts(text),
        cancelTts: () => window.speechSynthesis?.cancel?.(),
        onEnd: () => { this.speaking = false }
      })
    }
    return this.narrator
  }

  // Recorded narrator clip first (same voice as the story intro), browser TTS
  // when no clip matches the exact text, it fails to load, or the page
  // language is not English.
  speak(text, stepId = this.steps?.[this.stepIndex]?.id) {
    if (!this.settings.speechEnabled) return
    if (isHeadlessAudioMuted()) return
    if (!text) return
    this.speaking = true
    const lang = typeof document !== 'undefined' ? document.documentElement?.lang : 'en'
    this.getNarrator().speak(stepId, text, { lang })
  }

  speakWithTts(text) {
    if (!text || typeof SpeechSynthesisUtterance === 'undefined') {
      this.speaking = false
      return
    }
    window.speechSynthesis?.cancel?.()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'

    // Apply selected voice if configured
    if (this.settings.selectedVoice !== null && this.settings.selectedVoice !== undefined) {
      const voices = window.speechSynthesis?.getVoices?.() || []
      if (voices[this.settings.selectedVoice]) {
        utterance.voice = voices[this.settings.selectedVoice]
      }
    }

    this.speaking = true
    utterance.onend = () => {
      this.speaking = false
    }
    window.speechSynthesis?.speak?.(utterance)
  }

  stopSpeech() {
    this.narrator?.stop()
    if (this.speaking) {
      window.speechSynthesis?.cancel?.()
      this.speaking = false
    }
  }

  async demoBuildBuilding(type) {
    const buildingTab = document.querySelector('.tab-button[data-tab="buildings"]')
    if (buildingTab) {
      await this.clickElement(buildingTab)
    }
    const button = document.querySelector(`.production-button[data-building-type="${type}"]`)
    if (!button) return
    await this.clickElement(button)

    const placement = findBuildLocation(type)
    if (!placement) return
    const blueprint = { type, x: placement.x, y: placement.y }
    const queued = productionQueue.buildingItems.find(item => item.type === type && !item.blueprint)
    if (queued) {
      queued.blueprint = blueprint
    } else {
      productionQueue.addItem(type, button, true, blueprint)
    }
    if (productionQueue.currentBuilding && productionQueue.currentBuilding.type === type) {
      productionQueue.currentBuilding.blueprint = blueprint
    }
    const cost = buildingData[type]?.cost || 0
    if (cost) {
      gameState.money = Math.max(0, gameState.money - cost)
    }
    productionQueue.completeCurrentBuildingProduction()

    await this.clickCanvasTile(placement)
  }

  async demoBuildUnit(type) {
    const unitTab = document.querySelector('.tab-button[data-tab="units"]')
    if (unitTab) {
      await this.clickElement(unitTab)
    }
    const button = document.querySelector(`.production-button[data-unit-type="${type}"]`)
    if (!button) return
    await this.clickElement(button)

    if (!productionQueue.currentUnit || productionQueue.currentUnit.type !== type) {
      productionQueue.addItem(type, button, false)
    }
    const unitCost = unitCosts?.[type] || 0
    if (unitCost) {
      gameState.money = Math.max(0, gameState.money - unitCost)
    }
    productionQueue.completeCurrentUnitProduction()
  }

  async demoSelectUnit(unit) {
    const tile = getUnitTile(unit)
    if (!tile) return
    await this.clickCanvasTile(tile)
  }

  async demoSelectGroup(units) {
    if (!units || units.length === 0) return
    const tiles = units.map(unit => getUnitTile(unit)).filter(Boolean)
    if (tiles.length === 0) return
    const minX = Math.min(...tiles.map(t => t.x))
    const minY = Math.min(...tiles.map(t => t.y))
    const maxX = Math.max(...tiles.map(t => t.x))
    const maxY = Math.max(...tiles.map(t => t.y))
    const start = getCanvasPointForTile(minX, minY)
    const end = getCanvasPointForTile(maxX + 1, maxY + 1)
    this.moveCursorToPoint(start)
    await sleep(200)
    dispatchCanvasDrag(start, end)
    await sleep(200)
  }

  async demoDeselect() {
    const tile = findBuildLocation('powerPlant') || { x: 1, y: 1 }
    const point = getCanvasPointForTile(tile.x, tile.y)
    if (!point) return
    this.moveCursorToPoint(point)
    await sleep(150)
    dispatchCanvasClick(point, { button: 2 })
  }


}

export function initTutorialSystem() {
  if (typeof document === 'undefined') return null
  const tutorial = new TutorialSystem()
  tutorial.init()
  window.tutorialSystem = tutorial
  return tutorial
}
