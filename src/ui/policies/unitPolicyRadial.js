// Radial context menu for per-unit policies. Right-click or long-press on one
// of your units opens it, in the same radial family as the factory build menu.
// Choosing a policy applies it to that unit mid-battle; the simulation keeps
// running.

import './policies.css'
import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { getUnitSelectionCenter } from '../../input/selectionManager.js'
import {
  applyPolicyToUnit,
  listPolicies,
  removePolicyFromUnit
} from '../../policies/policyStore.js'
import { getUnitPolicySummary, isProgrammableUnit, refreshUnitPolicyActivity } from '../../policies/policyEngine.js'
import { createRadialMenu } from '../radialMenu/radialMenu.js'
import { LONG_PRESS_MOVE_CANCEL_PX, LONG_PRESS_MS } from '../radialMenu/longPressTracker.js'
import { showNotification } from '../notifications.js'
import { h } from './policyDom.js'
import { isPolicyMachineViewOpen, togglePolicyMachineView } from './policyMachineView.js'
import { describePolicyRules, openPolicyPanel } from './policyPanel.js'

const RIGHT_CLICK_MOVE_PX = 6
const MANAGE_ID = '__manage'
const MACHINE_ID = '__machine'

function humanPlayer() {
  return gameState.humanPlayer || 'player1'
}

function interactionLocked() {
  return Boolean(
    gameState.mapEditMode || gameState.isSpectator || gameState.localPlayerDefeated ||
    gameState.replayMode || gameState.buildingPlacementMode || gameState.repairMode || gameState.sellMode
  )
}

function shortLabel(name) {
  const trimmed = String(name || '').trim()
  return trimmed.length > 22 ? `${trimmed.slice(0, 21)}…` : trimmed
}

export function buildUnitPolicyItems(unit, onApplied) {
  const owner = humanPlayer()
  const entries = listPolicies(owner).filter(entry => entry.policy.scope === 'perUnit' && entry.policy.variant !== 'build')
  const hasBindings = Boolean(unit.policyBindings && unit.policyBindings.length > 0)
  if (entries.length === 0 && !hasBindings) return []
  const summary = getUnitPolicySummary(unit)
  const items = entries.map(entry => {
    const applied = summary.find(item => item.policyId === entry.policy.id && item.source === 'unit')
    return {
      id: entry.policy.id,
      label: entry.policy.name,
      text: shortLabel(entry.policy.name),
      customTooltip: true,
      ready: Boolean(applied),
      tooltipTitle: entry.policy.name,
      tooltipLines: [
        applied ? (applied.holding ? 'Applied and holding. Click to remove.' : 'Applied. Click to remove.') : 'Click to apply to this unit.',
        entry.policy.execution === 'oneTime' ? 'One-time: starts now.' : 'Continuous.',
        ...describePolicyRules(entry.policy)
      ],
      onSelect: () => {
        if (applied) {
          removePolicyFromUnit(owner, unit, entry.policy.id)
          showNotification(`${entry.policy.name} removed`, 1600)
        } else {
          const result = applyPolicyToUnit(owner, unit, entry.policy.id)
          if (result.ok) showNotification(`${entry.policy.name} applied`, 1600)
          else showNotification('Only the commanding player can apply this policy.', 2200)
        }
        refreshUnitPolicyActivity(unit)
        if (onApplied) onApplied(unit)
      }
    }
  })
  const machineOpen = isPolicyMachineViewOpen(unit)
  items.push({
    id: MACHINE_ID,
    label: 'State machine',
    text: 'State machine',
    customTooltip: true,
    ready: machineOpen,
    tooltipTitle: 'State machine view',
    tooltipLines: [
      machineOpen ? 'Showing. Click to hide.' : 'Click to show the policy state machine of this unit.',
      'Shows the current state, each rule\'s full condition and how often every state was entered.'
    ],
    onSelect: () => { togglePolicyMachineView(unit) }
  })
  items.push({
    id: MANAGE_ID,
    label: 'Manage policies',
    text: 'Policies…',
    customTooltip: true,
    tooltipTitle: 'Manage policies',
    tooltipLines: ['Open the policy list to create or edit policies.'],
    onSelect: () => openPolicyPanel()
  })
  return items
}

