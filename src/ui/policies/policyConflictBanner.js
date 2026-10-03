// Shown when a new direct order is given to a unit while a "while" policy is
// currently overriding it. The order wins; the player can additionally pause
// the policy until the new order is fulfilled.

import './policies.css'
import { gameState } from '../../gameState.js'
import {
  pausePolicyUntilOrderDone,
  subscribePolicyEvents
} from '../../policies/policyEngine.js'
import { canCommandPolicy } from '../../policies/policyStore.js'
import { h } from './policyDom.js'

const AUTO_HIDE_MS = 12000
const RESUME_NOTE_MS = 2500

let banner = null
let textEl = null
let statusEl = null
let pauseBtn = null
let hideTimer = 0
let current = null

function hide() {
  clearTimeout(hideTimer)
  hideTimer = 0
  current = null
  if (banner) banner.classList.remove('is-visible')
}

function scheduleHide(ms) {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(hide, ms)
}

function describe(policies) {
  const names = policies.map(policy => `“${policy.name}”`)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  return `${names.length > 1 ? 'Policies' : 'Policy'} ${list} conflicts with your new order. Your order wins.`
}

export function showPolicyConflict(event) {
  if (!banner) return
  current = { unit: event.unit, policies: event.policies, orderSeq: event.orderSeq, paused: false }
  textEl.textContent = describe(event.policies)
  statusEl.textContent = 'The policy resumes after the order, unless its condition triggers again.'
  pauseBtn.disabled = false
  pauseBtn.textContent = 'Pause policy until order is done'
  banner.classList.add('is-visible')
  scheduleHide(AUTO_HIDE_MS)
}

export function installPolicyConflictBanner() {
  if (banner) return
  textEl = h('div', { class: 'policy-conflict__text' })
  statusEl = h('div', { class: 'policy-conflict__status' })
  pauseBtn = h('button', {
    class: 'policy-btn policy-btn--primary',
    type: 'button',
    id: 'policyConflictPause',
    text: 'Pause policy until order is done',
    onClick: () => {
      if (!current) return
      let paused = false
      current.policies.forEach(policy => {
        paused = pausePolicyUntilOrderDone(current.unit, policy.id) || paused
      })
      if (paused) {
        current.paused = true
        pauseBtn.disabled = true
        pauseBtn.textContent = 'Policy paused'
        statusEl.textContent = 'Paused until this order is fulfilled.'
        clearTimeout(hideTimer)
      }
    }
  })
  banner = h('div', { class: 'policy-conflict', role: 'alert', id: 'policyConflictBanner' },
    h('span', { class: 'policy-conflict__icon', 'aria-hidden': 'true', text: '!' }),
    textEl,
    h('div', { class: 'policy-conflict__actions' },
      pauseBtn,
      h('button', { class: 'policy-btn', type: 'button', text: 'Dismiss', onClick: hide })),
    statusEl)
  document.body.appendChild(banner)

  subscribePolicyEvents(event => {
    if (event.type === 'conflict') {
      if (!canCommandPolicy(gameState.humanPlayer || 'player1', event.unit.owner)) return
      showPolicyConflict(event)
    } else if (event.type === 'orderFulfilled' && current && current.unit === event.unit && current.orderSeq === event.orderSeq) {
      if (current.paused) {
        statusEl.textContent = 'Order fulfilled. The policy is active again.'
        pauseBtn.disabled = true
        scheduleHide(RESUME_NOTE_MS)
      } else {
        hide()
      }
    }
  })
}
