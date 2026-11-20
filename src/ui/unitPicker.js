import { UNIT_PICKER_SCROLL_SPEED, UNIT_PICKER_VISIBLE_ROWS } from '../config.js'
import { focusAndSelectUnit } from '../game/attackNotifications.js'
import { getSimulationTime } from '../game/time.js'
import { gameState } from '../gameState.js'
import { getAmmoDisplay, getFuelDisplay, getUnitLabel } from './productionTooltip.js'

const HOLD_MS = 500
const MOVE_TOLERANCE = 10
const ROW_HEIGHT = 44
const MENU_WIDTH = 274
const GUTTER = 8
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const isOwnLiveUnit = unit => unit.owner === gameState.humanPlayer && unit.health > 0
const unitBirth = unit => unit.unitCreatedAt ?? unit.productionCompletedAt ?? unit.spawnTime

function formatAge(unit, now) {
  const born = unitBirth(unit)
  if (!Number.isFinite(born)) return '—'
  const seconds = Math.max(0, Math.floor((now - born) / 1000))
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`
}

function createRow(unit, now) {
  const row = document.createElement('div')
  row.className = 'unit-picker__row'
  row.setAttribute('role', 'option')
  row.setAttribute('aria-selected', 'false')

  const name = document.createElement('div')
  name.className = 'unit-picker__name'
  name.textContent = unit.name || getUnitLabel(unit.type)
  const stats = document.createElement('div')
  stats.className = 'unit-picker__stats'
  for (const [icon, label, value] of [
    ['◷', 'Age', formatAge(unit, now)],
    ['♥', 'HP', Math.ceil(unit.health)],
    ['⛽', 'Fuel', getFuelDisplay(unit)],
    ['▮', 'Ammo', getAmmoDisplay(unit)],
    ['★', 'XP', Math.floor(unit.experience ?? 0)]
  ]) {
    const stat = document.createElement('span')
    stat.title = label
    stat.setAttribute('aria-label', `${label} ${value}`)
    const symbol = document.createElement('span')
    symbol.setAttribute('aria-hidden', 'true')
    symbol.textContent = icon
    stat.append(symbol, String(value))
    stats.append(stat)
  }
  row.append(name, stats)
  return row
}

function openPicker(button, units) {
  const anchor = button.getBoundingClientRect()
  const width = Math.min(MENU_WIDTH, window.innerWidth - GUTTER * 2)
  const viewportRows = Math.max(1, Math.floor((window.innerHeight - GUTTER * 2) / ROW_HEIGHT))
  const height = Math.min(units.length, UNIT_PICKER_VISIBLE_ROWS, viewportRows) * ROW_HEIGHT
  const canPlaceLeft = anchor.left >= width + GUTTER * 2
  const canPlaceRight = window.innerWidth - anchor.right >= width + GUTTER * 2
  const left = canPlaceLeft ? anchor.left - width - GUTTER
    : canPlaceRight ? anchor.right + GUTTER : anchor.left
  const top = canPlaceLeft || canPlaceRight ? anchor.top + (anchor.height - height) / 2
    : anchor.top >= height + GUTTER * 2 ? anchor.top - height - GUTTER : anchor.bottom + GUTTER

  const menu = document.createElement('div')
  menu.className = 'unit-picker'
  menu.setAttribute('role', 'listbox')
  menu.setAttribute('aria-label', 'Your units')
  Object.assign(menu.style, {
    left: `${clamp(left, GUTTER, window.innerWidth - width - GUTTER)}px`,
    top: `${clamp(top, GUTTER, window.innerHeight - height - GUTTER)}px`,
    width: `${width}px`,
    height: `${height}px`,
    '--unit-picker-row-height': `${ROW_HEIGHT}px`
  })
  const track = document.createElement('div')
  track.className = 'unit-picker__track'
  track.style.top = `${(height - ROW_HEIGHT) / 2}px`
  const now = getSimulationTime(gameState)
  const rows = units.map(unit => createRow(unit, now))
  track.append(...rows)
  menu.append(track)
  document.body.append(menu)
  return { menu, track, rows }
}

export function bindUnitPicker(button, canOpen) {
  const listeners = new AbortController()
  const { signal } = listeners
  let gesture
  let suppressClick = false

  function finish(select = false) {
    if (!gesture) return
    const current = gesture
    gesture = null
    clearTimeout(current.timer)
    cancelAnimationFrame(current.frame)
    current.picker?.menu.remove()
    if (button.hasPointerCapture(current.id)) button.releasePointerCapture(current.id)
    if (select && current.picker) {
      const id = current.units[current.highlighted].id
      const unit = gameState.units.find(unit => unit.id === id && isOwnLiveUnit(unit))
      if (unit) focusAndSelectUnit(unit)
    }
  }

  function render(current) {
    const { track, rows } = current.picker
    track.style.transform = `translate3d(0, ${-current.position * ROW_HEIGHT}px, 0)`
    const index = Math.round(current.position)
    if (index !== current.highlighted) {
      rows[current.highlighted]?.setAttribute('aria-selected', 'false')
      rows[index].setAttribute('aria-selected', 'true')
      current.highlighted = index
    }
  }

  function animate(now) {
    const current = gesture
    const seconds = Math.min((now - current.lastFrame) / 1000, 0.05)
    current.lastFrame = now
    current.speed += (current.targetSpeed - current.speed) * (1 - Math.exp(-seconds * 18))
    const position = clamp(current.position + current.speed * seconds, 0, current.units.length - 1)
    if (position !== current.position) {
      current.position = position
      render(current)
    }
    if (current.targetSpeed || Math.abs(current.speed) > 0.01) {
      current.frame = requestAnimationFrame(animate)
    } else {
      current.frame = 0
      current.speed = 0
    }
  }

  function start(current) {
    if (!canOpen()) return
    current.units = (gameState.units || []).filter(isOwnLiveUnit)
      .reverse().sort((a, b) => (unitBirth(b) ?? -1) - (unitBirth(a) ?? -1))
    suppressClick = true
    if (!current.units.length) return
    current.picker = openPicker(button, current.units)
    current.bounds = current.picker.menu.getBoundingClientRect()
    current.position = Math.max(0, current.units.findIndex(unit => unit.selected))
    render(current)
  }

  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || gesture) return
    suppressClick = false
    if (!canOpen()) return
    const current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      frame: 0, speed: 0, targetSpeed: 0
    }
    gesture = current
    button.setPointerCapture(current.id)
    current.timer = setTimeout(() => start(current), HOLD_MS)
  }, { signal })

  button.addEventListener('pointermove', event => {
    const current = gesture
    if (!current || event.pointerId !== current.id) return
    if (!current.picker) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > MOVE_TOLERANCE) {
        suppressClick = true
        finish()
      }
      return
    }

    const { top, bottom, left, right, height } = current.bounds
    if (event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom) {
      current.entered = true
    }
    const relativeY = (event.clientY - top) / height * 2 - 1
    const edge = clamp((Math.abs(relativeY) - 0.2) / 0.8, 0, 1)
    current.targetSpeed = current.entered && event.clientX >= left && event.clientX <= right
      ? Math.sign(relativeY) * edge ** 2 * UNIT_PICKER_SCROLL_SPEED : 0
    if (!current.frame && current.targetSpeed && current.units.length > 1) {
      current.lastFrame = performance.now()
      current.frame = requestAnimationFrame(animate)
    }
  }, { signal })

  button.addEventListener('pointerup', event => {
    if (event.pointerId === gesture?.id) finish(true)
  }, { signal })
  for (const type of ['pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => {
      if (event.pointerId === gesture?.id) finish()
    }, { signal })
  }
  button.addEventListener('contextmenu', event => {
    if (gesture || suppressClick) event.preventDefault()
  }, { signal })
  button.addEventListener('click', event => {
    if (suppressClick && event.detail > 0) {
      suppressClick = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }, { capture: true, signal })
  window.addEventListener('blur', () => finish(), { signal })
  window.addEventListener('resize', () => finish(), { signal })
  return () => {
    finish()
    listeners.abort()
  }
}
