// Live state-machine view for the policies on one unit. Opened from the unit's
// radial menu. Every edge shows its full trigger (for example
// "if(ammo == 100%)", wrapped onto further lines when long), the state the
// machine is in right now is highlighted and every state shows how often it
// was entered. The diagram is built once per policy and then updated in place.

import './policies.css'
import { getSimulationTime } from '../../game/time.js'
import { gameState } from '../../gameState.js'
import { getPolicyDocument } from '../../policies/policyStore.js'
import { describeEffect, describeRuleTrigger } from './conditionRows.js'
import { h, svg } from './policyDom.js'
import { layoutPolicyMachine, LINE_HEIGHT } from './policyMachineLayout.js'
import { attachPolicyTooltip } from './policyTooltip.js'

export const MACHINE_REFRESH_MS = 250
export const KIND_COLORS = Object.freeze({ if: '#4f9cff', while: '#ffb300', after: '#c792ea' })

let panel = null
let bodyEl = null
let titleEl = null
let openUnit = null
let sections = []
let refreshTimer = 0

function describeState(state) {
  return state.effect ? describeEffect(state.effect) : 'Do nothing'
}

function arrowMarkers() {
  return svg('defs', null,
    ...Object.entries(KIND_COLORS).map(([kind, color]) =>
      svg('marker', {
        id: `policyMachineArrow-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5,
        markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse'
      }, svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }))))
}

function buildSection(binding, doc) {
  const layout = layoutPolicyMachine(doc, describeRuleTrigger, describeState)
  const root = svg('svg', {
    class: 'policy-machine__svg',
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    role: 'img',
    'aria-label': `State machine of ${doc.name}`
  })
  root.appendChild(arrowMarkers())

  const edgeEls = new Map()
  layout.edges.forEach(edge => {
    const color = KIND_COLORS[edge.kind] || KIND_COLORS.if
    const path = svg('path', {
      class: `policy-machine__edge policy-machine__edge--${edge.kind}`,
      d: edge.path,
      stroke: color,
      'marker-end': `url(#policyMachineArrow-${edge.kind})`
    })
    const text = svg('text', {
      class: `policy-machine__label policy-machine__label--${edge.kind}`,
      x: edge.labelX,
      y: edge.labelY + LINE_HEIGHT - 2,
      fill: color
    })
    edge.lines.forEach((line, index) => {
      text.appendChild(svg('tspan', { x: edge.labelX, dy: index === 0 ? 0 : LINE_HEIGHT, text: line }))
    })
    let delayEl = null
    if (edge.delayLine) {
      delayEl = svg('tspan', { class: 'policy-machine__delay', x: edge.labelX, dy: LINE_HEIGHT, text: 'delay not running' })
      text.appendChild(delayEl)
    }
    root.appendChild(path)
    root.appendChild(text)
    edgeEls.set(edge.id, { path, text, delayEl })
  })

  const nodeEls = new Map()
  layout.nodes.forEach(node => {
    const group = svg('g', { class: 'policy-machine__node', 'data-state-id': node.id })
    group.appendChild(svg('rect', {
      class: 'policy-machine__node-box',
      x: node.x, y: node.y, width: node.width, height: node.height, rx: 8
    }))
    group.appendChild(svg('text', { class: 'policy-machine__node-name', x: node.x + 10, y: node.y + 20 },
      document.createTextNode(`${node.initial ? '▶ ' : ''}${node.name}`.slice(0, 20))))
    group.appendChild(svg('text', { class: 'policy-machine__node-action', x: node.x + 10, y: node.y + 33 },
      document.createTextNode(node.action.slice(0, 24))))
    const count = svg('text', { class: 'policy-machine__node-count', x: node.x + 10, y: node.y + node.height - 6, text: 'entered 0×' })
    group.appendChild(count)
    root.appendChild(group)
    nodeEls.set(node.id, { group, count })
  })

  const heading = h('div', { class: 'policy-machine__policy' },
    h('strong', { text: doc.name }),
    h('span', { class: 'policy-machine__source', text: binding.source === 'global' ? 'all units' : 'this unit' }))
  const el = h('section', { class: 'policy-machine__section' }, heading, root)
  return { binding, doc, el, layout, nodeEls, edgeEls }
}

function updateSection(section, now) {
  const runtime = section.binding.runtime
  const entered = runtime.entered || {}
  section.nodeEls.forEach((nodeEl, stateId) => {
    const isCurrent = runtime.currentStateId === stateId
    nodeEl.group.classList.toggle('is-current', isCurrent && !runtime.finished)
    nodeEl.group.classList.toggle('is-holding', isCurrent && runtime.hold != null)
    const text = `entered ${entered[stateId] || 0}×`
    if (nodeEl.count.textContent !== text) nodeEl.count.textContent = text
  })
  section.edgeEls.forEach((edgeEl, edgeId) => {
    const dueAt = runtime.pending ? runtime.pending[edgeId] : undefined
    const armed = dueAt !== undefined
    const holding = runtime.hold != null && runtime.hold.transitionId === edgeId
    edgeEl.path.classList.toggle('is-armed', armed)
    edgeEl.path.classList.toggle('is-holding', holding)
    edgeEl.text.classList.toggle('is-armed', armed)
    edgeEl.text.classList.toggle('is-holding', holding)
    if (edgeEl.delayEl) {
      const text = armed ? `${Math.max(0, Math.ceil((dueAt - now) / 1000))}s left` : 'delay not running'
      if (edgeEl.delayEl.textContent !== text) edgeEl.delayEl.textContent = text
    }
  })
  section.el.classList.toggle('is-finished', runtime.finished === true)
}

function currentTargets(unit) {
  const targets = []
  const bindings = unit && unit.policyBindings
  if (!bindings) return targets
  for (let i = 0; i < bindings.length; i++) {
    const doc = getPolicyDocument(bindings[i].policyId)
    if (doc) targets.push({ binding: bindings[i], doc })
  }
  return targets
}

function sectionsMatch(targets) {
  if (targets.length !== sections.length) return false
  for (let i = 0; i < targets.length; i++) {
    if (sections[i].binding !== targets[i].binding || sections[i].doc !== targets[i].doc) return false
  }
  return true
}

export function refreshPolicyMachineView() {
  if (!panel || !openUnit) return
  if (!(openUnit.health > 0)) {
    closePolicyMachineView()
    return
  }
  const targets = currentTargets(openUnit)
  if (!sectionsMatch(targets)) {
    sections = targets.map(target => buildSection(target.binding, target.doc))
    if (sections.length === 0) {
      bodyEl.replaceChildren(h('p', { class: 'policy-machine__empty', text: 'No policy is applied to this unit.' }))
    } else {
      bodyEl.replaceChildren(...sections.map(section => section.el))
    }
  }
  const now = getSimulationTime(gameState)
  for (let i = 0; i < sections.length; i++) updateSection(sections[i], now)
}

function ensurePanel() {
  if (panel && panel.isConnected) return panel
  titleEl = h('strong', { class: 'policy-machine__title', text: 'Policy state machine' })
  const close = h('button', {
    class: 'policy-machine__close',
    type: 'button',
    'aria-label': 'Close state machine view',
    text: '×',
    onClick: () => closePolicyMachineView()
  })
  attachPolicyTooltip(close, 'Close\nHide the state machine view.')
  bodyEl = h('div', { class: 'policy-machine__body' })
  const legend = h('div', { class: 'policy-machine__legend' },
    ...Object.entries(KIND_COLORS).map(([kind, color]) =>
      h('span', { class: 'policy-machine__legend-item' },
        h('i', { class: 'policy-machine__swatch', style: `background:${color}` }),
        kind)))
  panel = h('aside', { class: 'policy-machine', role: 'dialog', 'aria-label': 'Policy state machine' },
    h('header', { class: 'policy-machine__header' }, titleEl, close),
    legend,
    bodyEl)
  document.body.appendChild(panel)
  return panel
}

export function isPolicyMachineViewOpen(unit) {
  return Boolean(panel && panel.classList.contains('is-open') && (!unit || openUnit === unit))
}

export function openPolicyMachineView(unit) {
  ensurePanel()
  openUnit = unit
  sections = []
  const type = String(unit.type || 'unit').replace(/[-_]/g, ' ')
  titleEl.textContent = `State machine · ${type}`
  panel.classList.add('is-open')
  refreshPolicyMachineView()
  window.clearInterval(refreshTimer)
  refreshTimer = window.setInterval(refreshPolicyMachineView, MACHINE_REFRESH_MS)
}

export function closePolicyMachineView() {
  window.clearInterval(refreshTimer)
  refreshTimer = 0
  openUnit = null
  sections = []
  if (panel) panel.classList.remove('is-open')
}

/** Toggle the view for `unit`; returns true when it is open afterwards. */
export function togglePolicyMachineView(unit) {
  if (isPolicyMachineViewOpen(unit)) {
    closePolicyMachineView()
    return false
  }
  openPolicyMachineView(unit)
  return true
}
