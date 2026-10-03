// Policies panel: lists the player's unit policies. Switching a global policy
// on or off here never pauses the simulation. Editing opens the pausing editor.

import './policies.css'
import { gameState } from '../../gameState.js'
import {
  deletePolicy,
  isPolicyEnabled,
  listPolicies,
  setPolicyEnabled,
  subscribePolicyStore
} from '../../policies/policyStore.js'
import { h } from './policyDom.js'
import { EFFECT_LABELS, describeCondition } from './conditionRows.js'
import { openPolicyEditor } from './policyEditorModal.js'
import { showNotification } from '../notifications.js'

let panel = null
let list = null
let button = null

function humanPlayer() {
  return gameState.humanPlayer || 'player1'
}

export function describePolicyRules(policy) {
  const lines = []
  policy.states.forEach(state => {
    ;(state.transitions || []).forEach(transition => {
      const target = policy.states.find(item => item.id === transition.to)
      const action = target && target.effect ? EFFECT_LABELS[target.effect.type] : (target ? target.name : '?')
      const until = transition.until ? `, until ${describeCondition(transition.until)}` : ''
      lines.push(`${transition.kind.toUpperCase()} ${describeCondition(transition.when)} → ${action}${until}`)
    })
  })
  return lines
}

function policyCard(entry) {
  const { policy } = entry
  const enabled = isPolicyEnabled(policy.id)
  const isGlobal = policy.scope === 'global'
  const card = h('article', { class: `policy-card${enabled ? ' is-on' : ''}`, dataset: { policyId: policy.id } })
  const top = h('div', { class: 'policy-card__top' }, h('span', { text: policy.name }))
  if (isGlobal) {
    top.appendChild(h('button', {
      class: 'policy-switch',
      type: 'button',
      role: 'switch',
      'aria-checked': String(enabled),
      'aria-label': `${enabled ? 'Disable' : 'Enable'} ${policy.name}`,
      onClick: () => {
        const result = setPolicyEnabled(humanPlayer(), policy.id, !enabled)
        if (!result.ok) showNotification('Only the commanding player can switch this policy.', 2200)
      }
    },
    h('span', { class: 'policy-switch__track', 'aria-hidden': 'true' }),
    h('span', { class: 'policy-switch__label', text: enabled ? 'On · click to disable' : 'Off · click to enable' })))
  }
  card.appendChild(top)
  card.appendChild(h('div', {
    class: 'policy-card__meta',
    text: `${isGlobal ? 'All my units' : 'One unit'} · ${policy.execution === 'oneTime' ? 'One-time' : 'Continuous'}${isGlobal ? '' : ' · apply with right-click on a unit'}`
  }))
  const rules = describePolicyRules(policy)
  if (rules.length) {
    card.appendChild(h('ul', { class: 'policy-card__rules' }, rules.map(line => h('li', { text: line }))))
  }
  card.appendChild(h('div', { class: 'policy-card__actions' },
    h('button', {
      class: 'policy-btn policy-btn--small',
      type: 'button',
      text: 'Edit',
      onClick: () => { closePolicyPanel(); openPolicyEditor({ policyId: policy.id }) }
    }),
    h('button', {
      class: 'policy-btn policy-btn--small',
      type: 'button',
      text: 'Delete',
      onClick: () => deletePolicy(humanPlayer(), policy.id)
    })))
  return card
}

function renderList() {
  if (!list) return
  const entries = listPolicies(humanPlayer())
  list.replaceChildren(...(entries.length
    ? entries.map(policyCard)
    : [h('p', { class: 'policy-panel__empty', text: 'No policies yet. Create one to program your units.' })]))
}

function placePanel() {
  if (!panel || !button) return
  const rect = button.getBoundingClientRect()
  const width = panel.offsetWidth || 320
  const height = panel.offsetHeight || 300
  let left = rect.left - width - 8
  if (left < 8) left = Math.min(window.innerWidth - width - 8, rect.right + 8)
  left = Math.max(8, left)
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8))
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
}

export function openPolicyPanel() {
  if (!panel) return
  renderList()
  panel.classList.add('is-open')
  if (button) button.setAttribute('aria-expanded', 'true')
  placePanel()
}

export function closePolicyPanel() {
  if (!panel) return
  panel.classList.remove('is-open')
  if (button) button.setAttribute('aria-expanded', 'false')
}

export function togglePolicyPanel() {
  if (panel && panel.classList.contains('is-open')) closePolicyPanel()
  else openPolicyPanel()
}

export function installPolicyPanel() {
  if (panel) return
  button = document.getElementById('policiesBtn')
  list = h('div', { class: 'policy-panel__list' })
  panel = h('div', { class: 'policy-panel', role: 'dialog', 'aria-label': 'Unit policies', id: 'policyPanel' },
    h('div', { class: 'policy-panel__header' },
      h('span', { text: 'Unit policies' }),
      h('button', { class: 'policy-icon-btn', type: 'button', 'aria-label': 'Close policies', text: '×', onClick: closePolicyPanel })),
    list,
    h('div', { class: 'policy-panel__footer' },
      h('button', {
        class: 'policy-btn policy-btn--primary',
        type: 'button',
        id: 'newPolicyBtn',
        text: '+ New policy',
        onClick: () => { closePolicyPanel(); openPolicyEditor() }
      })))
  document.body.appendChild(panel)

  if (button) {
    button.addEventListener('click', event => {
      event.stopPropagation()
      togglePolicyPanel()
    })
  }
  document.addEventListener('mousedown', event => {
    if (!panel.classList.contains('is-open')) return
    if (panel.contains(event.target) || (button && button.contains(event.target))) return
    closePolicyPanel()
  }, true)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) closePolicyPanel()
  })
  window.addEventListener('resize', placePanel)
  subscribePolicyStore(() => {
    if (panel.classList.contains('is-open')) renderList()
  })
}
