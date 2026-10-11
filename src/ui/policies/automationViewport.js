import './automationViewport.css'

/** Hardware heuristic, deliberately independent of window/keyboard dimensions. */
export function classifyAutomationDevice({ userAgent = '', platform = '', maxTouchPoints = 0, mobile, coarsePointer = false, screenWidth = 0, screenHeight = 0 } = {}) {
  if (/iPad|Tablet|Silk|Kindle/i.test(userAgent) || (/Mac/i.test(platform + userAgent) && maxTouchPoints > 1)) return 'tablet'
  if (/iPhone|iPod/i.test(userAgent)) return 'phone'
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? 'phone' : 'tablet'
  if (mobile === true) return 'phone'
  if (mobile === false) return 'desktop'
  const shortEdge = Math.min(screenWidth, screenHeight)
  return coarsePointer && maxTouchPoints > 0 && shortEdge > 0 && shortEdge < 600 ? 'phone' : 'desktop'
}

export function readAutomationDevice(win = window) {
  const nav = win.navigator
  return classifyAutomationDevice({
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    mobile: nav.userAgentData?.mobile,
    coarsePointer: Boolean(win.matchMedia?.('(pointer: coarse)').matches),
    screenWidth: win.screen.width,
    screenHeight: win.screen.height
  })
}

/** Mount once per dialog; no simulation/render-loop work. */
export function attachAutomationViewport(backdrop, dialog, { win = window, classify = readAutomationDevice } = {}) {
  const doc = dialog.ownerDocument
  const previousFocus = doc.activeElement
  const scrollX = win.scrollX
  const scrollY = win.scrollY
  const oldBodyStyle = doc.body.getAttribute('style')
  const siblings = [...doc.body.children].filter(element => element !== backdrop)
  const inertStates = siblings.map(element => element.hasAttribute('inert'))
  siblings.forEach(element => element.setAttribute('inert', ''))
  backdrop.classList.add('automation-viewport')
  Object.assign(doc.body.style, { position: 'fixed', top: `${-scrollY}px`, left: `${-scrollX}px`, width: '100%', overflow: 'hidden' })
  dialog.tabIndex = -1
  let closed = false
  let frame = null
  function updateViewport() {
    const phone = classify(win) === 'phone'
    backdrop.classList.toggle('automation-phone', phone)
    const viewport = win.visualViewport
    const top = viewport?.offsetTop || 0
    const left = viewport?.offsetLeft || 0
    const height = viewport?.height || win.innerHeight
    const width = viewport?.width || win.innerWidth
    for (const [key, value] of Object.entries({ top, left, height, width, bottom: Math.max(0, win.innerHeight - top - height), right: Math.max(0, win.innerWidth - left - width) })) {
      backdrop.style.setProperty(`--automation-viewport-${key}`, `${value}px`)
    }
  }
  function revealFocus() {
    if (frame !== null) win.cancelAnimationFrame(frame)
    frame = win.requestAnimationFrame(() => {
      frame = null
      const focused = doc.activeElement
      if (!closed && dialog.contains(focused)) focused.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    })
  }
  function onResize() { updateViewport(); revealFocus() }
  function focusableControls() {
    return [...dialog.querySelectorAll('button, input, textarea, select, a[href], [tabindex]')].filter(element => !element.disabled && element.tabIndex >= 0 && !element.closest('[hidden], [inert]') && win.getComputedStyle(element).display !== 'none' && win.getComputedStyle(element).visibility !== 'hidden')
  }
  function onKeyDown(event) {
    if (event.key !== 'Tab') return
    const controls = focusableControls()
    const first = controls[0] || dialog
    const last = controls[controls.length - 1] || dialog
    if (!dialog.contains(doc.activeElement) || (event.shiftKey && doc.activeElement === first) || (!event.shiftKey && doc.activeElement === last) || !controls.length) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }
  }
  function onFocus(event) {
    if (!dialog.contains(event.target)) (focusableControls()[0] || dialog).focus()
  }
  updateViewport()
  win.addEventListener('resize', onResize)
  win.visualViewport?.addEventListener('resize', onResize)
  win.visualViewport?.addEventListener('scroll', onResize)
  doc.addEventListener('keydown', onKeyDown, true)
  doc.addEventListener('focusin', onFocus)
  dialog.addEventListener('focusin', revealFocus)
  return () => {
    if (closed) return
    closed = true
    if (frame !== null) win.cancelAnimationFrame(frame)
    win.removeEventListener('resize', onResize)
    win.visualViewport?.removeEventListener('resize', onResize)
    win.visualViewport?.removeEventListener('scroll', onResize)
    doc.removeEventListener('keydown', onKeyDown, true)
    doc.removeEventListener('focusin', onFocus)
    dialog.removeEventListener('focusin', revealFocus)
    backdrop.classList.remove('automation-phone', 'automation-viewport')
    for (const key of ['top', 'left', 'height', 'width', 'bottom', 'right']) backdrop.style.removeProperty(`--automation-viewport-${key}`)
    siblings.forEach((element, index) => { if (!inertStates[index]) element.removeAttribute('inert') })
    if (oldBodyStyle === null) doc.body.removeAttribute('style')
    else doc.body.setAttribute('style', oldBodyStyle)
    win.scrollTo(scrollX, scrollY)
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  }
}
