import { decodeSaveObject, describeCompactSave, encodeCompactSave, isCompactSave } from '../saveFormat.js'
import { getStoredEntries, getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'

const SAVE_PREFIX = 'rts_save_'
const MAP_KEYS = ['mapTileState', 'mapGridTypes', 'orePositions']

export function initSaveGameEditor({ onSaved } = {}) {
  const modal = document.getElementById('saveGameEditorModal')
  const openButton = document.getElementById('openSaveGameEditorBtn')
  if (!modal || !openButton) return
  const select = modal.querySelector('#saveEditorSaveSelect')
  const labelInput = modal.querySelector('#saveEditorLabel')
  const jsonEditor = modal.querySelector('#saveEditorJson')
  const tableEditor = modal.querySelector('#saveEditorTables')
  const preview = modal.querySelector('#saveEditorPreview')
  const metrics = modal.querySelector('#saveEditorMetrics')
  let sourceKey = null
  let sourceState = null
  let editableState = null

  const populate = () => {
    select.innerHTML = '<option value="">Select a save game</option>'
    for (const [key] of getStoredEntries(SAVE_PREFIX)) {
      const option = document.createElement('option')
      option.value = key
      option.textContent = key.slice(SAVE_PREFIX.length)
      select.appendChild(option)
    }
  }

  const loadSelected = () => {
    const raw = getStoredItem(select.value)
    if (!raw) return
    const decoded = decodeSaveObject(isCompactSave(raw) ? raw : JSON.parse(raw))
    sourceKey = select.value
    sourceState = JSON.parse(decoded.state)
    editableState = Object.fromEntries(Object.entries(sourceState).filter(([key]) => !MAP_KEYS.includes(key)))
    labelInput.value = decoded.label
    jsonEditor.value = JSON.stringify(editableState, null, 2)
    renderTables(tableEditor, editableState)
    preview.textContent = buildStrategicPreview(editableState)
    const compact = isCompactSave(raw) ? raw : encodeCompactSave(decoded)
    const description = describeCompactSave(compact)
    metrics.textContent = `${description.bytes} bytes · ${description.characters} chars · ${description.lines} lines`
  }

  openButton.addEventListener('click', () => {
    populate()
    modal.showModal()
  })
  select.addEventListener('change', loadSelected)
  modal.querySelector('#saveEditorClose').addEventListener('click', () => modal.close())
  modal.querySelectorAll('[data-save-editor-tab]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.saveEditorTab !== 'json') syncJson()
    modal.querySelectorAll('[data-save-editor-panel]').forEach(panel => { panel.hidden = panel.dataset.saveEditorPanel !== button.dataset.saveEditorTab })
    if (button.dataset.saveEditorTab === 'tables') renderTables(tableEditor, editableState)
    if (button.dataset.saveEditorTab === 'preview') preview.textContent = buildStrategicPreview(editableState)
  }))
  tableEditor.addEventListener('change', event => applyTableEdit(event.target, editableState, jsonEditor))

  const syncJson = () => {
    try {
      editableState = JSON.parse(jsonEditor.value)
      jsonEditor.setCustomValidity('')
      return true
    } catch {
      jsonEditor.setCustomValidity('Invalid JSON')
      jsonEditor.reportValidity()
      return false
    }
  }

  const save = overwrite => {
    if (!sourceState || !syncJson()) return
    const label = labelInput.value.trim() || 'Edited Save'
    const targetKey = overwrite ? sourceKey : `${SAVE_PREFIX}${label}`
    if (overwrite && !window.confirm(`Override ${sourceKey.slice(SAVE_PREFIX.length)}? This cannot be undone.`)) return
    if (!overwrite && getStoredItem(targetKey) && !window.confirm(`A save named ${label} exists. Override it?`)) return
    const state = { ...editableState }
    MAP_KEYS.forEach(key => { state[key] = sourceState[key] })
    setStoredItem(targetKey, encodeCompactSave({ label, time: Date.now(), state }))
    onSaved?.()
    populate()
    select.value = targetKey
    loadSelected()
  }
  modal.querySelector('#saveEditorSaveNew').addEventListener('click', () => save(false))
  modal.querySelector('#saveEditorOverwrite').addEventListener('click', () => save(true))
}

function renderTables(container, state) {
  container.innerHTML = '<p>Map data is read-only and intentionally excluded.</p>'
  const sections = [['gameState', [state.gameState || {}]]]
  Object.entries(state).forEach(([name, value]) => {
    if (name !== 'gameState' && Array.isArray(value) && value.every(item => item && typeof item === 'object')) sections.push([name, value])
  })
  for (const [name, rows] of sections) {
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
    const heading = document.createElement('h4')
    heading.textContent = name
    container.appendChild(heading)
    const table = document.createElement('table')
    table.innerHTML = `<thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, rowIndex) => `<tr>${columns.map(column => `<td><input data-collection="${escapeHtml(name)}" data-row="${rowIndex}" data-key="${escapeHtml(column)}" value="${escapeHtml(formatEditorValue(row[column]))}"></td>`).join('')}</tr>`).join('')}</tbody>`
    container.appendChild(table)
  }
}

function applyTableEdit(input, state, jsonEditor) {
  if (!input.matches('input[data-collection]')) return
  const collection = input.dataset.collection
  const target = collection === 'gameState' ? state.gameState : state[collection]?.[Number(input.dataset.row)]
  if (!target) return
  target[input.dataset.key] = parseEditorValue(input.value)
  jsonEditor.value = JSON.stringify(state, null, 2)
}

function buildStrategicPreview(state) {
  const game = state.gameState || {}
  const lines = ['STRATEGIC1|time|money|player|players', `R|${game.gameTime || 0}|${game.money || 0}|${game.humanPlayer || ''}|${game.playerCount || 0}`]
  for (const name of ['units', 'buildings', 'unitWrecks', 'mines', 'waterMines']) {
    const rows = state[name] || []
    lines.push(`S|${name}|type|owner|id|x|y|health|target|path`)
    rows.forEach(row => lines.push(`R|${row.type || row.unitType || ''}|${row.owner || ''}|${row.id || ''}|${row.x ?? row.tileX ?? ''}|${row.y ?? row.tileY ?? ''}|${row.health ?? ''}|${row.targetId || row.attackTargetId || ''}|${formatEditorValue(row.path || row.userPath || '')}`))
  }
  return lines.join('\n')
}

function formatEditorValue(value) {
  return value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
}

function parseEditorValue(value) {
  if (value === '') return null
  if (value === 'true') return true
  if (value === 'false') return false
  if (!Number.isNaN(Number(value))) return Number(value)
  if (value.startsWith('{') || value.startsWith('[')) {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
