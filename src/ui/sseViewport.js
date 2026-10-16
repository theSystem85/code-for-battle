export function zoomSseView(view, scale, x, y, dx = 0, dy = 0) {
  scale = Number.isFinite(scale) ? Math.max(0.1, Math.min(8, scale)) : view.scale
  const ratio = scale / view.scale
  return { scale, x: x - (x - view.x) * ratio + dx, y: y - (y - view.y) * ratio + dy }
}

// Writing a value never emits input events, so updates cannot feed back.
export function bindSseZoomInput(input, element, read, apply) {
  const sync = () => { input.value = String(Math.round(read().scale * 10000) / 100) }
  input.min = '10'
  input.max = '800'
  input.step = 'any'
  input.addEventListener('input', () => {
    if (!input.value || !Number.isFinite(Number(input.value))) return
    apply(zoomSseView(read(), Number(input.value) / 100, element.clientWidth / 2, element.clientHeight / 2))
  })
  sync()
  return sync
}

// Input-driven transforms only: no animation loop or bitmap resizing.
export function bindSseViewport(element, read, apply) {
  element.dataset.sseViewport = ''
  const pointers = new Map()
  let previous = null
  let suppressUntil = 0
  const geometry = () => {
    const points = [...pointers.values()]
    if (points.length !== 2) return null
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) }
  }
  const zoom = (x, y, factor, dx = 0, dy = 0) => {
    const rect = element.getBoundingClientRect()
    const current = read()
    apply(zoomSseView(current, current.scale * factor, x - rect.left, y - rect.top, dx, dy))
  }
  element.style.touchAction = 'none'
  element.addEventListener('wheel', event => {
    event.preventDefault()
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1
    if (event.ctrlKey) zoom(event.clientX, event.clientY, Math.exp(-event.deltaY * multiplier * 0.01))
    else {
      const current = read()
      apply({ ...current, x: current.x - event.deltaX * multiplier, y: current.y - event.deltaY * multiplier })
    }
  }, { passive: false })
  element.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    element.setPointerCapture(event.pointerId)
    previous = geometry()
    if (previous) suppressUntil = Infinity
  })
  element.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const next = geometry()
    if (previous && next && !touchActive) {
      event.preventDefault()
      zoom(previous.x, previous.y, previous.distance > 0 ? next.distance / previous.distance : 1, next.x - previous.x, next.y - previous.y)
    }
    previous = next
  })
  const end = event => {
    pointers.delete(event.pointerId)
    previous = geometry()
    if (!pointers.size && suppressUntil === Infinity) suppressUntil = performance.now() + 350
  }
  element.addEventListener('pointerup', end)
  element.addEventListener('pointercancel', end)
  element.addEventListener('click', event => {
    if (performance.now() < suppressUntil) { event.stopImmediatePropagation(); event.preventDefault() }
  }, true)
  let touchPrevious = null
  let touchActive = false
  let gestureScale = null
  const touchGeometry = touches => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
    distance: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  })
  const touch = event => {
    if (event.target.closest?.('[data-sse-viewport]') !== element) return
    if (event.touches.length === 2) {
      const next = touchGeometry(event.touches)
      if (touchPrevious && event.type === 'touchmove') {
        zoom(touchPrevious.x, touchPrevious.y, touchPrevious.distance > 0 ? next.distance / touchPrevious.distance : 1,
          next.x - touchPrevious.x, next.y - touchPrevious.y)
      }
      touchPrevious = next
      touchActive = true
      suppressUntil = Infinity
    } else touchPrevious = null
    if (touchActive) {
      event.stopImmediatePropagation()
      event.preventDefault()
      if (!event.touches.length) {
        touchActive = false
        suppressUntil = performance.now() + 350
      }
    }
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    element.addEventListener(type, touch, { passive: false, capture: true })
  }
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    element.addEventListener(type, event => {
      event.preventDefault()
      event.stopPropagation()
      if (type === 'gesturestart') gestureScale = event.scale || 1
      if (type === 'gesturechange' && gestureScale && !touchActive && pointers.size < 2) {
        const rect = element.getBoundingClientRect()
        zoom(Number.isFinite(event.clientX) ? event.clientX : rect.left + rect.width / 2,
          Number.isFinite(event.clientY) ? event.clientY : rect.top + rect.height / 2, event.scale / gestureScale)
        gestureScale = event.scale
      }
      if (type === 'gestureend') gestureScale = null
    }, { passive: false })
  }
}

export function bindSseSplit(workspace, sourcePane, change) {
  const divider = document.createElement('div')
  divider.id = 'ssePaneDivider'
  divider.setAttribute('role', 'separator')
  divider.setAttribute('aria-label', 'Resize source and target panes')
  divider.setAttribute('aria-orientation', 'horizontal')
  divider.tabIndex = 0
  sourcePane.before(divider)
  let ratio = 0.6
  const apply = value => {
    ratio = Math.max(0.15, Math.min(0.85, value))
    workspace.style.setProperty('--sse-target-ratio', `${ratio * 100}%`)
    divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)))
    try { localStorage.setItem('sse.splitRatio', String(ratio)) } catch { /* Storage can be disabled. */ }
    change?.(ratio)
    return ratio
  }
  try { const saved = Number(localStorage.getItem('sse.splitRatio')); if (saved > 0) ratio = saved } catch { /* Use default. */ }
  apply(ratio)
  let dragging = false
  divider.addEventListener('pointerdown', event => { dragging = true; divider.setPointerCapture(event.pointerId); event.preventDefault() })
  divider.addEventListener('pointermove', event => {
    if (!dragging) return
    const rect = workspace.getBoundingClientRect()
    apply((event.clientY - rect.top) / rect.height)
  })
  divider.addEventListener('pointerup', () => { dragging = false })
  divider.addEventListener('pointercancel', () => { dragging = false })
  divider.addEventListener('keydown', event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    apply(ratio + (event.key === 'ArrowUp' ? -0.05 : 0.05))
  })
  return apply
}
