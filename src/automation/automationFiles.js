import { isPolicyEnabled, listPolicies, saveAutomationSource, setPolicyEnabled } from '../policies/policyStore.js'

export const AUTOMATION_FILE_TYPE = 'code-for-battle.automations'
export const AUTOMATION_FILE_VERSION = 1

function slug(value) {
  return String(value || 'automation').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'automation'
}

export function automationFilename(names, maxLength = 52) {
  const parts = names.map(slug)
  let joined = parts.join('-')
  if (joined.length > maxLength) {
    const allowance = Math.max(4, Math.floor((maxLength - Math.max(0, parts.length - 1)) / Math.max(1, parts.length)))
    joined = parts.map(part => part.slice(0, allowance).replace(/-$/, '')).join('-').slice(0, maxLength).replace(/-$/, '')
  }
  return `${joined || 'automations'}.cfbl`
}

export function createAutomationFile(entries) {
  return {
    type: AUTOMATION_FILE_TYPE,
    version: AUTOMATION_FILE_VERSION,
    automations: entries.map(entry => ({
      name: entry.displayName,
      source: entry.source,
      enabled: isPolicyEnabled(entry.id)
    }))
  }
}

export function serializeAutomationFile(entries) {
  if (!entries.length) throw new Error('Choose at least one automation to export.')
  return JSON.stringify(createAutomationFile(entries), null, 2)
}

export function parseAutomationFile(text) {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('This is not a valid JSON automation file.') }
  if (data?.type !== AUTOMATION_FILE_TYPE) throw new Error('This file is not a Code for Battle automation file.')
  if (data.version !== AUTOMATION_FILE_VERSION) throw new Error(`Unsupported automation file version: ${data.version ?? 'missing'}.`)
  if (!Array.isArray(data.automations) || !data.automations.length) throw new Error('The automation file does not contain any automations.')
  data.automations.forEach((item, index) => {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || typeof item.source !== 'string') throw new Error(`Automation ${index + 1} is incomplete.`)
    if (item.enabled != null && typeof item.enabled !== 'boolean') throw new Error(`Automation ${index + 1} has an invalid enabled value.`)
  })
  return data
}

function uniqueName(name, usedNames) {
  let suffix = 2
  let candidate = `${name} (${suffix})`
  while (usedNames.has(candidate.toLocaleLowerCase())) candidate = `${name} (${++suffix})`
  return candidate
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function importAutomationFile(text, actorId, resolveConflict) {
  const data = parseAutomationFile(text)
  const usedNames = new Set(listPolicies(actorId).map(entry => entry.displayName.toLocaleLowerCase()))
  const results = []
  for (const item of data.automations) {
    const conflict = listPolicies(actorId).find(entry => entry.displayName.toLocaleLowerCase() === item.name.toLocaleLowerCase())
    const choice = conflict ? await resolveConflict(item.name) : 'keep'
    if (choice === 'cancel') { results.push({ name: item.name, status: 'cancelled' }); continue }
    if (!['replace', 'keep'].includes(choice)) throw new Error('Import conflict was not resolved.')
    const name = conflict && choice === 'keep' ? uniqueName(item.name, usedNames) : item.name
    const id = conflict && choice === 'replace' ? conflict.id : newId()
    const saved = saveAutomationSource(actorId, { id, name, source: item.source })
    if (!saved.ok) throw new Error(saved.errors?.map(error => error.message).join(' ') || `Could not import ${name}.`)
    if (item.enabled && listPolicies(actorId).find(entry => entry.id === id)?.policy.scope === 'global') setPolicyEnabled(actorId, id, true)
    usedNames.add(name.toLocaleLowerCase())
    results.push({ name, status: choice === 'replace' ? 'replaced' : 'imported' })
  }
  return results
}
