// Policies panel: lists the player's unit policies and, in their own section,
// the build policies that automate the player's base. Switching a policy on or
// off, or opting in to base automation, never pauses the simulation. Editing
// opens the pausing editor.

import './policies.css'
import { gameState } from '../../gameState.js'
import {
  deletePolicy,
  isBuildAutomationOptedIn,
  isUnitBuildAutomationOptedIn,
  isPolicyEnabled,
  listPolicies,
  setBuildAutomationOptIn,
  setUnitBuildAutomationOptIn,
  setPolicyEnabled,
  subscribePolicyStore
} from '../../policies/policyStore.js'
import { describeBasePolicyStatus, getBasePolicyStatus } from '../../policies/basePolicyEngine.js'
import { h } from './policyDom.js'
import { countPolicyActivity } from '../../policies/policyActivity.js'
import { describeEffect } from '../../policies/policyEffects.js'
import { describeRuleTrigger } from './conditionRows.js'
import { attachPolicyTooltip } from './policyTooltip.js'
import { openPolicyEditor } from './policyEditorModal.js'
import { showNotification } from '../notifications.js'

let panel = null
let list = null
let button = null
let refreshTimer = 0
const activityScratch = new Map()

export const PANEL_REFRESH_MS = 500

function humanPlayer() {
  return gameState.humanPlayer || 'player1'
}

export function describePolicyRules(policy) {
  const lines = []
  policy.states.forEach(state => {
    ;(state.transitions || []).forEach(transition => {
      const target = policy.states.find(item => item.id === transition.to)
      const action = target && target.effect ? describeEffect(target.effect) : (target ? target.name : '?')
      lines.push(`${describeRuleTrigger(transition)} → ${action}`)
    })
  })
  return lines
}

function activityCounts(policyId) {
  const enabled = h('span', { class: 'policy-count__value', dataset: { role: 'enabled-count' }, text: '0' })
  const active = h('span', { class: 'policy-count__value', dataset: { role: 'active-count' }, text: '0' })
  const row = h('div', { class: 'policy-card__counts', dataset: { policyId } },
    attachPolicyTooltip(
      h('span', { class: 'policy-count' }, enabled, h('span', { class: 'policy-count__label', text: 'enabled' })),
      'Units with this policy enabled\nGlobal policies count every unit that can carry one; per-unit policies count the units you applied it to.'),
    attachPolicyTooltip(
      h('span', { class: 'policy-count policy-count--active' }, active, h('span', { class: 'policy-count__label', text: 'in control' })),
      'Units actively controlled\nA condition fired and the policy is past its start state and not finished, so it is steering the unit right now.'))
  return row
}

/** Update the count text nodes in place; no card is rebuilt. */
export function refreshPolicyCounts() {
  if (!list) return
  refreshBasePolicyStatus()
  countPolicyActivity(gameState.units, activityScratch)
  list.querySelectorAll('.policy-card').forEach(card => {
    const entry = activityScratch.get(card.dataset.policyId)
    const enabled = String(entry ? entry.enabled : 0)
    const active = String(entry ? entry.active : 0)
    const enabledEl = card.querySelector('[data-role="enabled-count"]')
    const activeEl = card.querySelector('[data-role="active-count"]')
    if (enabledEl && enabledEl.textContent !== enabled) enabledEl.textContent = enabled
    if (activeEl && activeEl.textContent !== active) activeEl.textContent = active
    const holder = card.querySelector('.policy-count--active')
    if (holder) holder.classList.toggle('is-lit', entry ? entry.active > 0 : false)
  })
}

function policyCard(entry) {
  const { policy } = entry
  const enabled = isPolicyEnabled(policy.id)
  const isGlobal = policy.scope === 'global'
  const isBuild = policy.variant === 'build'
  const isUnitBuild = policy.variant === 'unitBuild'
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
    h('span', {
      class: 'policy-switch__label',
      text: isBuild
        ? (enabled ? 'On · applied to my base' : 'Off · click to apply')
        : isUnitBuild
          ? (enabled ? 'On · production ready' : 'Off · click to apply')
          : (enabled ? 'On · click to disable' : 'Off · click to enable')
    })))
  }
  card.appendChild(top)
  card.appendChild(h('div', {
    class: 'policy-card__meta',
    text: `${isBuild ? 'My base' : isUnitBuild ? 'Unit production' : isGlobal ? 'All my units' : 'One unit'} · ${policy.execution === 'oneTime' ? 'One-time' : 'Continuous'}${isGlobal ? '' : ' · apply with right-click on a unit'}`
  }))
  if (isBuild || isUnitBuild) {
    card.appendChild(h('div', { class: 'policy-card__status', dataset: { role: 'base-status', policyId: policy.id }, text: automationStatusText(policy, enabled) }))
  } else {
    card.appendChild(activityCounts(policy.id))
  }
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

function automationStatusText(policy, enabled) {
  if (!enabled) return policy.variant === 'unitBuild' ? 'Not applied to unit production' : 'Not applied to my base'
  if (policy.variant === 'unitBuild' && !isUnitBuildAutomationOptedIn(humanPlayer())) return 'Waiting: unit build automation is off'
  if (policy.variant === 'build' && !isBuildAutomationOptedIn(humanPlayer())) return 'Waiting: base automation is off'
  return describeBasePolicyStatus(getBasePolicyStatus(policy.id))
}

/** Update the live status line of every build policy card in place. */
export function refreshBasePolicyStatus() {
  if (!list) return
  list.querySelectorAll('[data-role="base-status"]').forEach(element => {
    const entry = listPolicies(humanPlayer()).find(item => item.policy.id === element.dataset.policyId)
    const text = entry ? automationStatusText(entry.policy, isPolicyEnabled(entry.policy.id)) : 'Not running'
    if (element.textContent !== text) element.textContent = text
  })
}

