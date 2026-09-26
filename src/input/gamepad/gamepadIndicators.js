function slotConnectedAt(slotConnected, index) {
  const slot = slotConnected && slotConnected[index]
  if (!slot) return false
  if (typeof slot === 'object') return Boolean(slot.connected)
  return true
}

export function gamepadIndicatorVisibility(slotConnected) {
  const first = slotConnectedAt(slotConnected, 0)
  const second = slotConnectedAt(slotConnected, 1)
  return {
    overlay: first || second,
    chips: [first, second]
  }
}

export function gamepadRemoteIndicatorMode(slotConnected, remoteSlots) {
  const first = slotConnectedAt(slotConnected, 0) && Boolean(remoteSlots && remoteSlots[0])
  const second = slotConnectedAt(slotConnected, 1) && Boolean(remoteSlots && remoteSlots[1])
  return (first ? 1 : 0) + (second ? 2 : 0)
}

export function applyGamepadIndicatorVisibility(host, chips, slotConnected) {
  const visibility = gamepadIndicatorVisibility(slotConnected)
  if (host) host.hidden = !visibility.overlay
  const list = chips || []
  for (let i = 0; i < 2; i++) {
    const chip = list[i]
    if (!chip) continue
    const on = visibility.chips[i]
    chip.hidden = !on
    chip.classList.toggle('gamepad-indicator--on', on)
  }
  return visibility
}