export function installUnitPolicyRadial(canvas, getUnits) {
  if (!canvas || canvas.dataset.unitPolicyRadial === 'true') return null
  canvas.dataset.unitPolicyRadial = 'true'

  const menu = createRadialMenu()
  const tip = h('div', { class: 'unit-policy-tip', role: 'status' })
  document.body.appendChild(tip)

  let rightDown = null
  let longPress = null
  let openItems = null
  let swallowUntil = 0

  function unitAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    const worldX = clientX - rect.left + gameState.scrollOffset.x
    const worldY = clientY - rect.top + gameState.scrollOffset.y
    const owner = humanPlayer()
    const units = getUnits()
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      if (!(unit.health > 0) || !isProgrammableUnit(unit)) continue
      if (unit.owner !== owner && !(owner === 'player1' && unit.owner === 'player')) continue
      const { centerX, centerY } = getUnitSelectionCenter(unit)
      if (Math.hypot(worldX - centerX, worldY - centerY) < TILE_SIZE / 2) return unit
    }
    return null
  }

  function hideTip() {
    tip.classList.remove('is-visible')
  }

  function showTip(item, x, y) {
    tip.replaceChildren(
      h('strong', { text: item.tooltipTitle || item.label }),
      ...(item.tooltipLines || []).map(line => h('div', { text: line }))
    )
    tip.classList.add('is-visible')
    const width = tip.offsetWidth
    const height = tip.offsetHeight
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x + 16))}px`
    tip.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, y + 16))}px`
  }

  function close() {
    openItems = null
    menu.close()
    hideTip()
  }

  function openFor(unit, clientX, clientY) {
    if (interactionLocked()) return false
    const items = buildUnitPolicyItems(unit, () => {})
    if (items.length === 0) return false
    const rect = canvas.getBoundingClientRect()
    const center = getUnitSelectionCenter(unit)
    const anchor = {
      x: rect.left + center.centerX - gameState.scrollOffset.x || clientX,
      y: rect.top + center.centerY - gameState.scrollOffset.y || clientY
    }
    openItems = items
    menu.open(anchor, items, { buttonSize: 64, radius: 88 })
    return true
  }

  function pointerTarget(x, y) {
    const item = menu.updatePointer(x, y)
    if (item && !item.disabled) showTip(item, x, y)
    else hideTip()
    return item
  }

  window.addEventListener('mousedown', event => {
    if (event.button !== 2 || event.target !== canvas) {
      rightDown = null
      return
    }
    rightDown = { x: event.clientX, y: event.clientY, unit: interactionLocked() ? null : unitAt(event.clientX, event.clientY) }
  }, true)

  window.addEventListener('mouseup', event => {
    if (event.button !== 2 || !rightDown) return
    const down = rightDown
    rightDown = null
    if (!down.unit || event.target !== canvas) return
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > RIGHT_CLICK_MOVE_PX) return
    if (openFor(down.unit, event.clientX, event.clientY)) {
      gameState.suppressRightClickDeselect = true
    }
  }, true)

  window.addEventListener('pointerdown', event => {
    if (openItems) {
      const item = pointerTarget(event.clientX, event.clientY)
      event.preventDefault()
      event.stopPropagation()
      swallowUntil = performance.now() + 600
      if (item && !item.disabled && typeof item.onSelect === 'function') item.onSelect(item)
      close()
      return
    }
    if (event.pointerType !== 'touch' || event.target !== canvas) return
    const unit = interactionLocked() ? null : unitAt(event.clientX, event.clientY)
    if (!unit) return
    const state = { x: event.clientX, y: event.clientY, unit, fired: false, timer: 0 }
    state.timer = setTimeout(() => {
      if (longPress !== state) return
      state.fired = openFor(unit, state.x, state.y)
    }, LONG_PRESS_MS)
    longPress = state
  }, true)

  window.addEventListener('pointermove', event => {
    if (openItems) {
      pointerTarget(event.clientX, event.clientY)
      return
    }
    if (longPress && !longPress.fired &&
      Math.hypot(event.clientX - longPress.x, event.clientY - longPress.y) > LONG_PRESS_MOVE_CANCEL_PX) {
      clearTimeout(longPress.timer)
      longPress = null
    }
  }, true)

  const endTouch = event => {
    if (!longPress) return
    const state = longPress
    longPress = null
    clearTimeout(state.timer)
    if (state.fired) {
      event.stopImmediatePropagation()
      event.preventDefault()
      swallowUntil = performance.now() + 600
    }
  }
  window.addEventListener('pointerup', endTouch, true)
  window.addEventListener('pointercancel', endTouch, true)

  ;['mousedown', 'mouseup', 'click'].forEach(type => {
    window.addEventListener(type, event => {
      if (openItems || performance.now() < swallowUntil) {
        if (type === 'mouseup' && event.button === 2) return
        event.stopImmediatePropagation()
        event.preventDefault()
      }
    }, true)
  })

  window.addEventListener('keydown', event => {
    if (openItems && event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }, true)

  window.addEventListener('blur', close)
  return { close, isOpen: () => Boolean(openItems) }
}
