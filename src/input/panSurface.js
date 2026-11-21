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

export function stepPanInertia(velocity, elapsedMs, friction = 0.92, stopSpeed = 0.02) {
  const factor = Math.pow(friction, elapsedMs / (1000 / 60))
  const x = velocity.x * factor
  const y = velocity.y * factor
  return { x: Math.abs(x) < stopSpeed ? 0 : x, y: Math.abs(y) < stopSpeed ? 0 : y }
}

export function createPanSurface(element, {
  content,
  initialX = 0,
  initialY = 0,
  invert = false,
  keyboard = true,
  speed = 1,
  inertia = true,
  inertiaFriction = 0.92,
  onChange
} = {}) {
  let x = initialX
  let y = initialY
  let dragging = false
  let pointerX = 0
  let pointerY = 0
  let lastPointerTime = 0
  let velocityX = 0
  let velocityY = 0
  let frame = 0
  let frameTime = 0
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

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
  const stopInertia = () => { if (frame) cancelAnimationFrame(frame); frame = 0; velocityX = 0; velocityY = 0 }
  const animate = time => {
    const elapsed = Math.min(50, time - frameTime)
    frameTime = time
    const next = stepPanInertia({ x: velocityX, y: velocityY }, elapsed, inertiaFriction)
    velocityX = next.x; velocityY = next.y
    if (!velocityX && !velocityY) { frame = 0; return }
    panBy(velocityX * elapsed, velocityY * elapsed)
    frame = requestAnimationFrame(animate)
  }
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
    stopInertia()
    pointerX = event.clientX
    pointerY = event.clientY
    lastPointerTime = event.timeStamp
    element.setPointerCapture?.(event.pointerId)
    element.classList.add('is-panning')
  }
  const move = event => {
    if (!dragging) return
    const direction = invert ? -speed : speed
    const dx = (pointerX - event.clientX) * direction
    const dy = (pointerY - event.clientY) * direction
    const elapsed = Math.max(1, event.timeStamp - lastPointerTime)
    panBy(dx, dy)
    velocityX = dx / elapsed
    velocityY = dy / elapsed
    pointerX = event.clientX
    pointerY = event.clientY
    lastPointerTime = event.timeStamp
  }
  const up = () => {
    if (!dragging) return
    dragging = false; element.classList.remove('is-panning')
    if (inertia && !reducedMotion && (velocityX || velocityY)) {
      frameTime = performance.now()
      frame = requestAnimationFrame(animate)
    }
  }
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
      stopInertia()
      element.removeEventListener('wheel', wheel)
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('keydown', keydown)
    }
  }
}
