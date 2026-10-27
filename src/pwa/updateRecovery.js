// Keep the preserved battlefield visible when boot fails. Recovery uses the
// ordinary URL and the durable checkpoint, rather than another pinned boot.
export function showUpdateRecovery(error, { win = window, doc = document } = {}) {
  const frame = doc.getElementById('gameUpdateFrame')
  if (!frame) return false
  doc.getElementById('liveUpdateProgress')?.remove()
  let panel = doc.getElementById('gameUpdateRecovery')
  if (!panel) {
    panel = doc.createElement('div')
    panel.id = 'gameUpdateRecovery'
    panel.style.cssText = 'position:absolute;top:env(safe-area-inset-top,0px);left:0;right:0;padding:16px;background:#182126;color:white;font:16px sans-serif;'
    const text = doc.createElement('p')
    text.textContent = 'The update could not finish. Your saved battle is preserved.'
    const retry = doc.createElement('button')
    retry.type = 'button'
    retry.textContent = 'Reload normally'
    retry.addEventListener('click', () => {
      const clean = new URL(win.location.href)
      clean.searchParams.delete('cfb-update')
      for (const key of ['cfb-update-frame', 'cfb-live-update-attempt', 'cfb-live-update-applied', 'cfb-sw-update-reload']) {
        try { win.sessionStorage.removeItem(key) } catch { /* Storage may be blocked. */ }
      }
      win.location.assign(clean.href)
    })
    panel.append(text, retry)
    frame.appendChild(panel)
  }
  panel.setAttribute('role', 'alert')
  return true
}
