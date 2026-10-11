import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutomationDraft } from '../../src/automation/automationDraft.js'
import { createBlankPolicy } from '../../src/policies/policyTemplates.js'
import { defenceCapabilityReason } from '../../src/policies/defenceCapabilities.js'
import { createCFBLEditor } from '../../src/ui/policies/cfblEditor.js'
import { openPolicyEditor } from '../../src/ui/policies/policyEditorModal.js'
import { loadPolicyStore, resetPolicyStore } from '../../src/policies/policyStore.js'
import { gameState } from '../../src/gameState.js'

vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))
vi.mock('../../src/ui/notifications.js', () => ({ showNotification: vi.fn() }))
let close
beforeEach(() => {
  resetPolicyStore(); localStorage.clear(); document.body.replaceChildren()
  gameState.humanPlayer = 'player1'; gameState.gamePaused = true
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { close?.(); close = null; vi.restoreAllMocks() })

describe('defence authoring and migration recovery', () => {
  it('disables unavailable selected-Tesla actions in DAV while generic global authoring preserves them', () => {
    const building = { type: 'teslaCoil', isBuilding: true, owner: 'player1', health: 100 }
    const editor = openPolicyEditor({ variant: 'defence', defenceBuilding: building })
    close = editor.close
    const action = document.querySelector('[aria-label="State 1 action"]')
    expect(action.querySelector('[value="fireForward"]').disabled).toBe(true)
    expect(action.querySelector('[value="fireForward"]').textContent).toContain('unsupported capability')
    expect(action.querySelector('[value="holdFire"]').disabled).toBe(false)
    close(); close = null
    const globalEditor = openPolicyEditor({ variant: 'defence' })
    close = globalEditor.close
    expect(document.querySelector('[aria-label="State 1 action"] [value="fireForward"]').disabled).toBe(false)
  })

  it('ATV explains unavailable selected-Tesla completions and keeps legal shared source unchanged', () => {
    const controller = createAutomationDraft('player1', createBlankPolicy('defence-guided', 'defence'))
    const editor = createCFBLEditor(controller, { capabilityReason: (kind, name) => defenceCapabilityReason({ type: 'teslaCoil' }, kind, name) })
    document.body.append(editor.element)
    close = editor.destroy
    const source = controller.getSnapshot().source
    editor.input.setSelectionRange(source.indexOf('wait'), source.indexOf('wait') + 4)
    ;[...editor.element.querySelectorAll('button')].find(button => button.textContent === 'Choose next token').click()
    const forward = [...editor.element.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('Fire in the turret direction'))
    expect(forward.disabled).toBe(true)
    expect(forward.textContent).toContain('Unavailable on this defence')
    forward.click()
    expect(controller.getSnapshot().source).toBe(source)
  })

  it('shows preserved recovery entries and an export-backup action as safe plain text', async() => {
    localStorage.setItem('cfb-unit-policies-v1', JSON.stringify({ documents: [{ ownerId: 'player1', policy: { id: '<svg onload=alert(1)>' } }] }))
    loadPolicyStore()
    document.body.innerHTML = '<button id="policiesBtn">Automation</button>'
    const panel = await import('../../src/ui/policies/policyPanel.js')
    panel.installPolicyPanel(); panel.openPolicyPanel()
    const warning = document.querySelector('[aria-label="Automation recovery"]')
    expect(warning.textContent).toContain('Some automation could not be restored')
    expect(warning.textContent).toContain('<svg onload=alert(1)>')
    expect(warning.querySelector('svg')).toBeNull()
    expect([...warning.querySelectorAll('button')].map(button => button.textContent)).toContain('Export recovery backup')
    panel.closePolicyPanel()
  })
})
