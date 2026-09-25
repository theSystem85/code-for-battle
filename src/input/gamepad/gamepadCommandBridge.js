export const gamepadBridge = {
  selectedUnits: null,
  getKeyboardHandler: null,
  focusLastAttack: null,
  syncRemoteControlAction: null,
  clearRemoteControlSource: null,
  getCoopSlot: null,
  publishCoopSlot: null
}

export function bindGamepadCommands(partial) {
  if (!partial) return
  if (partial.selectedUnits) gamepadBridge.selectedUnits = partial.selectedUnits
  if (partial.getKeyboardHandler) gamepadBridge.getKeyboardHandler = partial.getKeyboardHandler
  if (partial.focusLastAttack) gamepadBridge.focusLastAttack = partial.focusLastAttack
  if (partial.syncRemoteControlAction) gamepadBridge.syncRemoteControlAction = partial.syncRemoteControlAction
  if (partial.clearRemoteControlSource) gamepadBridge.clearRemoteControlSource = partial.clearRemoteControlSource
  if (partial.getCoopSlot) gamepadBridge.getCoopSlot = partial.getCoopSlot
  if (partial.publishCoopSlot) gamepadBridge.publishCoopSlot = partial.publishCoopSlot
}
