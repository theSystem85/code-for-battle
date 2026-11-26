import './radialMenu.css'
import { hitTestRadial, layoutRadialItems, layoutRadialSubmenu, resolveRadialTiming } from './radialLayout.js'

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
  let submenuTimer = 0
  let submenuParent = null
  let lastPointer = null

  function close() {
    clearTimeout(submenuTimer)
    submenuTimer = 0
    submenuParent = null
    lastPointer = null
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
      if (item.label && !item.customTooltip) button.title = item.label
      button.style.setProperty('--size', `${layout.buttonSize}px`)
      button.style.setProperty('--tx', `${point.x}px`)
      button.style.setProperty('--ty', `${point.y}px`)
      button.style.setProperty('--cx', `${layout.centerX}px`)
      button.style.setProperty('--cy', `${layout.centerY}px`)
      button.style.setProperty('--fly', `${timing.flyMs}ms`)
      button.style.setProperty('--delay', `${timing.staggerMs * index}ms`)
      button.setAttribute('aria-disabled', String(Boolean(item.disabled)))
      if (item.children?.length) {
        button.classList.add('has-submenu')
        button.setAttribute('aria-haspopup', 'menu')
        button.setAttribute('aria-expanded', 'false')
      }
      if (item.disabled) button.classList.add('is-disabled')
      if (item.ready) button.classList.add('is-ready')
      if (item.icon) {
        const img = document.createElement('img')
        img.alt = ''
        img.draggable = false
        img.src = item.icon
        button.appendChild(img)
      }
      if (!item.icon && item.text) {
        button.classList.add('has-text')
        const text = document.createElement('span')
        text.className = 'radial-menu__text'
        text.textContent = item.text
        button.appendChild(text)
      }
      root.appendChild(button)
      entries.push({ item, point, button })
    })

    openState = { entries, layout, timing, viewport, menuOptions }
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

  function expandSubmenu(entry, direction) {
    if (!openState || entry.item.disabled || !entry.item.children?.length || submenuParent === entry) return
    clearTimeout(submenuTimer)
    const state = openState
    const points = layoutRadialSubmenu(entry.item.children.length, entry.point, direction, {
      buttonSize: state.layout.buttonSize, viewport: state.viewport
    })
    // Reuse rendering and hit testing for arbitrarily nested menus.
    open(entry.point, entry.item.children, { ...state.menuOptions, viewport: state.viewport, duration: 110, stagger: 0 })
    submenuParent = entry
    openState.entries.forEach((child, index) => {
      child.point = points[index]
      child.button.style.setProperty('--tx', `${child.point.x}px`)
      child.button.style.setProperty('--ty', `${child.point.y}px`)
      child.button.dataset.parentId = String(entry.item.id)
    })
    const parent = entry.button.cloneNode(true)
    parent.classList.remove('is-at-center', 'is-highlighted')
    parent.classList.add('is-submenu-origin')
    parent.setAttribute('aria-expanded', 'true')
    root.appendChild(parent)
    options.onSubmenuOpen?.(root)
  }

  function updatePointer(x, y) {
    if (!openState) return null
    const previous = lastPointer || { x: openState.layout.centerX, y: openState.layout.centerY }
    lastPointer = { x, y }
    const hit = hitTestRadial(openState.entries.map(entry => entry.point), x, y, openState.layout.buttonSize)
    const entry = hit ? openState.entries[hit.index] : null
    const nextId = entry ? entry.item.id : null
    if (nextId !== highlightId) {
      clearTimeout(submenuTimer)
      submenuTimer = 0
      highlightId = nextId
      openState.entries.forEach(candidate => candidate.button.classList.toggle('is-highlighted', candidate.item.id === nextId))
      if (entry?.item.children?.length && !entry.item.disabled) {
        const direction = Math.atan2(y - previous.y, x - previous.x)
        submenuTimer = setTimeout(() => expandSubmenu(entry, direction), 300)
      }
    }
    return highlightedItem()
  }

  function activate(x, y) {
    const item = updatePointer(x, y)
    if (!item) return null
    if (item.disabled) {
      if (item.onDisabledSelect) { close(); item.onDisabledSelect(item) }
      return null
    }
    if (item.children?.length) {
      const entry = openState.entries.find(candidate => candidate.item === item)
      expandSubmenu(entry, Math.atan2(entry.point.y - openState.layout.centerY, entry.point.x - openState.layout.centerX))
      return null
    }
    // Close first so an action can safely open another menu.
    close()
    item.onSelect?.(item)
    return item
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
    const selected = activate(x, y)
    if (!selected && !highlightedItem()?.children?.length && !submenuParent) close()
    return selected
  }

  return {
    open,
    close,
    updatePointer,
    setHoldProgress,
    release,
    activate,
    isOpen: () => Boolean(openState),
    element: root,
    destroy() {
      close()
      root.remove()
    }
  }
}
