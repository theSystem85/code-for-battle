const BUTTONS = 24
const AXES = 8

function createSlot() {
  return {
    connected: false,
    id: '',
    index: -1,
    mapping: '',
    instanceKey: '',
    buttonCount: 0,
    axisCount: 0,
    buttons: new Float32Array(BUTTONS),
    axes: new Float32Array(AXES)
  }
}

export const gamepadMonitor = {
  slots: [createSlot(), createSlot()],
  ignored: 0
}

export const GAMEPAD_MONITOR_BUTTONS = BUTTONS
export const GAMEPAD_MONITOR_AXES = AXES

let poller = null

export function setGamepadPoller(poll) {
  poller = poll
}

export function requestGamepadPoll(now) {
  if (poller) poller(now)
}
