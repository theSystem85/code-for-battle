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
  findBuildLocation,
  findPlayerBuilding,
  getBoundingCenter,
  getIsTouchLayout,
  getHintForDevice,
  getSpokenTextForStep,
  getTextForDevice,
  resolveTutorialInputMethod,
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
import { tutorialGuidance } from './tutorialSystem/guidance.js'
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
        if (!this.active) return
        if (this.steps[this.stepIndex]?.id === 'settings-help' && settingsModal.getAttribute('aria-hidden') === 'false') {
          this.stepState.settingsOpened = true
          if (settingsModal.querySelector('[data-config-tab="keybindings"][aria-selected="true"]')) this.stepState.keybindingsOpened = true
        }
        if (settingsModal.getAttribute('aria-hidden') === 'true') this.renderStep(this.steps[this.stepIndex])
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
      const begin = () => setTimeout(() => { if (!this.active) this.start({ resume: true }) }, 600)
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
      if (this.active && this.steps[this.stepIndex]?.id === 'settings-help') {
        if (target.closest('#helpBtn')) this.stepState.settingsOpened = true
        if (target.closest('[data-config-tab="keybindings"]')) this.stepState.keybindingsOpened = true
        if (target.closest('#userDocsBtn, [data-tutorial-action="open-docs"]')) this.stepState.manualOpened = true
      }
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
    this.stepGeneration += 1
    this.clearGuidance()
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

  async skipStep() {
    if (!this.active || this.skipping) return
    this.skipping = true
    if (this.skipStepButton) this.skipStepButton.disabled = true
    const generation = ++this.stepGeneration
    this.stopSpeech()
    try {
      await this.fulfillSkippedStep(this.steps[this.stepIndex])
      if (this.active && generation === this.stepGeneration) this.advanceStep()
    } finally {
      this.skipping = false
      if (this.skipStepButton) this.skipStepButton.disabled = false
    }
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
    if (this.speaking || this.phase === 'demo' || (step?.completion && !this.stepState.completed && !step.completion(this))) {
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
    this.stopSpeech()
    this.clearGuidance()
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
      startRallyPoint: findPlayerBuilding('vehicleFactory')?.rallyPoint ? { ...findPlayerBuilding('vehicleFactory').rallyPoint } : null,
      moveTargets: new Map((gameState.units || []).map(unit => [unit.id, unit.moveTarget ? { ...unit.moveTarget } : null]))
    }

    this.renderStep(step)
    if (step.interactive) {
      this.speak(getSpokenTextForStep(step, this.getInputMethod()))
      this.awaitCompletion(step)
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

    this.renderStepExtras(step)
    this.updateContinueState(step)
    if (this.backButton) {
      this.backButton.disabled = this.stepIndex === 0
    }

    this.clearHighlight()
    if (step.highlightSelector) {
      const selector = step.id === 'crew-system' && countPlayerBuildings('hospital') > 0
        ? '.production-button[data-unit-type="ambulance"]' : step.highlightSelector
      const element = document.querySelector(selector)
      if (element) {
        if (element.classList.contains('production-button') && !element.querySelector('.production-ready-glow')) {
          const glow = document.createElement('span')
          glow.className = 'production-ready-glow'
          glow.setAttribute('aria-hidden', 'true')
          element.append(glow)
        }
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
    if (this.phase === 'demo' || this.speaking) {
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
    const tank = (gameState.units || []).find(unit => unit.id === this.stepState.crewTankId)
    const roles = ['driver', 'commander', 'gunner', 'loader']
    return Boolean(this.stepState.crewPrepared && tank?.health > 0 && roles.every(role => tank.crew?.[role] === true))
  }

  runDemo(step) {
    const generation = this.stepGeneration
    this.phase = 'practice'
    this.renderStep(step)
    this.speak(getSpokenTextForStep(step, this.getInputMethod()))
    // Guidance only moves the overlay. It runs alongside task/narration checks.
    Promise.resolve(step.demo?.(this)).catch(error => {
      if (generation === this.stepGeneration) console.warn('Tutorial guidance unavailable', error)
    })
    this.awaitCompletion(step)
  }

  awaitCompletion(step) {
    const generation = this.stepGeneration
    let lastCheck = -Infinity
    const check = (now = performance.now()) => {
      if (!this.active || generation !== this.stepGeneration || this.steps[this.stepIndex] !== step) return
      // One tutorial poll, at most ten times per second, independent of the
      // entity render loop. Marker work is bounded to one unit and DOM node.
      if (now - lastCheck >= 100) {
        lastCheck = now
        if (this.hasNewMoveOrder('tank')) this.stepState.tankMoved = true
        if (step.id === 'crew-system') this.updateCrewMarker()
        const done = this.stepState.completed || !step.completion || step.completion(this)
        if (done) this.markStepCompleted()
        this.updateContinueState(step)
        this.updateStepProgress(step)
        this.updateStepExtras(step)
        if (done && !this.speaking && !step.interactive) {
          this.advanceStep()
          return
        }
      }
      this.animationFrame = requestAnimationFrame(check)
    }
    this.animationFrame = requestAnimationFrame(check)
  }

  moveCursorToPoint(point) {
    if (!this.cursor || !point) return
    this.cursor.removeAttribute('data-instruction')
    this.cursor.style.left = `${point.x}px`
    this.cursor.style.top = `${point.y}px`
  }

  async moveCursorToElement(element) {
    if (!element) return
    const point = getBoundingCenter(element)
    this.moveCursorToPoint(point)
    await sleep(1167)
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
        onEnd: () => { this.speaking = false; this.updateContinueState(this.steps[this.stepIndex]) }
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
    if (!text || typeof SpeechSynthesisUtterance === 'undefined' || !window.speechSynthesis?.speak) {
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
    utterance.onend = utterance.onerror = () => {
      if (this.ttsUtterance !== utterance) return
      this.speaking = false
      this.updateContinueState(this.steps[this.stepIndex])
    }
    this.ttsUtterance = utterance
    window.speechSynthesis?.speak?.(utterance)
  }

  stopSpeech() {
    this.ttsUtterance = null
    this.narrator?.stop()
    if (this.speaking) {
      window.speechSynthesis?.cancel?.()
      this.speaking = false
    }
  }

  async demoBuildBuilding(type) {
    if (!this.skipping) return this.guideBuilding(type)
    const placement = findBuildLocation(type)
    if (!placement) return
    const generation = this.stepGeneration
    const { constructPlayerBuilding } = await import('../game/playerBuildingLifecycle.js')
    if (!this.active || generation !== this.stepGeneration) return
    constructPlayerBuilding(type, placement.x, placement.y, gameState, gameState.mapGrid, productionQueue.productionController)
    gameState.money = Math.max(0, gameState.money - (buildingData[type]?.cost || 0))
  }

  async demoBuildUnit(type) {
    if (!this.skipping) return this.guideUnitBuild(type)
    const factory = findPlayerBuilding('vehicleFactory')
    if (!factory) return
    const generation = this.stepGeneration
    const { spawnUnit } = await import('../units.js')
    if (!this.active || generation !== this.stepGeneration) return
    const unit = spawnUnit(factory, type, gameState.units, gameState.mapGrid, factory.rallyPoint, gameState.occupancyMap)
    if (unit) {
      gameState.units.push(unit)
      gameState.money = Math.max(0, gameState.money - (unitCosts[type] || 0))
    }
  }


}

Object.assign(TutorialSystem.prototype, tutorialGuidance)

export function initTutorialSystem() {
  if (typeof document === 'undefined') return null
  const tutorial = new TutorialSystem()
  tutorial.init()
  window.tutorialSystem = tutorial
  return tutorial
}
