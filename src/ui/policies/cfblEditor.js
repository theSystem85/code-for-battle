import './cfblEditor.css'
import { completionContext, parseCFBL } from '../../automation/cfbl/index.js'
import { validatePolicy } from '../../policies/policySchema.js'
import { NUMERIC_FIELDS, CHECKS } from '../../policies/policyConditions.js'
import { EFFECTS } from '../../policies/policyEffects.js'
import { h } from './policyDom.js'

export function fuzzyOptions(options, query) {
  const needle = query.toLowerCase().trim()
  if (!needle) return options
  return options.map((item, order) => {
    const text = `${item.label} ${item.value} ${item.description || ''}`.toLowerCase()
    const terms = [item.value, item.label].map(value => String(value || '').toLowerCase())
    let score = terms.includes(needle) ? 0 : terms.some(value => value.startsWith(needle)) ? 1 : text.includes(needle) ? 2 : 3
    let cursor = 0
    for (const letter of needle) {
      cursor = text.indexOf(letter, cursor)
      if (cursor < 0) { score = Infinity; break }
      cursor += 1
    }
    return { item, score, order }
  }).filter(row => Number.isFinite(row.score)).sort((a, b) => a.score - b.score || a.order - b.order).map(row => row.item)
}

/** Native input exposes accepted source; all provisional typing lives in the search field. */
export function createCFBLEditor(controller, { capabilityReason = () => null } = {}) {
  const help = h('p', { id: 'cfbl-help', text: 'Select a token, choose next token, or type to search legal choices. Enter or Tab selects; Escape closes choices. Shift+Tab leaves the editor.' })
  const mirror = h('pre', { class: 'cfbl-editor__mirror', 'aria-hidden': 'true' })
  const input = h('textarea', { class: 'cfbl-editor__input', 'aria-label': 'CFBL automation source', 'aria-describedby': 'cfbl-help', 'aria-autocomplete': 'list', 'aria-controls': 'cfbl-options', spellcheck: 'false', autocapitalize: 'off' })
  const search = h('input', { type: 'search', 'aria-label': 'Search legal CFBL options', 'aria-autocomplete': 'list', 'aria-controls': 'cfbl-options', placeholder: 'Search legal choices', class: 'policy-field__control' })
  const status = h('p', { role: 'status', 'aria-live': 'polite' })
  const list = h('div', { id: 'cfbl-options', role: 'listbox', 'aria-label': 'Legal CFBL choices' })
  const number = h('input', { type: 'number', class: 'policy-field__control', 'aria-label': 'CFBL numeric value' })
  const useNumber = h('button', { type: 'button', class: 'policy-btn', text: 'Use value' })
  const numeric = h('div', null, number, useNumber)
  const flyout = h('div', { class: 'cfbl-editor__flyout', hidden: true }, search, status, numeric, list,
    h('button', { type: 'button', class: 'policy-btn', text: 'Clear search', onClick: () => { search.value = ''; refreshOptions() } }))
  const root = h('section', { class: 'cfbl-editor' }, help,
    h('div', { class: 'cfbl-editor__toolbar' },
      h('button', { type: 'button', class: 'policy-btn', text: 'Choose next token', onClick: () => openChoices() }),
      h('button', { type: 'button', class: 'policy-btn', text: 'Undo', onClick: () => controller.undo() }),
      h('button', { type: 'button', class: 'policy-btn', text: 'Redo', onClick: () => controller.redo() })),
    h('div', { class: 'cfbl-editor__code' }, mirror, input), flyout)
  let source = ''
  let context = null
  let options = []
  let selected = 0
  let pageSize = 40
  let composing = false
  let selection = { start: 0, end: 0 }

  function paint(value) {
    mirror.replaceChildren()
    const tokens = parseCFBL(value).tokens || []
    let cursor = 0
    for (const token of tokens) {
      const start = token.start ?? token.range?.[0]
      const end = token.end ?? token.range?.[1]
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor) continue
      mirror.append(document.createTextNode(value.slice(cursor, start)))
      mirror.append(h('span', { class: `cfbl-token--${token.role || token.type || 'plain'}`, text: value.slice(start, end) }))
      cursor = end
    }
    mirror.append(document.createTextNode(value.slice(cursor) + '\n'))
  }

  function closeChoices() {
    flyout.hidden = true
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
    search.setAttribute('aria-expanded', 'false')
    search.removeAttribute('aria-activedescendant')
    search.value = ''
  }

  function apply(text, operation) {
    const disabled = context?.legalOptions.find(item => item.insertText === text && item.disabled)
    if (disabled) { status.textContent = disabled.description; return false }
    if (operation) {
      const result = controller.transact(operation)
      if (result.ok) { closeChoices(); input.focus(); return true }
      status.textContent = result.errors?.[0]?.message || result.reason
      return false
    }
    const edits = context.edits || selection
    const start = edits.start ?? selection.start
    const end = edits.end ?? selection.end
    const result = controller.setSource(source.slice(0, start) + text + source.slice(end))
    if (!result.ok) {
      status.textContent = result.errors?.[0]?.message || result.reason || 'This change is not valid here. Choose a complete legal construct.'
      return false
    }
    closeChoices()
    input.focus()
    const position = Math.min(start + text.length, source.length)
    input.setSelectionRange(position, position)
    return true
  }

  function refreshOptions() {
    options = fuzzyOptions(context?.legalOptions || [], search.value)
    selected = Math.min(selected, Math.max(0, options.length - 1))
    list.replaceChildren(...options.slice(0, pageSize).map((item, index) => h('button', {
      id: `cfbl-option-${index}`, role: 'option', type: 'button', class: 'cfbl-editor__option',
      'aria-selected': index === selected ? 'true' : 'false',
      disabled: Boolean(item.disabled),
      onClick: () => apply(item.insertText ?? item.value, item.operation)
    }, h('strong', { text: item.label || item.value }), h('code', { text: item.operation ? 'Whole source edit' : item.insertText ?? item.value }), h('span', { text: item.description || '' }))))
    if (options.length > pageSize) list.append(h('button', { type: 'button', class: 'policy-btn', text: 'Show more legal choices', onClick: () => { pageSize += 40; refreshOptions() } }))
    status.textContent = options.length ? `${options.length} legal choices available` : 'No matching legal choices. Clear search to see all choices.'
    if (options.length) { input.setAttribute('aria-activedescendant', `cfbl-option-${selected}`); search.setAttribute('aria-activedescendant', `cfbl-option-${selected}`) }
    const domain = context?.slot === 'state-index' ? null : context?.numericDomain
    numeric.hidden = !domain
    if (domain) {
      number.min = domain.min
      number.max = domain.max
      number.step = domain.integer ? '1' : 'any'
      number.value = domain.value ?? domain.default ?? domain.min ?? 0
      status.textContent += `. Number range ${domain.min}–${domain.max}${domain.integer ? ', whole numbers' : ''}. ${domain.unit || ''}`
    }
  }

  function structuralOptions() {
    const policy = controller.getSnapshot().policy
    const declarations = [...source.matchAll(/\bstate\s+(\d+)\s*\{/g)]
    const index = declarations.findLastIndex(match => match.index <= selection.start)
    if (index < 0 || !policy.states[index]) return []
    const state = policy.states[index]
    const options = []
    const offer = (value, label, operation) => {
      const candidate = operation(JSON.parse(JSON.stringify(policy)))
      if (validatePolicy(candidate).valid) options.push({ value, label, insertText: value, description: value.startsWith('delete-state-repair') ? `Affected references: ${[policy.initialStateId === state.id ? 'initial state' : '', ...policy.states.flatMap((item, stateIndex) => item.transitions.flatMap((rule, ruleIndex) => [rule.to === state.id ? `State ${stateIndex + 1} rule ${ruleIndex + 1} target` : '', rule.elseTo === state.id ? `State ${stateIndex + 1} rule ${ruleIndex + 1} ELSE target` : '']))].filter(Boolean).join(', ')}. All will point to the selected replacement.` : 'Apply this complete source transaction.', operation })
    }
    if (index > 0) offer('move-state-up', 'Move this state earlier', machine => { const [item] = machine.states.splice(index, 1); machine.states.splice(index - 1, 0, item); return machine })
    if (index < policy.states.length - 1) offer('move-state-down', 'Move this state later', machine => { const [item] = machine.states.splice(index, 1); machine.states.splice(index + 1, 0, item); return machine })
    offer('start-state', 'Use this state as start', machine => { machine.initialStateId = state.id; return machine })
    if (policy.states.length > 1) {
      const referenced = policy.initialStateId === state.id || policy.states.some(item => item.transitions.some(rule => rule.to === state.id || rule.elseTo === state.id))
      if (!referenced) offer('delete-state', 'Delete this unreferenced state', machine => { machine.states.splice(index, 1); return machine })
      else policy.states.filter(item => item.id !== state.id).forEach(replacement => offer(`delete-state-repair-${replacement.id}`, `Delete state and repair references to State ${policy.states.indexOf(replacement) + 1}`, machine => {
        machine.states.splice(index, 1)
        if (machine.initialStateId === state.id) machine.initialStateId = replacement.id
        machine.states.forEach(item => item.transitions.forEach(rule => { if (rule.to === state.id) rule.to = replacement.id; if (rule.elseTo === state.id) rule.elseTo = replacement.id }))
        return machine
      }))
    }
    const ranges = parseCFBL(source).ast.states[index].transitions
    const ruleIndex = ranges.findIndex(rule => rule.range?.start <= selection.start && rule.range?.end >= selection.end)
    const rule = state.transitions[ruleIndex]
    if (rule) {
      offer('delete-rule', 'Delete this rule and its ELSE', machine => { machine.states[index].transitions.splice(ruleIndex, 1); return machine })
      if (ruleIndex > 0) offer('move-rule-up', 'Move this rule earlier', machine => { const rules = machine.states[index].transitions; const [item] = rules.splice(ruleIndex, 1); rules.splice(ruleIndex - 1, 0, item); return machine })
      if (ruleIndex < state.transitions.length - 1) offer('move-rule-down', 'Move this rule later', machine => { const rules = machine.states[index].transitions; const [item] = rules.splice(ruleIndex, 1); rules.splice(ruleIndex + 1, 0, item); return machine })
      if (rule.kind === 'if') offer(rule.elseTo ? 'remove-else' : 'add-else', rule.elseTo ? 'Remove ELSE' : 'Add ELSE (may preempt later rules)', machine => {
        const item = machine.states[index].transitions[ruleIndex]
        if (item.elseTo) { delete item.elseTo; delete item.elseId } else item.elseTo = state.id
        return machine
      })
      if (rule.kind === 'while') offer(rule.until ? 'remove-until' : 'add-until', rule.until ? 'Remove UNTIL' : 'Add UNTIL condition', machine => {
        const item = machine.states[index].transitions[ruleIndex]
        if (item.until) delete item.until
        else item.until = { type: 'always' }
        return machine
      })
      const parsedRule = ranges[ruleIndex]
      const conditionKey = parsedRule.until?.range?.start <= selection.start && parsedRule.until?.range?.end >= selection.end ? 'until' : 'when'
      function selectedPath(node, path = []) {
        if (node.type === 'not' && node.of.range?.start <= selection.start && node.of.range?.end >= selection.end) return selectedPath(node.of, [...path, 'of'])
        if (Array.isArray(node.of)) {
          for (let child = 0; child < node.of.length; child++) {
            const range = node.of[child].range
            if (range?.start <= selection.start && range?.end >= selection.end) return selectedPath(node.of[child], [...path, 'of', child])
          }
        }
        return path
      }
      const path = selectedPath(parsedRule[conditionKey])
      const changeCondition = transform => machine => {
        const targetRule = machine.states[index].transitions[ruleIndex]
        let parent = targetRule
        let key = conditionKey
        for (const segment of path) { parent = parent[key]; key = segment }
        parent[key] = transform(parent[key])
        return machine
      }
      offer('negate-condition', 'Toggle NOT around the selected condition', changeCondition(node => node.type === 'not' ? node.of : { type: 'not', of: node }))
      for (const mode of ['and', 'or']) offer(`group-${mode}`, `Group selected condition with ${mode.toUpperCase()}`, changeCondition(node => ({ type: mode, of: [node, { type: 'always' }] })))
      const selectedNode = path.reduce((node, segment) => node[segment], parsedRule[conditionKey])
      if (selectedNode.type === 'and' || selectedNode.type === 'or') offer('switch-condition-group', 'Switch selected AND / OR group', changeCondition(node => ({ ...node, type: node.type === 'and' ? 'or' : 'and' })))
      if (path.length && typeof path.at(-1) === 'number') offer('remove-condition', 'Remove selected condition from its group', machine => {
        const targetRule = machine.states[index].transitions[ruleIndex]
        const parentPath = path.slice(0, -2)
        let parent = targetRule
        let key = conditionKey
        for (const segment of parentPath) { parent = parent[key]; key = segment }
        const group = parent[key]
        group.of.splice(path.at(-1), 1)
        if (group.of.length === 1) parent[key] = group.of[0]
        return machine
      })
    }
    return options
  }

  function positionChoices() {
    if (flyout.hidden) return
    const bounds = input.getBoundingClientRect()
    const dialog = root.closest('[role="dialog"]')?.getBoundingClientRect() || bounds
    const viewport = window.visualViewport
    const top = Math.max(dialog.top, viewport?.offsetTop || 0)
    const bottom = Math.min(dialog.bottom || window.innerHeight, (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight))
    const left = Math.max(dialog.left, viewport?.offsetLeft || 0)
    const right = Math.min(dialog.right || window.innerWidth, (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth))
    const style = window.getComputedStyle(input)
    const lineHeight = Number.parseFloat(style.lineHeight) || 26
    const charWidth = (Number.parseFloat(style.fontSize) || 16) * 0.6
    const columns = Math.max(1, Math.floor((bounds.width - 24) / charWidth))
    const lines = source.slice(0, selection.start).split('\n')
    const rows = lines.slice(0, -1).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)), 0) + Math.floor(lines.at(-1).length / columns)
    const caretY = bounds.top + 12 + rows * lineHeight - input.scrollTop
    const width = Math.max(0, Math.min(440, right - left - 16))
    const height = Math.max(0, Math.min(280, bottom - top - 16))
    flyout.style.position = 'fixed'
    flyout.style.width = `${width}px`
    flyout.style.maxHeight = `${height}px`
    flyout.style.left = `${Math.max(left + 8, Math.min(right - width - 8, bounds.left + 12))}px`
    flyout.style.top = `${Math.max(top + 8, Math.min(bottom - height - 8, caretY + lineHeight + height > bottom ? caretY - height : caretY + lineHeight))}px`
    flyout.style.bottom = 'auto'
  }

  function openChoices(query = '') {
    selection = { start: input.selectionStart, end: input.selectionEnd }
    context = completionContext(source, selection)
    context.legalOptions = context.legalOptions.map(item => {
      const kind = Object.hasOwn(EFFECTS, item.value) && context.slot === 'effects' ? 'actions' : Object.hasOwn(NUMERIC_FIELDS, item.value) ? 'fields' : Object.hasOwn(CHECKS, item.value) ? 'checks' : null
      const reason = context.variant === 'defence' && kind ? capabilityReason(kind, item.value) : null
      return reason ? { ...item, disabled: true, description: `Unavailable on this defence: ${reason.replaceAll('-', ' ')}` } : item
    })
    context.legalOptions = context.legalOptions.map(item => ({ ...item, description: item.value === 'relative' ? 'Compare a fraction of capacity (0–1); angle fields use degrees.' : item.value === 'absolute' ? 'Compare actual units, counts, tiles, seconds or degrees. Use the displayed numeric range.' : item.description }))
    context.legalOptions.unshift(...structuralOptions())
    const snapshot = controller.getSnapshot()
    if (snapshot.baseRevision > 0) context.legalOptions = context.legalOptions.filter(item => {
      if (item.operation) return true
      const candidate = source.slice(0, context.edits.start) + item.insertText + source.slice(context.edits.end)
      return parseCFBL(candidate).ast?.variant === snapshot.policy.variant
    })
    search.value = query
    selected = 0
    pageSize = 40
    flyout.hidden = false
    input.setAttribute('aria-expanded', 'true')
    search.setAttribute('aria-expanded', 'true')
    refreshOptions()
    positionChoices()
    if (query) { search.focus(); search.setSelectionRange(query.length, query.length) }
  }

  useNumber.addEventListener('click', () => {
    const domain = context.numericDomain
    const value = Number(number.value)
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(number.value) || !Number.isFinite(value) || value < domain.min || value > domain.max || (domain.integer && !Number.isInteger(value))) {
      status.textContent = 'Enter a finite number within the displayed range.'
      return
    }
    apply(number.value)
  })
  search.addEventListener('input', refreshOptions)
  function keyboard(event) {
    if (event.key === 'Escape' && !flyout.hidden) { event.preventDefault(); event.stopPropagation(); closeChoices(); input.focus() }
    else if (!flyout.hidden && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % Math.max(1, options.length); pageSize = Math.max(pageSize, selected + 1); refreshOptions()
    } else if (!flyout.hidden && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
      event.preventDefault(); if (options[selected]) apply(options[selected].insertText ?? options[selected].value, options[selected].operation)
    }
  }
  input.addEventListener('keydown', keyboard)
  search.addEventListener('keydown', keyboard)
  input.addEventListener('beforeinput', event => {
    if (composing || event.isComposing) return
    event.preventDefault()
    if (event.inputType === 'historyUndo') controller.undo()
    else if (event.inputType === 'historyRedo') controller.redo()
    else {
      if (event.inputType.startsWith('delete')) openChoices()
      else openChoices((flyout.hidden ? '' : search.value) + (event.data || ''))
    }
  })
  input.addEventListener('compositionstart', () => { composing = true; selection = { start: input.selectionStart, end: input.selectionEnd } })
  input.addEventListener('compositionend', event => {
    composing = false
    input.value = source
    input.setSelectionRange(selection.start, selection.end)
    openChoices(event.data || '')
  })
  input.addEventListener('input', () => {
    if (composing) return
    if (input.value !== source) {
      const attempted = input.value
      input.value = source
      input.setSelectionRange(selection.start, selection.end)
      openChoices(attempted.slice(selection.start, Math.max(selection.start, attempted.length - source.length + selection.end)))
    }
  })
  function pasteText(text) {
    const start = input.selectionStart
    const end = input.selectionEnd
    const candidate = (parseCFBL(text).ast || (start === 0 && end === source.length)) ? text : source.slice(0, start) + text + source.slice(end)
    const result = controller.setSource(candidate)
    if (!result.ok) { openChoices(); status.textContent = result.errors?.[0]?.message || result.reason || 'Invalid CFBL paste. Accepted source is unchanged.' }
  }
  input.addEventListener('paste', event => { event.preventDefault(); pasteText(event.clipboardData.getData('text/plain')) })
  input.addEventListener('drop', event => { event.preventDefault(); pasteText(event.dataTransfer.getData('text/plain')) })
  input.addEventListener('click', () => openChoices())
  input.addEventListener('select', () => {
    const changed = selection.start !== input.selectionStart || selection.end !== input.selectionEnd
    selection = { start: input.selectionStart, end: input.selectionEnd }
    if (changed && !flyout.hidden && document.activeElement === input && !composing) openChoices()
  })
  input.addEventListener('scroll', () => { mirror.scrollTop = input.scrollTop; mirror.scrollLeft = input.scrollLeft; positionChoices() })
  root.addEventListener('keydown', event => event.stopPropagation())
  root.addEventListener('pointerdown', event => event.stopPropagation())
  root.addEventListener('scroll', positionChoices, true)
  window.addEventListener('resize', positionChoices)
  window.visualViewport?.addEventListener('resize', positionChoices)
  window.visualViewport?.addEventListener('scroll', positionChoices)
  const unsubscribe = controller.subscribe(snapshot => {
    const previous = source
    source = snapshot.source
    if (previous !== source) closeChoices()
    const start = input.selectionStart
    const end = input.selectionEnd
    input.value = source
    try { paint(source); input.style.color = '' } catch { input.style.color = '#f8f8f2'; mirror.replaceChildren() }
    input.setSelectionRange(Math.min(start, source.length), Math.min(end, source.length))
  })
  return { element: root, input, closeChoices, hasChoices: () => !flyout.hidden, destroy: () => { unsubscribe(); window.removeEventListener('resize', positionChoices); window.visualViewport?.removeEventListener('resize', positionChoices); window.visualViewport?.removeEventListener('scroll', positionChoices) } }
}
