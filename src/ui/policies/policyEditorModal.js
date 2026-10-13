// Visual block builder for unit policies. A modal that pauses the simulation
// while it is open. No source code: states, rules and conditions are blocks.

import './policies.css'
import { createAutomationDraft } from '../../automation/automationDraft.js'
import { createCFBLEditor } from './cfblEditor.js'
import { attachAutomationViewport } from './automationViewport.js'
import { gameState } from '../../gameState.js'
import {
  MAX_POLICY_STATES,
  POLICY_VARIANTS,
  describePolicyProblem,
  validatePolicy
} from '../../policies/policySchema.js'
import { createBlankPolicy, createPolicyId, templatesForVariant } from '../../policies/policyTemplates.js'
import { getPolicyDocument, setPolicyEnabled } from '../../policies/policyStore.js'
import { DEFAULT_AFTER_DELAY_SECONDS, MAX_AFTER_DELAY_SECONDS, MIN_AFTER_DELAY_SECONDS, joinDelay, splitDelay } from '../../policies/policyDelay.js'
import { h, option, svg } from './policyDom.js'
import {
  COMPARE_OPERATORS,
  MAX_EDITOR_DEPTH,
  atomGroupsFor,
  atomKind,
  compareValueView,
  conditionToTree,
  defaultRuleAtom,
  effectGroupsFor,
  makeAtom,
  setCompareMode,
  treeToCondition
} from './conditionRows.js'
import { CHECKS, NUMERIC_FIELDS, effectiveMode, fieldModes } from '../../policies/policyConditions.js'
import { EFFECTS, defaultEffectParams, completionWaitKind } from '../../policies/policyEffects.js'
import { defenceCapabilityReason } from '../../policies/defenceCapabilities.js'

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
    const wantedVariant = ['build', 'unitBuild', 'defence'].includes(options.variant) ? options.variant : 'unit'
    const template = templatesForVariant(wantedVariant).find(item => item.id === options.templateId)
    draft = template ? template.create(createPolicyId()) : createBlankPolicy(createPolicyId(), wantedVariant)
  }

  const controller = createAutomationDraft(owner, draft)
  draft = controller.getSnapshot().policy
  let view = controller.getSnapshot().viewPreference || 'dav'
  function capabilityReason(kind, name, mode) {
    if (draft.variant !== 'defence' || draft.scope === 'global' || !options.defenceBuilding) return null
    if (['always', 'underFire', 'enemyInRange'].includes(name)) return null
    return defenceCapabilityReason(options.defenceBuilding, kind, name, mode)
  }
  const textView = createCFBLEditor(controller, { capabilityReason })
  function capabilityOption(value, label, selected, kind, name = value) {
    const reason = capabilityReason(kind, name)
    const control = option(value, reason ? `${label} — ${reason.replaceAll('-', ' ')}` : label, selected)
    control.disabled = Boolean(reason)
    return control
  }
  let templateChoice = ''
  pauseSimulation()

  const backdrop = h('div', { class: 'policy-editor-backdrop' })
  const dialog = h('div', { class: 'policy-editor', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'policyEditorTitle' })
  const titleEl = h('h2', { id: 'policyEditorTitle' })
  const alertIcon = h('div', { class: 'policy-editor__alert-icon', role: 'img', 'aria-label': 'Invalid automation' }, '!')
  const reason = h('div', { class: 'policy-editor__reason', role: 'alert' })
  const stateCount = h('span', { class: 'policy-editor__chip' })
  const body = h('div', { class: 'policy-editor__body' })
  const saveButton = h('button', { class: 'policy-btn policy-btn--primary', type: 'button', text: 'Save automation' })
  const cancelButton = h('button', { class: 'policy-btn', type: 'button', text: 'Cancel' })
  const closeButton = h('button', { class: 'policy-editor__close', type: 'button', 'aria-label': 'Close editor', text: '×' })

  const buttonsToggle = h('button', { type: 'button', class: 'policy-editor__tab', 'aria-label': 'Default automation view', text: 'Buttons', onClick: () => switchView('dav') })
  const textToggle = h('button', { type: 'button', class: 'policy-editor__tab', 'aria-label': 'Automation text view', text: 'CFBL', onClick: () => switchView('atv') })
  dialog.append(
    h('header', { class: 'policy-editor__header' },
      titleEl,
      h('div', { class: 'policy-editor__view-toggle', role: 'group', 'aria-label': 'Automation editor view' }, buttonsToggle, textToggle),
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
  const cleanupViewport = attachAutomationViewport(backdrop, dialog)

  const isBuildDraft = () => draft.variant === 'build'
  const isUnitBuildDraft = () => draft.variant === 'unitBuild'
  const isAutomationDraft = () => isBuildDraft() || isUnitBuildDraft()

  function updateTitle() {
    titleEl.textContent = `Automation${draft.name ? ` · ${draft.name}` : ''}`
    dialog.classList.toggle('is-build-policy', isAutomationDraft())
    buttonsToggle.setAttribute('aria-pressed', String(view === 'dav'))
    textToggle.setAttribute('aria-pressed', String(view === 'atv'))
  }

  function synchronize() {
    const snapshot = controller.getSnapshot()
    if (JSON.stringify(snapshot.policy) === JSON.stringify(draft)) return { ok: true }
    return controller.transact(() => clone(draft))
  }

  function switchView(next) {
    const result = view === 'dav' ? synchronize() : { ok: true }
    if (!result.ok) { reason.textContent = result.reason || 'Complete valid settings before changing view.'; return }
    controller.setView(next)
    view = next
    draft = controller.getSnapshot().policy
    render()
  }

  function updateValidity() {
    if (view === 'dav') synchronize()
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
      draft.states.map((state, index) => option(state.id, `State ${index + 1}`, state.id === value)))
    return select
  }

  function optionGroup(label, options) {
    return h('optgroup', { label }, options)
  }

  function paramSelects(meta, atom, label, commit) {
    return (meta.params || []).map(param => h('label', { class: 'policy-cond__param' },
      h('span', { text: param.label }),
      h('select', {
        class: 'policy-field__control',
        'aria-label': `${label} ${param.label}`,
        onChange: e => { atom[param.key] = e.target.value; commit() }
      }, param.options.filter(item => !(draft.variant === 'defence' && param.key === 'kind' && (atom.field === 'distance' || atom.check === 'canAttack') && item.value !== 'unit')).map(item => option(item.value, item.label, (atom[param.key] ?? param.default) === item.value)))))
  }

  function leafControls(node, label, commit) {
    const atom = node.atom
    const kind = atomKind(atom)
    const controls = [h('select', {
      class: 'policy-field__control policy-cond__kind',
      'aria-label': `${label} block type`,
      onChange: e => {
        node.atom = makeAtom(e.target.value)
        if (draft.variant === 'defence' && node.atom.field === 'turretRotation') setCompareMode(node.atom, 'absolute')
        commit()
      }
    }, atomGroupsFor(draft.variant).map(group => optionGroup(group.label, group.kinds.map(item => capabilityOption(item.id, item.label, item.id === kind, item.id.startsWith('compare:') ? 'fields' : 'checks', item.id.split(':')[1] || item.id)))))]

    if (atom.type === 'compare') {
      const meta = NUMERIC_FIELDS[atom.field]
      if (fieldModes(atom.field).length > 1 && !(draft.variant === 'defence' && atom.field === 'turretRotation')) {
        controls.push(h('select', {
          class: 'policy-field__control policy-cond__mode',
          'aria-label': `${label} compare as`,
          onChange: e => { setCompareMode(atom, e.target.value); commit() }
        }, fieldModes(atom.field).map(mode => option(mode, mode === 'relative' ? 'relative' : 'absolute', effectiveMode(atom) === mode))))
      }
      controls.push(h('select', {
        class: 'policy-field__control policy-cond__op',
        'aria-label': `${label} operator`,
        onChange: e => { atom.op = e.target.value; commit() }
      }, COMPARE_OPERATORS.map(op => option(op, op, atom.op === op))))
      const view = compareValueView(atom)
      controls.push(h('input', {
        class: 'policy-field__control policy-cond__value',
        type: 'number',
        min: view.min,
        max: view.max,
        step: view.step,
        value: Math.round(atom.value * view.scale * 100) / 100,
        'aria-label': `${label} value`,
        onChange: e => {
          const raw = Number(e.target.value)
          if (!e.target.value.trim() || !Number.isFinite(raw) || raw < view.min || raw > view.max) { e.target.setCustomValidity('Enter a value within the displayed range.'); return }
          e.target.setCustomValidity('')
          atom.value = raw / view.scale
          commit()
        }
      }))
      if (view.suffix) controls.push(h('span', { class: 'policy-cond__unit', text: view.suffix }))
      controls.push(...paramSelects(meta, atom, label, commit))
    } else if (atom.type === 'check') {
      controls.push(...paramSelects(CHECKS[atom.check], atom, label, commit))
    }
    return controls
  }

  function conditionNode(node, depth, label, commit, onRemove, joinMode) {
    const line = h('div', { class: `policy-cond__row${node.children ? ' policy-cond__row--group' : ''}` })
    if (joinMode) line.appendChild(joinMode)
    line.appendChild(h('label', { class: 'policy-cond__not' },
      h('input', { type: 'checkbox', checked: node.not, 'aria-label': `${label} not`, onChange: e => { node.not = e.target.checked; commit() } }),
      'not'))
    if (!node.children) {
      leafControls(node, label, commit).forEach(control => line.appendChild(control))
      if (depth < MAX_EDITOR_DEPTH) {
        line.appendChild(h('button', {
          class: 'policy-btn policy-btn--small policy-cond__group-action',
          type: 'button',
          text: 'Group conditions',
          'aria-label': `${label} turn into group`,
          onClick: () => {
            const leaf = node.atom
            delete node.atom
            node.mode = 'and'
            node.children = [
              { not: false, atom: leaf },
              { not: false, atom: defaultRuleAtom(draft.variant) }
            ]
            commit()
          }
        }))
      }
    } else {
      line.appendChild(h('span', {
        class: 'policy-cond__groupmark',
        text: node.mode === 'and' ? 'Match all conditions' : 'Match any condition'
      }))
    }
    if (onRemove) {
      line.appendChild(h('button', { class: 'policy-icon-btn', type: 'button', 'aria-label': 'Remove block', text: '×', onClick: onRemove }))
    }
    if (!node.children) return line

    const group = h('div', { class: 'policy-cond__group' }, line)
    const children = h('div', { class: 'policy-cond__children' })
    node.children.forEach((child, index) => {
      const join = index > 0
        ? h('select', {
          class: 'policy-field__control policy-cond__join',
          'aria-label': `${label} combine`,
          onChange: e => { node.mode = e.target.value; commit() }
        }, option('and', 'and', node.mode === 'and'), option('or', 'or', node.mode === 'or'))
        : null
      children.appendChild(conditionNode(
        child, depth + 1, label, commit,
        () => { node.children.splice(index, 1); commit() }, join
      ))
    })
    children.appendChild(h('button', {
      class: 'policy-btn policy-btn--small policy-cond__add-action',
      type: 'button',
      text: '+ Add condition',
      onClick: () => { node.children.push({ not: false, atom: defaultRuleAtom(draft.variant) }); commit() }
    }))
    group.appendChild(children)
    return group
  }

  function conditionEditor(condition, onChange, label) {
    const tree = conditionToTree(condition)
    const wrap = h('div', { class: 'policy-cond' })
    const commit = () => { onChange(treeToCondition(tree)); render() }
    wrap.appendChild(conditionNode(tree, 1, label, commit, null, null))
    if (!tree.children) {
      wrap.appendChild(h('button', {
        class: 'policy-btn policy-btn--small policy-cond__add-action',
        type: 'button',
        text: '+ Add condition',
        onClick: () => {
          const first = tree.atom
          delete tree.atom
          tree.mode = 'and'
          tree.children = [{ not: false, atom: first }, { not: false, atom: defaultRuleAtom(draft.variant) }]
          commit()
        }
      }))
    }
    return wrap
  }

  function effectParamControls(state, index) {
    const meta = EFFECTS[state.effect && state.effect.type]
    if (!meta) return []
    const controls = (meta.params || []).map(param => {
      const value = state.effect[param.key] !== undefined ? state.effect[param.key] : param.default
      if (param.options) {
        return h('select', {
          class: 'policy-field__control policy-state__param',
          'aria-label': `State ${index + 1} ${param.label}`,
          onChange: e => { state.effect[param.key] = e.target.value; render() }
        }, param.options.map(item => option(item.value, item.label, item.value === value)))
      }
      return h('span', { class: 'policy-state__param-wrap' },
        h('input', {
          class: 'policy-field__control policy-state__param',
          type: 'number',
          min: param.min,
          max: param.max,
          step: 1,
          value,
          'aria-label': `State ${index + 1} ${param.label}`,
          onChange: e => { const value = Number(e.target.value); if (!e.target.value.trim() || !Number.isInteger(value) || value < param.min || value > param.max) return; state.effect[param.key] = value; render() }
        }),
        h('span', { class: 'policy-cond__unit', text: param.label }))
    })
    const waitKind = completionWaitKind(state.effect.type, draft.variant)
    if (waitKind) controls.push(h('label', { class: 'policy-state__completion' },
      h('input', { type: 'checkbox', checked: state.effect.waitForCompletion === true,
        'aria-label': `State ${index + 1} wait until ${waitKind}`,
        onChange: event => { if (event.target.checked) state.effect.waitForCompletion = true; else delete state.effect.waitForCompletion; render() } }),
      h('span', { text: `Wait until ${waitKind}` })))
    return controls
  }

  function delayEditor(transition) {
    const { minutes, seconds } = splitDelay(transition.delaySeconds)
    const field = (value, label, max) => h('input', {
      class: 'policy-field__control policy-rule__delay-input',
      type: 'number',
      min: 0,
      max,
      step: 1,
      value,
      'aria-label': label
    })
    const minuteInput = field(minutes, 'Delay minutes', MAX_AFTER_DELAY_SECONDS / 60)
    const secondInput = field(seconds, 'Delay seconds', 59)
    const apply = () => {
      transition.delaySeconds = Math.min(MAX_AFTER_DELAY_SECONDS, joinDelay(minuteInput.value, secondInput.value))
      const parts = splitDelay(transition.delaySeconds)
      minuteInput.value = String(parts.minutes)
      secondInput.value = String(parts.seconds)
      updateValidity()
    }
    minuteInput.addEventListener('change', apply)
    secondInput.addEventListener('change', apply)
    return h('div', { class: 'policy-rule__delay' },
      h('span', { text: 'wait' }),
      minuteInput,
      h('span', { text: 'min' }),
      secondInput,
      h('span', { text: 'sec after the condition becomes true' }))
  }

  function transitionBlock(state, transition) {
    const block = h('div', { class: `policy-rule policy-rule--${transition.kind}` })
    block.appendChild(h('div', { class: 'policy-rule__head' },
      h('select', {
        class: 'policy-field__control policy-rule__kind',
        'aria-label': 'Rule kind',
        onChange: e => {
          if (transition.elseTo && e.target.value !== 'if') {
            if (!window.confirm('Changing this IF rule removes its ELSE alternative. Continue?')) { e.target.value = transition.kind; return }
            delete transition.elseTo
            delete transition.elseId
          }
          transition.kind = e.target.value
          if (transition.kind !== 'while') delete transition.until
          if (transition.kind === 'after') {
            if (!(transition.delaySeconds >= MIN_AFTER_DELAY_SECONDS)) transition.delaySeconds = DEFAULT_AFTER_DELAY_SECONDS
          } else {
            delete transition.delaySeconds
          }
          render()
        }
      },
      option('if', 'IF  (fires once)', transition.kind === 'if'),
      option('while', 'WHILE  (stays in effect)', transition.kind === 'while'),
      option('after', 'AFTER  (waits, then fires once)', transition.kind === 'after')),
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
    const ruleIndex = state.transitions.indexOf(transition)
    block.appendChild(h('div', null, ...[-1, 1].map(direction => h('button', { type: 'button', class: 'policy-btn', text: direction < 0 ? 'Earlier rule' : 'Later rule', disabled: ruleIndex + direction < 0 || ruleIndex + direction >= state.transitions.length, onClick: () => { state.transitions.splice(ruleIndex, 1); state.transitions.splice(ruleIndex + direction, 0, transition); render() } }))))
    block.appendChild(h('p', {
      class: 'policy-rule__help',
      text: transition.kind === 'while'
        ? 'WHILE keeps the target state active for as long as these conditions match.'
        : transition.kind === 'after'
          ? 'AFTER waits while the conditions still match, then changes state once.'
          : 'IF changes state once when these conditions become true.'
    }))
    block.appendChild(conditionEditor(transition.when, value => { transition.when = value; updateValidity() }, 'Condition'))
    if (transition.kind === 'after') block.appendChild(delayEditor(transition))
    block.appendChild(h('div', { class: 'policy-rule__target' },
      h('span', { text: 'then go to' }),
      stateSelect(transition.to, value => { transition.to = value; render() }, 'Target state')))
    if (transition.kind === 'if') {
      if (transition.elseTo) {
        block.appendChild(h('div', { class: 'policy-rule__target' }, h('span', { text: 'ELSE go to' }),
          stateSelect(transition.elseTo, value => { transition.elseTo = value; render() }, 'ELSE target state'),
          h('button', { type: 'button', class: 'policy-btn', text: 'Remove ELSE', onClick: () => { delete transition.elseTo; delete transition.elseId; render() } })))
        block.appendChild(h('p', { class: 'policy-rule__help', text: 'This IF/ELSE pair always takes a branch and can preempt later rules.' }))
      } else block.appendChild(h('button', { type: 'button', class: 'policy-btn', text: 'Add ELSE', onClick: () => { transition.elseTo = state.id; render() } }))
    }
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
    const nameInput = h('strong', { text: `State ${index + 1}` })
    card.appendChild(h('div', { class: 'policy-state__head' },
      h('span', { class: 'policy-state__index', text: String(index + 1) }),
      nameInput,
      ...[-1, 1].map(direction => h('button', { type: 'button', class: 'policy-icon-btn', text: direction < 0 ? '↑' : '↓', 'aria-label': `Move state ${index + 1} ${direction < 0 ? 'up' : 'down'}`, disabled: index + direction < 0 || index + direction >= draft.states.length, onClick: () => { draft.states.splice(index, 1); draft.states.splice(index + direction, 0, state); render() } })),
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
          state.effect = e.target.value ? { type: e.target.value, ...defaultEffectParams(e.target.value) } : null
          render()
        }
      }, option('', 'Nothing (wait)', !state.effect),
      effectGroupsFor(draft.variant).map(group => optionGroup(group.label,
        group.effects.map(item => capabilityOption(item.type, item.label, state.effect?.type === item.type, 'actions'))))),
      effectParamControls(state, index)))
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
          when: isAutomationDraft() ? defaultRuleAtom(draft.variant) : { type: 'compare', field: 'hp', op: '<', value: 0.25 },
          to: target.id
        })
        render()
      }
    }))
    return card
  }

  function removeState(stateId) {
    if (draft.states.length <= 1) return
    const affected = []
    if (draft.initialStateId === stateId) affected.push('initial state')
    draft.states.forEach((state, index) => (state.transitions || []).forEach(rule => {
      if (rule.to === stateId) affected.push(`State ${index + 1}: ${rule.kind.toUpperCase()} target`)
      if (rule.elseTo === stateId) affected.push(`State ${index + 1}: ELSE target`)
    }))
    const remaining = draft.states.filter(state => state.id !== stateId)
    if (!affected.length) { draft.states = remaining; render(); return }
    const repair = h('section', { class: 'policy-state-repair', role: 'group', 'aria-label': 'Repair state references' },
      h('p', { text: `Deleting this state affects: ${affected.join(', ')}. Choose a replacement before confirming.` }))
    const select = h('select', { class: 'policy-field__control', 'aria-label': 'Replacement state' }, remaining.map(state => option(state.id, `State ${draft.states.indexOf(state) + 1}`)))
    repair.append(select,
      h('button', { type: 'button', class: 'policy-btn', text: 'Delete and repair references', onClick: () => {
        const replacement = select.value
        draft.states = remaining
        if (draft.initialStateId === stateId) draft.initialStateId = replacement
        draft.states.forEach(state => (state.transitions || []).forEach(rule => {
          if (rule.to === stateId) rule.to = replacement
          if (rule.elseTo === stateId) rule.elseTo = replacement
        }))
        render()
      } }),
      h('button', { type: 'button', class: 'policy-btn', text: 'Cancel deletion', onClick: () => repair.remove() }))
    body.prepend(repair)
    select.focus()
  }

  function addState() {
    if (draft.states.length >= MAX_POLICY_STATES) return
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
      ...[['if', '#4f9cff'], ['else', '#7ee787'], ['while', '#ffb300'], ['after', '#c792ea']].map(([kind, color]) =>
        svg('marker', { id: `policyArrow-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' },
          svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: color })))))
    states.forEach(state => {
      ;(state.transitions || []).flatMap(rule => rule.kind === 'if' && rule.elseTo ? [rule, { ...rule, kind: 'else', to: rule.elseTo }] : [rule]).forEach((transition, tIndex) => {
        const from = points.get(state.id)
        const to = points.get(transition.to)
        if (!from || !to) return
        const color = transition.kind === 'else' ? '#7ee787' : transition.kind === 'while' ? '#ffb300' : transition.kind === 'after' ? '#c792ea' : '#4f9cff'
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
      }, document.createTextNode(`State ${index + 1}`)))
    })
    return root
  }

  function settingsSection() {
    return h('section', { class: 'policy-settings' },
      h('div', { class: 'policy-section-heading policy-settings__heading' },
        h('h3', { text: 'Automation setup' }),
        h('p', { text: 'Choose what this automation controls and how often it runs.' })),
      h('label', { class: 'policy-field' },
        h('span', { text: 'Name' }),
        h('input', {
          class: 'policy-field__control',
          type: 'text',
          value: draft.name,
          maxlength: 60,
          'aria-label': 'Automation name',
          onInput: e => { draft.name = e.target.value; updateValidity() }
        })),
      isNew
        ? h('label', { class: 'policy-field' },
          h('span', { text: 'Automation type' }),
          h('select', {
            class: 'policy-field__control',
            'aria-label': 'Automation type',
            onChange: e => {
              if (controller.getSnapshot().canUndo && !window.confirm('Changing automation type discards this draft. Continue?')) { e.target.value = draft.variant; return }
              templateChoice = ''
              draft = createBlankPolicy(draft.id, e.target.value)
              render()
            }
          },
          option('unit', 'Control → Unit', draft.variant === 'unit'),
          POLICY_VARIANTS.includes('defence') ? option('defence', 'Control → Defence building', draft.variant === 'defence') : null,
          option('build', 'Build → Building', isBuildDraft()),
          option('unitBuild', 'Build → Unit', isUnitBuildDraft())))
        : h('div', { class: 'policy-field' },
          h('span', { text: 'Automation type' }),
          h('span', { class: 'policy-editor__chip', text: isBuildDraft() ? 'Build → Building' : isUnitBuildDraft() ? 'Build → Unit' : draft.variant === 'defence' ? 'Control → Defence building' : 'Control → Unit' })),
      isAutomationDraft()
        ? h('div', { class: 'policy-field' },
          h('span', { text: 'Applies to' }),
          h('span', { class: 'policy-editor__chip', text: isBuildDraft() ? 'My base (when Base automation is on)' : 'My production queue (when Unit build automation is on)' }))
        : h('label', { class: 'policy-field' },
          h('span', { text: 'Applies to' }),
          h('select', { class: 'policy-field__control', 'aria-label': 'Scope', onChange: e => { draft.scope = e.target.value; updateValidity() } },
            option('perUnit', draft.variant === 'defence' ? 'One defence building (apply from its menu)' : 'One unit (apply from its radial menu)', draft.scope === 'perUnit'),
            option('global', draft.variant === 'defence' ? 'All my defence buildings' : 'All my units (always active once enabled)', draft.scope === 'global'))),
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
              const template = templatesForVariant(draft.variant).find(item => item.id === templateChoice)
              const id = draft.id
              draft = template ? template.create(id) : createBlankPolicy(id, draft.variant)
              render()
            }
          }, option('', 'Blank automation', templateChoice === ''),
          templatesForVariant(draft.variant).map(item => option(item.id, item.label, templateChoice === item.id))))
        : null)
  }

  function render() {
    if (view === 'dav') synchronize()
    updateTitle()
    if (view === 'atv') { draft = controller.getSnapshot().policy; body.replaceChildren(textView.element); updateValidity(); return }
    const scrollTop = body.scrollTop
    body.replaceChildren(
      settingsSection(),
      h('section', { class: 'policy-diagram-wrap' },
        h('div', { class: 'policy-section-heading' },
          h('h3', { text: 'How states connect' }),
          h('p', { text: 'Each numbered state performs an action. Arrows show which rules move automation to another state.' })),
        diagram(),
        h('p', {
          class: 'policy-hint',
          text: isBuildDraft()
            ? `A build automation is a state machine of at most ${MAX_POLICY_STATES} states. IF rules fire once; WHILE rules hold their state until the end condition; AFTER rules wait. Building goes through the normal build queue, so it only happens when you can afford it, the building is unlocked and there is room.`
            : isUnitBuildDraft()
              ? 'A unit build automation can stack 1–20 units per action. Each unit uses its normal factory, cost and build time, then receives the selected rally, attack, or defense order.'
              : `An automation is a state machine of at most ${MAX_POLICY_STATES} states. IF rules fire once; WHILE rules hold their state until the end condition. A direct order always wins when it is given.`
        })),
      h('section', { class: 'policy-states' },
        h('div', { class: 'policy-section-heading' },
          h('h3', { text: 'States and rules' }),
          h('p', { text: 'Set an action for each state, then add IF, WHILE, or AFTER rules to decide what happens next.' })),
        draft.states.map(stateCard),
        h('button', { class: 'policy-btn', type: 'button', text: '+ Add state', disabled: draft.states.length >= MAX_POLICY_STATES, onClick: addState }))
    )
    body.scrollTop = scrollTop
    updateValidity()
  }

  function close(saved) {
    if (!active) return
    document.removeEventListener('keydown', onKeyDown, true)
    unsubscribeDraft()
    textView.destroy()
    controller.cancel()
    cleanupViewport()
    backdrop.remove()
    active = null
    resumeSimulation()
    closeListeners.forEach(listener => listener({ saved: Boolean(saved), policyId: draft.id }))
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (view === 'atv' && textView.hasChoices()) { event.preventDefault(); event.stopPropagation(); textView.closeChoices(); return }
      event.stopPropagation()
      close(false)
    }
  }

  function save() {
    if (view === 'dav') synchronize()
    const result = controller.save()
    if (!result.ok) {
      updateValidity()
      return
    }
    if (isNew && controller.getSnapshot().policy.scope === 'global') {
      setPolicyEnabled(owner, draft.id, true)
    }
    close(true)
  }

  const unsubscribeDraft = controller.subscribe(snapshot => {
    if (view === 'atv') { draft = snapshot.policy; updateTitle(); updateValidity() }
  })

  closeButton.addEventListener('click', () => close(false))
  cancelButton.addEventListener('click', () => close(false))
  saveButton.addEventListener('click', save)
  backdrop.addEventListener('mousedown', event => {
    if (event.target === backdrop) event.stopPropagation()
  })
  document.addEventListener('keydown', onKeyDown, true)

  render()
  const api = { close, getDraft: () => controller.getSnapshot().policy, controller, switchView }
  active = { api }
  const firstField = view === 'atv' ? textView.input : dialog.querySelector('input[type="text"]')
  if (firstField) firstField.focus()
  return api
}
