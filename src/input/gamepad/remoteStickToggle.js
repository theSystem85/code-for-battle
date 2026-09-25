export function nextRemoteStickToggle(active, pressed, targetAlive) {
  if (!targetAlive) return false
  if (!pressed) return Boolean(active)
  return !active
}
