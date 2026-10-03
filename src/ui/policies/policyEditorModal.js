// Visual block builder for unit policies. A modal that pauses the simulation
// while it is open. No source code: states, rules and conditions are blocks.

import './policies.css'
import { gameState } from '../../gameState.js'
import {
  MAX_POLICY_STATES,
  POLICY_SCHEMA_VERSION,
  describePolicyProblem,
  validatePolicy
} from '../../policies/policySchema.js'
import { POLICY_TEMPLATES, createBlankPolicy, createPolicyId } from '../../policies/policyTemplates.js'
import { getPolicyDocument, savePolicy } from '../../policies/policyStore.js'
import { h, option, svg } from './policyDom.js'
import {
  ATOM_KINDS,
  EFFECT_LABELS,
  atomKind,
  conditionToRows,
  describeCondition,
  makeAtom,
  rowsToCondition
} from './conditionRows.js'

let active = null
let pausedByEditor = false
const closeListeners = new Set()

export function onPolicyEditorClosed(listener) {
  closeListeners.add(listener)
  return () => closeListeners.delete(listener)
}

export function isPolicyEditorOpen() {
  return active !== null
}

function clickPauseButton() {
  const button = document.getElementById('pauseBtn')
  if (button) button.click()
  else gameState.gamePaused = !gameState.gamePaused
}

function pauseSimulation() {
  if (!gameState.gamePaused) {
    clickPauseButton()
    pausedByEditor = gameState.gamePaused === true
  }
}

function resumeSimulation() {
  if (pausedByEditor && gameState.gamePaused && !gameState.gameOver) {
    clickPauseButton()
  }
  pausedByEditor = false
}

