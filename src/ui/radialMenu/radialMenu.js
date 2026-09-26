import './radialMenu.css'
import { hitTestRadial, layoutRadialItems, resolveRadialTiming } from './radialLayout.js'

function viewportFromWindow() {
  return {
    x: 0,
    y: 0,
    width: window.innerWidth || 1280,
    height: window.innerHeight || 720
  }
}

export function createRadialMenu(options = {}) {
  const root = document.createElement('div')
  root.className = 'radial-menu'
  root.setAttribute('aria-hidden', 'true')
  root.style.display = 'none'
  const host = options.container || document.body
  host.appendChild(root)

  let openState = null
  let highlightId = null
  let frameId = 0

  function close() {
    if (frameId) {
      cancelAnimationFrame(frameId)
      frameId = 0
    }
    openState = null
    highlightId = null
    root.classList.remove('is-open')
    root.style.display = 'none'
    root.replaceChildren()
    root.setAttribute('aria-hidden', 'true')
  }

  function open(anchor, items, menuOptions = {}) {
    close()
    const list = Array.isArray(items) ? items.slice() : []
    const viewport = menuOptions.viewport || viewportFromWindow()
    const timing = resolveRadialTiming(list.length, menuOptions)
    const layout = layoutRadialItems(list.length, anchor, {
      ...menuOptions,
      viewport
    })
    const entries = []

    root.style.display = 'block'
    root.classList.add('is-open')
    root.setAttribute('aria-hidden', 'false')

    list.forEach((item, index) => {
      const point = layout.points[index]
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'radial-menu__button is-at-center'
      button.dataset.id = String(item.id)
      button.tabIndex = -1
      button.setAttribute('aria-label', item.label || String(item.id))
      if (item.label) button.title = item.label
      button.style.setProperty('--size', `${layout.buttonSize}px`)
      button.style.setProperty('--tx', `${point.x}px`)
      button.style.setProperty('--ty', `${point.y}px`)
      button.style.setProperty('--cx', `${layout.centerX}px`)
      button.style.setProperty('--cy', `${layout.centerY}px`)
      button.style.setProperty('--fly', `${timing.flyMs}ms`)
      button.style.setProperty('--delay', `${timing.staggerMs * index}ms`)
      if (item.disabled) button.classList.add('is-disabled')
      if (item.ready) button.classList.add('is-ready')
      if (item.icon) {
        const img = document.createElement('img')
        img.alt = ''
        img.draggable = false
        img.src = item.icon
        button.appendChild(img)
      }
      root.appendChild(button)
      entries.push({ item, point, button })
    })

    openState = { entries, layout, timing }
    frameId = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(() => {
        frameId = 0
        if (!openState) return
        openState.entries.forEach(entry => {
          entry.button.classList.remove('is-at-center')
        })
      })
    })

    return { layout, timing }
  }

  function highlightedItem() {
    if (!openState || highlightId == null) return null
    const entry = openState.entries.find(candidate => candidate.item.id === highlightId)
    return entry ? entry.item : null
  }

  function updatePointer(x, y) {
    if (!openState) return null
    const hit = hitTestRadial(
      openState.entries.map(entry => entry.point),
      x,
      y,
      openState.layout.buttonSize
    )
    const nextId = hit ? openState.entries[hit.index].item.id : null
    if (nextId !== highlightId) {
      highlightId = nextId
      openState.entries.forEach(entry => {
        entry.button.classList.toggle('is-highlighted', entry.item.id === nextId)
      })
    }
    return highlightedItem()
  }

  function setHoldProgress(id, progress) {
    if (!openState) return
    const amount = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
    openState.entries.forEach(entry => {
      const active = id != null && entry.item.id === id && amount > 0
      entry.button.classList.toggle('is-arming', active)
      entry.button.style.setProperty('--arm', active ? `${Math.round(amount * 360)}deg` : '0deg')
    })
  }

  function release(x, y) {
    const item = updatePointer(x, y)
    const selectable = item && !item.disabled ? item : null
    if (selectable && typeof selectable.onSelect === 'function') {
      selectable.onSelect(selectable)
    }
    close()
    return selectable
  }

  return {
    open,
    close,
    updatePointer,
    setHoldProgress,
    release,
    isOpen: () => Boolean(openState),
    element: root,
    destroy() {
      close()
      root.remove()
    }
  }
}
