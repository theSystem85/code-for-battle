import { beforeEach, describe, expect, it } from 'vitest'
import { automationFilename, importAutomationFile, parseAutomationFile, serializeAutomationFile } from '../../src/automation/automationFiles.js'
import { getPolicyEntry, isPolicyEnabled, listPolicies, resetPolicyStore, savePolicy } from '../../src/policies/policyStore.js'
import { POLICY_TEMPLATES } from '../../src/policies/policyTemplates.js'

const machine = (id, name = id) => { const policy = POLICY_TEMPLATES[0].create(id); policy.name = name; policy.scope = 'global'; return policy }

beforeEach(() => { localStorage.clear(); resetPolicyStore() })

describe('automation .cfbl files', () => {
  it('[U07053] serializes a versioned file and validates its magic and version', () => {
    savePolicy('player1', machine('harvest', 'Harvester Patrol'))
    const text = serializeAutomationFile(listPolicies('player1'))
    expect(parseAutomationFile(text)).toMatchObject({ type: 'code-for-battle.automations', version: 1,
      automations: [{ name: 'Harvester Patrol' }] })
    expect(() => parseAutomationFile('{"type":"wrong","version":1,"automations":[]}')).toThrow(/not a Code for Battle/)
    expect(() => parseAutomationFile('{"type":"code-for-battle.automations","version":9,"automations":[]}')).toThrow(/Unsupported/)
  })

  it('[U07054] builds short filenames that retain the start of every selected name', () => {
    expect(automationFilename(['Harvester Patrol'])).toBe('harvester-patrol.cfbl')
    expect(automationFilename(['Harvester Patrol With A Very Long Name', 'Defend Headquarters Forever'], 28))
      .toBe('harvester-pat-defend-headqu.cfbl')
  })

  it('[U07055] resolves each conflicting name as replace, suffixed keep, or cancel', async() => {
    savePolicy('player1', machine('existing', 'Scout'))
    const source = getPolicyEntry('existing').source
    const file = JSON.stringify({ type: 'code-for-battle.automations', version: 1, automations: [
      { name: 'Scout', source, enabled: true }, { name: 'Scout', source }, { name: 'Scout', source }
    ] })
    const choices = ['replace', 'keep', 'cancel']
    const results = await importAutomationFile(file, 'player1', async() => choices.shift())
    expect(results.map(result => result.status)).toEqual(['replaced', 'imported', 'cancelled'])
    expect(listPolicies('player1').map(entry => entry.displayName).sort()).toEqual(['Scout', 'Scout (2)'])
    expect(isPolicyEnabled('existing')).toBe(true)
  })
})
