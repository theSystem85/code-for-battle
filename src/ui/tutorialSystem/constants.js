export const TUTORIAL_SETTINGS_KEY = 'rts_tutorial_settings'
export const TUTORIAL_PROGRESS_KEY = 'rts_tutorial_progress'
export const TUTORIAL_POSITION_KEY = 'rts_tutorial_position'
export const TUTORIAL_REMOTE_SOURCE = 'tutorial'

export const DEFAULT_SETTINGS = {
  showTutorial: true,
  speechEnabled: true,
  selectedVoice: null,
  preferredInputMethod: null
}

export const DEFAULT_PROGRESS = {
  completed: false,
  stepIndex: 0,
  stepId: 'input-method',
  version: 2
}