function humanPlayer() {
  return gameState.humanPlayer || 'player1'
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nextId(prefix, taken) {
  let n = taken.size + 1
  while (taken.has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

function allTransitionIds(draft) {
  const ids = new Set()
  draft.states.forEach(state => (state.transitions || []).forEach(t => ids.add(t.id)))
  return ids
}

export function openPolicyEditor(options = {}) {
  if (active) return active.api
  const owner = humanPlayer()
  let draft
  let isNew = true
  if (options.policyId && getPolicyDocument(options.policyId)) {
    draft = clone(getPolicyDocument(options.policyId))
    isNew = false
  } else {
    const template = POLICY_TEMPLATES.find(item => item.id === options.templateId)
    draft = template ? template.create(createPolicyId()) : createBlankPolicy(createPolicyId())
  }

  let templateChoice = ''
  pauseSimulation()

  const backdrop = h('div', { class: 'policy-editor-backdrop' })
  const dialog = h('div', { class: 'policy-editor', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'policyEditorTitle' })
  const alertIcon = h('div', { class: 'policy-editor__alert-icon', role: 'img', 'aria-label': 'Invalid policy' }, '!')
  const reason = h('div', { class: 'policy-editor__reason', role: 'alert' })
  const stateCount = h('span', { class: 'policy-editor__chip' })
  const body = h('div', { class: 'policy-editor__body' })
  const saveButton = h('button', { class: 'policy-btn policy-btn--primary', type: 'button', text: 'Save policy' })
  const cancelButton = h('button', { class: 'policy-btn', type: 'button', text: 'Cancel' })
  const closeButton = h('button', { class: 'policy-editor__close', type: 'button', 'aria-label': 'Close editor', text: '×' })

  dialog.append(
    h('header', { class: 'policy-editor__header' },
      h('h2', { id: 'policyEditorTitle', text: isNew ? 'New unit policy' : 'Edit unit policy' }),
      h('span', { class: 'policy-editor__pause-note', text: 'Simulation paused while editing' }),
      closeButton,
      alertIcon
    ),
    reason,
    body,
    h('footer', { class: 'policy-editor__footer' }, stateCount, cancelButton, saveButton)
  )
  backdrop.appendChild(dialog)
  document.body.appendChild(backdrop)

  function updateValidity() {
    const validation = validatePolicy(draft)
    const message = describePolicyProblem(validation)
    dialog.classList.toggle('is-invalid', !validation.valid)
    reason.textContent = message || ''
    saveButton.disabled = !validation.valid
    stateCount.textContent = `States ${draft.states.length} / ${MAX_POLICY_STATES}`
    stateCount.classList.toggle('is-over', draft.states.length > MAX_POLICY_STATES)
    return validation
  }

  function stateSelect(value, onChange, label) {
    const select = h('select', { class: 'policy-field__control', 'aria-label': label, onChange: e => onChange(e.target.value) },
      draft.states.map(state => option(state.id, state.name || state.id, state.id === value)))
    return select
  }

  function conditionEditor(condition, onChange, label) {
    const rows = conditionToRows(condition)
    const wrap = h('div', { class: 'policy-cond' })
    if (!rows) {
      wrap.append(
        h('span', { class: 'policy-cond__readonly', text: describeCondition(condition) }),
        h('button', {
          class: 'policy-btn policy-btn--small',
          type: 'button',
          text: 'Reset',
          onClick: () => { onChange({ type: 'always' }); render() }
        })
      )
      return wrap
    }
    const commit = () => onChange(rowsToCondition(rows.mode, rows.rows))
    rows.rows.forEach((row, index) => {
      const atom = row.atom
      const kind = atomKind(atom)
      const line = h('div', { class: 'policy-cond__row' })
      if (index > 0) {
        line.appendChild(h('select', {
          class: 'policy-field__control policy-cond__join',
          'aria-label': `${label} combine`,
          onChange: e => { rows.mode = e.target.value; commit(); render() }
        }, option('and', 'and', rows.mode === 'and'), option('or', 'or', rows.mode === 'or')))
      }
      line.appendChild(h('label', { class: 'policy-cond__not' },
        h('input', { type: 'checkbox', checked: row.not, onChange: e => { row.not = e.target.checked; commit(); render() } }),
        'not'))
      line.appendChild(h('select', {
        class: 'policy-field__control',
        'aria-label': `${label} block type`,
        onChange: e => { row.atom = makeAtom(e.target.value); commit(); render() }
      }, ATOM_KINDS.map(item => option(item.id, item.label, item.id === kind))))
      if (atom.type === 'compare') {
        line.appendChild(h('select', {
          class: 'policy-field__control policy-cond__op',
          'aria-label': `${label} operator`,
          onChange: e => { atom.op = e.target.value; commit(); render() }
        }, ['<', '<=', '>', '>='].map(op => option(op, op, atom.op === op))))
        const isHp = atom.field === 'hp'
        line.appendChild(h('input', {
          class: 'policy-field__control policy-cond__value',
          type: 'number',
          min: 0,
          max: isHp ? 100 : 99,
          step: 1,
          value: isHp ? Math.round(atom.value * 100) : atom.value,
          'aria-label': isHp ? `${label} hit points percent` : `${label} tiles`,
          onChange: e => {
            const raw = Number(e.target.value)
            atom.value = isHp ? raw / 100 : raw
            commit()
            render()
          }
        }))
        line.appendChild(h('span', { class: 'policy-cond__unit', text: isHp ? '%' : 'tiles' }))
      }
      line.appendChild(h('button', {
        class: 'policy-icon-btn',
        type: 'button',
        'aria-label': 'Remove block',
        text: '×',
        onClick: () => { rows.rows.splice(index, 1); commit(); render() }
      }))
      wrap.appendChild(line)
    })
    wrap.appendChild(h('button', {
      class: 'policy-btn policy-btn--small',
      type: 'button',
      text: '+ block',
      onClick: () => { rows.rows.push({ not: false, atom: makeAtom('hp') }); commit(); render() }
    }))
    return wrap
  }

  function transitionBlock(state, transition) {
    const block = h('div', { class: `policy-rule policy-rule--${transition.kind}` })
    block.appendChild(h('div', { class: 'policy-rule__head' },
      h('select', {
        class: 'policy-field__control policy-rule__kind',
        'aria-label': 'Rule kind',
        onChange: e => {
          transition.kind = e.target.value
          if (transition.kind !== 'while') delete transition.until
          render()
        }
      }, option('if', 'IF  (fires once)', transition.kind === 'if'), option('while', 'WHILE  (stays in effect)', transition.kind === 'while')),
      h('button', {
        class: 'policy-icon-btn',
        type: 'button',
        'aria-label': 'Remove rule',
        text: '×',
        onClick: () => {
          state.transitions = state.transitions.filter(item => item !== transition)
          render()
        }
      })))
    block.appendChild(conditionEditor(transition.when, value => { transition.when = value; updateValidity() }, 'Condition'))
    block.appendChild(h('div', { class: 'policy-rule__target' },
      h('span', { text: 'then go to' }),
      stateSelect(transition.to, value => { transition.to = value; render() }, 'Target state')))
    if (transition.kind === 'while') {
      const custom = transition.until != null
      block.appendChild(h('label', { class: 'policy-rule__until-toggle' },
        h('input', {
          type: 'checkbox',
          checked: custom,
          onChange: e => {
            if (e.target.checked) transition.until = { type: 'not', of: clone(transition.when) }
            else delete transition.until
            render()
          }
        }),
        'Use a custom end condition (default: ends when the condition stops being true)'))
      if (custom) {
        block.appendChild(h('div', { class: 'policy-rule__until' },
          h('span', { text: 'until' }),
          conditionEditor(transition.until, value => { transition.until = value; updateValidity() }, 'End condition')))
      }
    }
    return block
  }

  function stateCard(state, index) {
    const isStart = draft.initialStateId === state.id
    const card = h('section', { class: `policy-state${isStart ? ' is-start' : ''}` })
    const nameInput = h('input', {
      class: 'policy-field__control policy-state__name',
      type: 'text',
      value: state.name,
      maxlength: 40,
      'aria-label': `State ${index + 1} name`,
      onInput: e => { state.name = e.target.value; updateValidity() },
      onChange: () => render()
    })
    card.appendChild(h('div', { class: 'policy-state__head' },
      h('span', { class: 'policy-state__index', text: String(index + 1) }),
      nameInput,
      h('label', { class: 'policy-state__start' },
        h('input', {
          type: 'radio',
          name: 'policyStart',
          checked: isStart,
          onChange: () => { draft.initialStateId = state.id; render() }
        }),
        'start'),
      h('button', {
        class: 'policy-icon-btn',
        type: 'button',
        'aria-label': `Remove state ${index + 1}`,
        text: '🗑',
        disabled: draft.states.length <= 1,
        onClick: () => removeState(state.id)
      })))
    card.appendChild(h('label', { class: 'policy-state__effect' },
      h('span', { text: 'When entered, do' }),
      h('select', {
        class: 'policy-field__control',
        'aria-label': `State ${index + 1} action`,
        onChange: e => {
          state.effect = e.target.value ? { type: e.target.value } : null
          render()
        }
      }, option('', 'Nothing (wait)', !state.effect),
      Object.entries(EFFECT_LABELS).map(([id, label]) => option(id, label, state.effect?.type === id)))))
    ;(state.transitions || []).forEach(transition => card.appendChild(transitionBlock(state, transition)))
    card.appendChild(h('button', {
      class: 'policy-btn policy-btn--small',
      type: 'button',
      text: '+ rule',
      onClick: () => {
        const target = draft.states.find(item => item.id !== state.id) || state
        state.transitions = state.transitions || []
        state.transitions.push({
          id: nextId('rule', allTransitionIds(draft)),
          kind: 'if',
          when: { type: 'compare', field: 'hp', op: '<', value: 0.25 },
          to: target.id
        })
        render()
      }
    }))
    return card
  }

  function removeState(stateId) {
    if (draft.states.length <= 1) return
    draft.states = draft.states.filter(state => state.id !== stateId)
    const fallback = draft.states[0].id
    if (draft.initialStateId === stateId) draft.initialStateId = fallback
    draft.states.forEach(state => {
      ;(state.transitions || []).forEach(transition => {
        if (transition.to === stateId) transition.to = fallback
      })
    })
    render()
  }

  function addState() {
    const taken = new Set(draft.states.map(state => state.id))
    const id = nextId('state', taken)
    draft.states.push({ id, name: `State ${draft.states.length + 1}`, effect: null, transitions: [] })
    render()
    const last = body.querySelector('.policy-state:last-of-type')
    if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' })
  }

  function diagram() {
    const states = draft.states
    const width = 560
    const height = states.length <= 3 ? 130 : 210
    const cx = width / 2
    const cy = height / 2
    const radiusX = states.length <= 3 ? 200 : 210
    const radiusY = states.length <= 3 ? 0 : 68
    const points = new Map()
    states.forEach((state, index) => {
      const count = states.length
      let x
      let y
      if (count <= 3) {
        x = count === 1 ? cx : 70 + (index * (width - 140)) / (count - 1)
        y = cy
      } else {
        const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
        x = cx + Math.cos(angle) * radiusX
        y = cy + Math.sin(angle) * radiusY
      }
      points.set(state.id, { x, y })
    })
    const root = svg('svg', { class: 'policy-diagram', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'State machine diagram' })
    root.appendChild(svg('defs', null,
      ...[['if', '#4f9cff'], ['while', '#ffb300']].map(([kind, color]) =>
        svg('marker', { id: `policyArrow-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' },
          svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: color })))))
    states.forEach(state => {
      ;(state.transitions || []).forEach((transition, tIndex) => {
        const from = points.get(state.id)
        const to = points.get(transition.to)
        if (!from || !to) return
        const color = transition.kind === 'while' ? '#ffb300' : '#4f9cff'
        if (from === to) {
          root.appendChild(svg('path', {
            d: `M${from.x - 8},${from.y - 18} C${from.x - 30},${from.y - 58} ${from.x + 30},${from.y - 58} ${from.x + 8},${from.y - 18}`,
            fill: 'none', stroke: color, 'stroke-width': 2, 'marker-end': `url(#policyArrow-${transition.kind})`
          }))
          return
        }
        const dx = to.x - from.x
        const dy = to.y - from.y
        const dist = Math.hypot(dx, dy) || 1
        const nx = -dy / dist
        const ny = dx / dist
        const bend = 18 + tIndex * 6
        const sx = from.x + (dx / dist) * 20
        const sy = from.y + (dy / dist) * 20
        const ex = to.x - (dx / dist) * 24
        const ey = to.y - (dy / dist) * 24
        const mx = (sx + ex) / 2 + nx * bend
        const my = (sy + ey) / 2 + ny * bend
        root.appendChild(svg('path', {
          d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`,
          fill: 'none', stroke: color, 'stroke-width': 2, 'marker-end': `url(#policyArrow-${transition.kind})`
        }))
        root.appendChild(svg('text', {
          x: mx, y: my - 3, fill: color, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle'
        }, document.createTextNode(transition.kind.toUpperCase())))
      })
    })
    states.forEach((state, index) => {
      const point = points.get(state.id)
      const start = state.id === draft.initialStateId
      root.appendChild(svg('circle', {
        cx: point.x, cy: point.y, r: 18, fill: '#182430', stroke: start ? '#7ee787' : '#8fb4d6', 'stroke-width': start ? 3 : 1.5
      }))
      root.appendChild(svg('text', {
        x: point.x, y: point.y + 4, fill: '#fff', 'font-size': 12, 'font-weight': 700, 'text-anchor': 'middle'
      }, document.createTextNode(String(index + 1))))
      root.appendChild(svg('text', {
        x: point.x, y: point.y + 34, fill: '#cfe0f0', 'font-size': 10, 'text-anchor': 'middle'
      }, document.createTextNode((state.name || state.id).slice(0, 18))))
    })
    return root
  }

  function settingsSection() {
    return h('section', { class: 'policy-settings' },
      h('label', { class: 'policy-field' },
        h('span', { text: 'Name' }),
        h('input', {
          class: 'policy-field__control',
          type: 'text',
          value: draft.name,
          maxlength: 60,
          'aria-label': 'Policy name',
          onInput: e => { draft.name = e.target.value; updateValidity() }
        })),
      h('label', { class: 'policy-field' },
        h('span', { text: 'Applies to' }),
        h('select', { class: 'policy-field__control', 'aria-label': 'Scope', onChange: e => { draft.scope = e.target.value; updateValidity() } },
          option('perUnit', 'One unit (apply from its radial menu)', draft.scope === 'perUnit'),
          option('global', 'All my units (always active once enabled)', draft.scope === 'global'))),
      h('label', { class: 'policy-field' },
        h('span', { text: 'Runs' }),
        h('select', { class: 'policy-field__control', 'aria-label': 'Execution', onChange: e => { draft.execution = e.target.value; updateValidity() } },
          option('continuous', 'Continuous (keeps evaluating)', draft.execution === 'continuous'),
          option('oneTime', 'One-time (starts now, ends after it fired)', draft.execution === 'oneTime'))),
      isNew
        ? h('label', { class: 'policy-field' },
          h('span', { text: 'Start from' }),
          h('select', {
            class: 'policy-field__control',
            'aria-label': 'Template',
            onChange: e => {
              templateChoice = e.target.value
              const template = POLICY_TEMPLATES.find(item => item.id === templateChoice)
              const id = draft.id
              draft = template ? template.create(id) : createBlankPolicy(id)
              render()
            }
          }, option('', 'Blank policy', templateChoice === ''),
          POLICY_TEMPLATES.map(item => option(item.id, item.label, templateChoice === item.id))))
        : null)
  }

  function render() {
    const scrollTop = body.scrollTop
    body.replaceChildren(
      settingsSection(),
      h('section', { class: 'policy-diagram-wrap' },
        h('h3', { text: 'State machine' }),
        diagram(),
        h('p', { class: 'policy-hint', text: `A policy is a state machine of at most ${MAX_POLICY_STATES} states. IF rules fire once; WHILE rules hold their state until the end condition. A direct order always wins when it is given.` })),
      h('section', { class: 'policy-states' },
        h('h3', { text: 'States' }),
        draft.states.map(stateCard),
        h('button', { class: 'policy-btn', type: 'button', text: '+ Add state', onClick: addState }))
    )
    body.scrollTop = scrollTop
    updateValidity()
  }

  function close(saved) {
    if (!active) return
    document.removeEventListener('keydown', onKeyDown, true)
    backdrop.remove()
    active = null
    resumeSimulation()
    closeListeners.forEach(listener => listener({ saved: Boolean(saved), policyId: draft.id }))
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close(false)
    }
  }

  function save() {
    draft.schemaVersion = POLICY_SCHEMA_VERSION
    const result = savePolicy(owner, draft)
    if (!result.ok) {
      updateValidity()
      return
    }
    close(true)
  }

  closeButton.addEventListener('click', () => close(false))
  cancelButton.addEventListener('click', () => close(false))
  saveButton.addEventListener('click', save)
  backdrop.addEventListener('mousedown', event => {
    if (event.target === backdrop) event.stopPropagation()
  })
  document.addEventListener('keydown', onKeyDown, true)

  render()
  const api = { close, getDraft: () => draft }
  active = { api }
  const firstField = dialog.querySelector('input[type="text"]')
  if (firstField) firstField.focus()
  return api
}
