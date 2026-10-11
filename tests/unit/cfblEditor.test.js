import { beforeEach, describe, expect, it } from 'vitest'
import { createCFBLEditor, fuzzyOptions } from '../../src/ui/policies/cfblEditor.js'
import { createAutomationDraft } from '../../src/automation/automationDraft.js'
import { createBlankPolicy } from '../../src/policies/policyTemplates.js'
import { parseCFBL } from '../../src/automation/cfbl/index.js'
import { resetPolicyStore } from '../../src/policies/policyStore.js'

function setup() {
  const controller = createAutomationDraft('player1', createBlankPolicy('guided-editor'))
  const editor = createCFBLEditor(controller)
  document.body.append(editor.element)
  return { controller, editor }
}

describe('guided CFBL editor', () => {
  beforeEach(() => { resetPolicyStore(); localStorage.clear(); document.body.replaceChildren() })
  it('ranks legal labels and spellings without introducing an illegal choice', () => {
    const options = [{ value: 'tank-v2', label: 'Tank 2' }, { value: 'harvester', label: 'Harvester' }]
    expect(fuzzyOptions(options, 'tnk2')).toEqual([options[0]])
    expect(fuzzyOptions(options, 'unrecognized')).toEqual([])
  })
  it('stages raw input in search and keeps accepted code parseable', () => {
    const { controller, editor } = setup()
    const before = controller.getSnapshot().source
    editor.input.focus()
    editor.input.setSelectionRange(before.indexOf('wait'), before.indexOf('wait') + 4)
    editor.input.dispatchEvent(new window.InputEvent('beforeinput', { inputType: 'insertText', data: 'illegal', cancelable: true, bubbles: true }))
    expect(controller.getSnapshot().source).toBe(before)
    expect(document.querySelector('[aria-label="Search legal CFBL options"]').value).toBe('illegal')
    expect(document.activeElement.getAttribute('aria-label')).toBe('Search legal CFBL options')
    expect(parseCFBL(editor.input.value).diagnostics).toEqual([])
    editor.destroy()
  })
  it('rejects invalid paste and accepts valid programs atomically', () => {
    const { controller, editor } = setup()
    const before = controller.getSnapshot().source
    const paste = text => {
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
      editor.input.setSelectionRange(0, editor.input.value.length)
      editor.input.dispatchEvent(event)
    }
    paste('<script>illegal</script>')
    expect(controller.getSnapshot().source).toBe(before)
    paste(before.replace('continuous', 'once'))
    expect(controller.getSnapshot().policy.execution).toBe('oneTime')
    expect(document.querySelector('script')).toBeNull()
    editor.destroy()
  })
  it('keeps composition provisional until the user chooses a legal option', () => {
    const { controller, editor } = setup()
    const before = controller.getSnapshot().source
    editor.input.setSelectionRange(before.indexOf('wait'), before.indexOf('wait') + 4)
    editor.input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }))
    editor.input.value = 'uncommitted composition'
    editor.input.dispatchEvent(new window.InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, bubbles: true }))
    editor.input.dispatchEvent(new window.CompositionEvent('compositionend', { data: 'retreat', bubbles: true }))
    expect(controller.getSnapshot().source).toBe(before)
    expect(editor.input.value).toBe(before)
    expect(document.querySelector('[aria-label="Search legal CFBL options"]').value).toBe('retreat')
    editor.destroy()
  })
  it('routes native accepted-history events through shared undo and redo', () => {
    const { controller, editor } = setup()
    controller.setSource(controller.getSnapshot().source.replace('continuous', 'once'))
    editor.input.dispatchEvent(new window.InputEvent('beforeinput', { inputType: 'historyUndo', cancelable: true, bubbles: true }))
    expect(controller.getSnapshot().policy.execution).toBe('continuous')
    editor.input.dispatchEvent(new window.InputEvent('beforeinput', { inputType: 'historyRedo', cancelable: true, bubbles: true }))
    expect(controller.getSnapshot().policy.execution).toBe('oneTime')
    editor.destroy()
  })
  it('authors and removes WHILE UNTIL as complete transactions through the actual flyout', () => {
    const { controller, editor } = setup()
    controller.transact(machine => {
      machine.states[0].transitions.push({ id: 'hold', kind: 'while', when: { type: 'always' }, to: machine.states[0].id })
      return machine
    })
    const open = () => {
      const source = controller.getSnapshot().source
      const start = source.indexOf('while')
      editor.input.setSelectionRange(start, start + 5)
      editor.input.click()
    }
    open()
    ;[...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('Add UNTIL condition')).click()
    expect(controller.getSnapshot().source).toContain('until (always)')
    open()
    ;[...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('Remove UNTIL')).click()
    expect(controller.getSnapshot().source).not.toContain('until')
    expect(parseCFBL(controller.getSnapshot().source).diagnostics).toEqual([])
    editor.destroy()
  })
  it('groups the selected nested leaf without changing unrelated predicates', () => {
    const { controller, editor } = setup()
    controller.transact(machine => {
      machine.states[0].transitions.push({ id: 'nested', kind: 'if', when: { type: 'and', of: [{ type: 'compare', field: 'hp', op: '<', value: 0.25 }, { type: 'always' }] }, to: machine.states[0].id })
      return machine
    })
    const source = controller.getSnapshot().source
    const start = source.indexOf('always')
    editor.input.setSelectionRange(start, start + 6)
    editor.input.click()
    ;[...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('Group selected condition with OR')).click()
    const condition = controller.getSnapshot().policy.states[0].transitions[0].when
    expect(condition.type).toBe('and')
    expect(condition.of[0]).toMatchObject({ type: 'compare', field: 'hp', value: 0.25 })
    expect(condition.of[1].type).toBe('or')
    expect(parseCFBL(controller.getSnapshot().source).diagnostics).toEqual([])
    editor.destroy()
  })
  it('commits tiny legal decimals without exponent notation', () => {
    const { controller, editor } = setup()
    controller.transact(machine => {
      machine.states[0].transitions.push({ id: 'health', kind: 'if', when: { type: 'compare', field: 'hp', op: '<', value: 0.25 }, to: machine.states[0].id })
      return machine
    })
    const source = controller.getSnapshot().source
    const start = source.indexOf('0.25')
    editor.input.setSelectionRange(start, start + 4)
    editor.input.click()
    document.querySelector('[aria-label="CFBL numeric value"]').value = '0.0000001'
    ;[...document.querySelectorAll('button')].find(button => button.textContent === 'Use value').click()
    expect(controller.getSnapshot().source).toContain('0.0000001')
    expect(parseCFBL(controller.getSnapshot().source).diagnostics).toEqual([])
    editor.destroy()
  })
  it('escapes source text in the noninteractive highlighted mirror', () => {
    const { editor } = setup()
    expect(document.querySelector('.cfbl-editor__mirror').getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelector('.cfbl-editor__input').tagName).toBe('TEXTAREA')
    editor.destroy()
  })
})
