export function gamepadIndicatorVisibility(slotConnected) {
  const first = Boolean(slotConnected && slotConnected[0])
  const second = Boolean(slotConnected && slotConnected[1])
  return {
    overlay: first || second,
    chips: [first, second]
  }
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
