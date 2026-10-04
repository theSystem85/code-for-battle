// Long-press the sidebar build button (the Units tab, or the compact category
// toggle on narrow screens) to open the list of units that a policy currently
// controls. The list refreshes in place while open; rows are updated, never
// rebuilt each tick.

import './policies.css'
import { MAP_TILES_X, MAP_TILES_Y, TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { selectedUnits } from '../../inputHandler.js'
import { describeActivePolicies, listActivelyControlledUnits } from '../../policies/policyActivity.js'
import { LONG_PRESS_MOVE_CANCEL_PX, LONG_PRESS_MS } from '../radialMenu/longPressTracker.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../../utils/layoutMetrics.js'
import { h } from './policyDom.js'
import { attachPolicyTooltip } from './policyTooltip.js'

export const ACTIVE_UNITS_REFRESH_MS = 500
const BUTTON_SELECTOR = '#productionTabs .tab-button[data-tab="units"], #mobileCategoryToggle'

let popover = null
let listEl = null
let anchorButton = null
let refreshTimer = 0
const scratch = []

function humanPlayer() {
  return gameState.humanPlayer || 'player1'
}

export function unitLabel(unit) {
  const name = String(unit.type || 'unit').replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function collectOwnActiveUnits(units, owner, out = []) {
  listActivelyControlledUnits(units, scratch)
  out.length = 0
  for (let i = 0; i < scratch.length; i++) {
    if (scratch[i].owner === owner) out.push(scratch[i])
  }
  return out
}

function focusUnit(unit) {
  for (let i = 0; i < selectedUnits.length; i++) selectedUnits[i].selected = false
  selectedUnits.length = 0
  unit.selected = true
  selectedUnits.push(unit)
  const canvas = document.getElementById('gameCanvas')
  if (!canvas) return
  const width = getPlayableViewportWidth(canvas)
  const height = getPlayableViewportHeight(canvas)
  gameState.scrollOffset.x = Math.max(0, Math.min(unit.x + TILE_SIZE / 2 - width / 2, MAP_TILES_X * TILE_SIZE - width))
  gameState.scrollOffset.y = Math.max(0, Math.min(unit.y + TILE_SIZE / 2 - height / 2, MAP_TILES_Y * TILE_SIZE - height))
}

function unitRow(unit) {
  const row = h('button', { class: 'policy-active-row', type: 'button' },
    h('span', { class: 'policy-active-row__icon', 'aria-hidden': 'true', text: '⚡' }),
    h('span', { class: 'policy-active-row__name', text: unitLabel(unit) }),
    h('span', { class: 'policy-active-row__policies' }))
  row.addEventListener('click', () => { focusUnit(unit); closeActiveUnitsList() })
  attachPolicyTooltip(row, () => describeActivePolicies(unit))
  return row
}

function policyNames(unit) {
  const text = describeActivePolicies(unit)
  return text.slice(text.indexOf('\n') + 1).split('\n').join(', ')
}

export function refreshActiveUnitsList() {
  if (!listEl) return
  const units = collectOwnActiveUnits(gameState.units || [], humanPlayer())
  const existing = new Map()
  Array.from(listEl.children).forEach(child => { if (child.__unit) existing.set(child.__unit, child) })
  const keep = []
  units.forEach(unit => {
    let row = existing.get(unit)
    if (!row) {
      row = unitRow(unit)
      row.__unit = unit
    }
    const names = policyNames(unit)
    const nameEl = row.querySelector('.policy-active-row__policies')
    if (nameEl.textContent !== names) nameEl.textContent = names
    keep.push(row)
  })
  const empty = listEl.querySelector('.policy-active-empty')
  if (keep.length === 0) {
    if (!empty) listEl.replaceChildren(h('p', { class: 'policy-active-empty', text: 'No unit is controlled by a policy right now.' }))
    return
  }
  const same = keep.length === listEl.children.length && keep.every((row, i) => listEl.children[i] === row)
  if (!same) listEl.replaceChildren(...keep)
}

export function closeActiveUnitsList() {
  if (!popover) return
  popover.classList.remove('is-open')
  clearInterval(refreshTimer)
  refreshTimer = 0
}

function place() {
  if (!popover || !anchorButton) return
  const rect = anchorButton.getBoundingClientRect()
  const width = popover.offsetWidth || 280
  const height = popover.offsetHeight || 200
  let left = rect.left - width - 8
  if (left < 8) left = Math.min(window.innerWidth - width - 8, rect.left)
  left = Math.max(8, left)
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8))
  popover.style.left = `${left}px`
  popover.style.top = `${top}px`
}

export function openActiveUnitsList(button) {
  if (!popover) return
  anchorButton = button
  popover.classList.add('is-open')
  refreshActiveUnitsList()
  place()
  clearInterval(refreshTimer)
  refreshTimer = setInterval(() => { refreshActiveUnitsList(); place() }, ACTIVE_UNITS_REFRESH_MS)
}

function bindLongPress(button) {
  if (button.dataset.policyLongPress === 'true') return
  button.dataset.policyLongPress = 'true'
  let state = null
  let swallowClickUntil = 0

  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    state = { x: event.clientX, y: event.clientY, fired: false, timer: 0 }
    const current = state
    current.timer = setTimeout(() => {
      if (state !== current) return
      current.fired = true
      openActiveUnitsList(button)
    }, LONG_PRESS_MS)
  })
  button.addEventListener('pointermove', event => {
    if (!state || state.fired) return
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > LONG_PRESS_MOVE_CANCEL_PX) {
      clearTimeout(state.timer)
      state = null
    }
  })
  const end = () => {
    if (!state) return
    clearTimeout(state.timer)
    if (state.fired) swallowClickUntil = performance.now() + 600
    state = null
  }
  button.addEventListener('pointerup', end)
  button.addEventListener('pointercancel', end)
  button.addEventListener('pointerleave', () => { if (state && !state.fired) end() })
  button.addEventListener('contextmenu', event => { if (state && state.fired) event.preventDefault() })
  button.addEventListener('click', event => {
    if (performance.now() < swallowClickUntil) {
      event.stopImmediatePropagation()
      event.preventDefault()
    }
  }, true)
}

export function installActiveUnitsList() {
  if (popover) return
  listEl = h('div', { class: 'policy-active-list' })
  popover = h('div', { class: 'policy-active-popover', role: 'dialog', 'aria-label': 'Units controlled by policies', id: 'policyActiveUnits' },
    h('div', { class: 'policy-panel__header' },
      h('span', { text: 'Controlled by policies' }),
      h('button', { class: 'policy-icon-btn', type: 'button', 'aria-label': 'Close list', text: '×', onClick: closeActiveUnitsList })),
    listEl)
  document.body.appendChild(popover)

  document.querySelectorAll(BUTTON_SELECTOR).forEach(bindLongPress)
  document.addEventListener('pointerdown', event => {
    if (!popover.classList.contains('is-open')) return
    if (popover.contains(event.target)) return
    if (event.target.closest && event.target.closest(BUTTON_SELECTOR)) return
    closeActiveUnitsList()
  }, true)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && popover.classList.contains('is-open')) closeActiveUnitsList()
  })
  window.addEventListener('resize', place)
}
