import { gameState } from '../../gameState.js'
import { isPolicyEnabled, listPolicies, setPolicyEnabled, subscribePolicyStore } from '../../policies/policyStore.js'
import { automationFilename, importAutomationFile, serializeAutomationFile } from '../../automation/automationFiles.js'
import { showNotification } from '../notifications.js'

const selected = new Set()

function owner() { return gameState.humanPlayer || 'player1' }

function download(entries) {
  const url = URL.createObjectURL(new Blob([serializeAutomationFile(entries)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = automationFilename(entries.map(entry => entry.displayName))
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function resolveConflict(name) {
  const answer = window.prompt(`An automation named "${name}" already exists.\nType REPLACE to overwrite it, KEEP to import a suffixed copy, or CANCEL to skip it.`, 'keep')
  if (answer == null || answer.trim().toLowerCase() === 'cancel') return 'cancel'
  return answer.trim().toLowerCase()
}

function render() {
  const list = document.getElementById('automationSidebarList')
  if (!list) return
  const entries = listPolicies(owner())
  const ids = new Set(entries.map(entry => entry.id))
  for (const id of selected) if (!ids.has(id)) selected.delete(id)
  list.replaceChildren(...entries.map(entry => {
    const row = document.createElement('li')
    row.className = 'automation-sidebar__item'
    const choose = document.createElement('input')
    choose.type = 'checkbox'
    choose.checked = selected.has(entry.id)
    choose.setAttribute('aria-label', `Select ${entry.displayName} for export`)
    choose.addEventListener('change', () => choose.checked ? selected.add(entry.id) : selected.delete(entry.id))
    const name = document.createElement('span')
    name.textContent = entry.displayName
    name.className = 'automation-sidebar__name'
    const enabled = document.createElement('input')
    enabled.type = 'checkbox'
    enabled.checked = isPolicyEnabled(entry.id)
    enabled.disabled = entry.policy.scope !== 'global'
    enabled.setAttribute('aria-label', `${enabled.checked ? 'Disable' : 'Enable'} ${entry.displayName}`)
    enabled.title = entry.policy.scope === 'global' ? 'Enable automation' : 'Per-unit automations are enabled when applied to a unit'
    enabled.addEventListener('change', () => setPolicyEnabled(owner(), entry.id, enabled.checked))
    row.append(choose, name, enabled)
    return row
  }))
  if (!entries.length) {
    const empty = document.createElement('li')
    empty.className = 'automation-sidebar__empty'
    empty.textContent = 'No automations loaded.'
    list.appendChild(empty)
  }
}

export function installAutomationSidebar() {
  const input = document.getElementById('importAutomationInput')
  const importButton = document.getElementById('importAutomationBtn')
  const exportAll = document.getElementById('exportAllAutomationsBtn')
  const exportSelected = document.getElementById('exportSelectedAutomationsBtn')
  if (!input || !importButton || !exportAll || !exportSelected) return
  importButton.addEventListener('click', () => input.click())
  input.addEventListener('change', async() => {
    let imported = 0
    try {
      for (const file of input.files || []) {
        const results = await importAutomationFile(await file.text(), owner(), resolveConflict)
        imported += results.filter(result => result.status !== 'cancelled').length
      }
      showNotification(imported ? `Imported ${imported} automation${imported === 1 ? '' : 's'}.` : 'No automations were imported.', 2600)
    } catch (error) { showNotification(`Automation import failed: ${error.message}`, 4500) }
    input.value = ''
  })
  exportAll.addEventListener('click', () => {
    const entries = listPolicies(owner())
    try { download(entries) } catch (error) { showNotification(error.message, 2600) }
  })
  exportSelected.addEventListener('click', () => {
    const entries = listPolicies(owner()).filter(entry => selected.has(entry.id))
    try { download(entries) } catch (error) { showNotification(error.message, 2600) }
  })
  subscribePolicyStore(render)
  render()
}
