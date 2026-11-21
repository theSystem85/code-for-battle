/** Reusable, allocation-free-after-setup panning for map-sized DOM surfaces. */
export function normalizePanWheel(event, width, height, invert = false) {
  const scaleX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1
  const scaleY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1
  const horizontalFallback = event.shiftKey && event.deltaX === 0
  const direction = invert ? -1 : 1
  return {
    x: direction * (horizontalFallback ? event.deltaY * scaleX : event.deltaX * scaleX),
    y: direction * (horizontalFallback ? 0 : event.deltaY * scaleY)
  }
}

export function createPanSurface(element, {
  content,
  initialX = 0,
  initialY = 0,
  invert = false,
  keyboard = true,
  onChange
} = {}) {
  let x = initialX
  let y = initialY
  let dragging = false
  let pointerX = 0
  let pointerY = 0

  const bounds = () => ({
    maxX: Math.max(0, (content?.scrollWidth || content?.offsetWidth || 0) - element.clientWidth),
    maxY: Math.max(0, (content?.scrollHeight || content?.offsetHeight || 0) - element.clientHeight)
  })
  const apply = () => {
    const { maxX, maxY } = bounds()
    x = Math.max(0, Math.min(x, maxX))
    y = Math.max(0, Math.min(y, maxY))
    if (content) content.style.transform = `translate3d(${-x}px, ${-y}px, 0)`
    onChange?.({ x, y })
  }
  const panBy = (dx, dy) => { x += dx; y += dy; apply() }
  const wheel = event => {
    if (event.ctrlKey || event.metaKey) return
    event.preventDefault()
    const delta = normalizePanWheel(event, element.clientWidth, element.clientHeight, invert)
    panBy(delta.x, delta.y)
  }
  const down = event => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return
    if (event.target.closest?.('button, a, input, select, textarea')) return
    dragging = true
    pointerX = event.clientX
    pointerY = event.clientY
    element.setPointerCapture?.(event.pointerId)
    element.classList.add('is-panning')
  }
  const move = event => {
    if (!dragging) return
    const speed = invert ? -1 : 1
    panBy((pointerX - event.clientX) * speed, (pointerY - event.clientY) * speed)
    pointerX = event.clientX
    pointerY = event.clientY
  }
  const up = () => { dragging = false; element.classList.remove('is-panning') }
  const keydown = event => {
    if (!keyboard || event.target.matches?.('input, textarea, select')) return
    const step = 64
    const delta = { ArrowLeft: [-step, 0], a: [-step, 0], ArrowRight: [step, 0], d: [step, 0], ArrowUp: [0, -step], w: [0, -step], ArrowDown: [0, step], s: [0, step] }[event.key]
    if (!delta) return
    event.preventDefault()
    panBy(...delta)
  }
  element.addEventListener('wheel', wheel, { passive: false })
  element.addEventListener('pointerdown', down)
  element.addEventListener('pointermove', move)
  element.addEventListener('pointerup', up)
  element.addEventListener('pointercancel', up)
  element.addEventListener('contextmenu', event => event.preventDefault())
  element.addEventListener('keydown', keydown)
  apply()
  return {
    panBy,
    getPosition: () => ({ x, y }),
    setPosition: (nextX, nextY) => { x = nextX; y = nextY; apply() },
    destroy() {
      element.removeEventListener('wheel', wheel)
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('keydown', keydown)
    }
  }
}