function baseAutomationSwitch() {
  const optedIn = isBuildAutomationOptedIn(humanPlayer())
  return h('div', { class: `policy-base-optin${optedIn ? ' is-on' : ''}`, id: 'baseAutomationOptIn' },
    h('div', { class: 'policy-card__top' },
      h('span', { text: 'Base automation' }),
      h('button', {
        class: 'policy-switch',
        type: 'button',
        role: 'switch',
        id: 'baseAutomationSwitch',
        'aria-checked': String(optedIn),
        'aria-label': 'Run build policies on my base',
        onClick: () => setBuildAutomationOptIn(humanPlayer(), !optedIn)
      },
      h('span', { class: 'policy-switch__track', 'aria-hidden': 'true' }),
      h('span', { class: 'policy-switch__label', text: optedIn ? 'On · my base' : 'Off · click to opt in' }))),
    h('p', { class: 'policy-card__meta', text: 'Build policies only act on your own base, and only while this is on. Every player chooses for their own base. The normal build queue still decides what is allowed.' }))
}

function unitBuildAutomationSwitch() {
  const optedIn = isUnitBuildAutomationOptedIn(humanPlayer())
  return h('div', { class: `policy-base-optin${optedIn ? ' is-on' : ''}`, id: 'unitBuildAutomationOptIn' },
    h('div', { class: 'policy-card__top' },
      h('span', { text: 'Unit build automation' }),
      h('button', {
        class: 'policy-switch', type: 'button', role: 'switch', id: 'unitBuildAutomationSwitch',
        'aria-checked': String(optedIn), 'aria-label': 'Run unit build policies',
        onClick: () => setUnitBuildAutomationOptIn(humanPlayer(), !optedIn)
      }, h('span', { class: 'policy-switch__track', 'aria-hidden': 'true' }),
      h('span', { class: 'policy-switch__label', text: optedIn ? 'On · my factories' : 'Off · click to opt in' }))),
    h('p', { class: 'policy-card__meta', text: 'Stacks units through the normal production queue, then gives each finished unit its configured attack, defense, or rally order.' }))
}

function sectionHeading(text, id) {
  return h('h3', { class: 'policy-panel__section', id, text })
}

function renderList() {
  if (!list) return
  const entries = listPolicies(humanPlayer())
  const unitEntries = entries.filter(entry => entry.policy.variant === 'unit')
  const buildEntries = entries.filter(entry => entry.policy.variant === 'build')
  const unitBuildEntries = entries.filter(entry => entry.policy.variant === 'unitBuild')
  list.replaceChildren(
    sectionHeading('Unit policies', 'unitPoliciesHeading'),
    ...(unitEntries.length
      ? unitEntries.map(policyCard)
      : [h('p', { class: 'policy-panel__empty', text: 'No unit policies yet. Create one to program your units.' })]),
    sectionHeading('Unit build policies', 'unitBuildPoliciesHeading'),
    unitBuildAutomationSwitch(),
    ...(unitBuildEntries.length
      ? unitBuildEntries.map(policyCard)
      : [h('p', { class: 'policy-panel__empty', text: 'No unit build policies yet. Create one to automate production and delivery orders.' })]),
    sectionHeading('Base policies', 'basePoliciesHeading'),
    baseAutomationSwitch(),
    ...(buildEntries.length
      ? buildEntries.map(policyCard)
      : [h('p', { class: 'policy-panel__empty', text: 'No build policies yet. Create one to automate your base.' })])
  )
  refreshPolicyCounts()
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
  clearInterval(refreshTimer)
  refreshTimer = setInterval(refreshPolicyCounts, PANEL_REFRESH_MS)
}

export function closePolicyPanel() {
  if (!panel) return
  panel.classList.remove('is-open')
  if (button) button.setAttribute('aria-expanded', 'false')
  clearInterval(refreshTimer)
  refreshTimer = 0
}

export function togglePolicyPanel() {
  if (panel && panel.classList.contains('is-open')) closePolicyPanel()
  else openPolicyPanel()
}

export function installPolicyPanel() {
  if (panel) return
  button = document.getElementById('policiesBtn')
  list = h('div', { class: 'policy-panel__list' })
  panel = h('div', { class: 'policy-panel', role: 'dialog', 'aria-label': 'Policies', id: 'policyPanel' },
    h('div', { class: 'policy-panel__header' },
      h('span', { text: 'Policies' }),
      h('button', { class: 'policy-icon-btn', type: 'button', 'aria-label': 'Close policies', text: '×', onClick: closePolicyPanel })),
    list,
    h('div', { class: 'policy-panel__footer' },
      h('button', {
        class: 'policy-btn policy-btn--primary',
        type: 'button',
        id: 'newPolicyBtn',
        text: '+ New unit policy',
        onClick: () => { closePolicyPanel(); openPolicyEditor() }
      }),
      h('button', {
        class: 'policy-btn policy-btn--primary',
        type: 'button',
        id: 'newBuildPolicyBtn',
        text: '+ New build policy',
        onClick: () => { closePolicyPanel(); openPolicyEditor({ variant: 'build' }) }
      }),
      h('button', {
        class: 'policy-btn policy-btn--primary', type: 'button', id: 'newUnitBuildPolicyBtn',
        text: '+ New unit build policy',
        onClick: () => { closePolicyPanel(); openPolicyEditor({ variant: 'unitBuild' }) }
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
