import { selectedUnits } from '../inputHandler.js'
import { DEBUG_ENABLED } from '../utils/debugLogger.js'
import { getUnitCommandHistory } from '../game/unitCommandHistory.js'

const OVERLAY_ID = 'debug-unit-command-overlay'
let updateTimer = null
let overlayMinimized = false

function createOverlayElement() {
  let overlay = document.getElementById(OVERLAY_ID)
  if (overlay) return overlay

  overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.style.position = 'fixed'
  overlay.style.right = '24px'
  overlay.style.top = '50%'
  overlay.style.transform = 'translateY(-50%)'
  overlay.style.width = '360px'
  overlay.style.maxHeight = '60vh'
  overlay.style.overflow = 'hidden'
  overlay.style.background = 'rgba(0, 0, 0, 0.82)'
  overlay.style.border = '1px solid rgba(255, 255, 255, 0.25)'
  overlay.style.borderRadius = '8px'
  overlay.style.padding = '10px'
  overlay.style.color = '#fff'
  overlay.style.fontFamily = 'monospace'
  overlay.style.fontSize = '12px'
  overlay.style.lineHeight = '1.35'
  overlay.style.zIndex = '9999'
  overlay.style.display = 'none'
  overlay.style.pointerEvents = 'auto'
  document.body.appendChild(overlay)
  return overlay
}

function formatCommandTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '--'
  const seconds = (performance.now() - timestamp) / 1000
  return `${Math.max(0, seconds).toFixed(1)}s ago`
}

function renderOverlay() {
  const overlay = createOverlayElement()
  const selected = Array.isArray(selectedUnits) ? selectedUnits : []
  if (selected.length !== 1) {
    overlay.style.display = 'none'
    return
  }

  const unit = selected[0]
  if (!unit?.id) {
    overlay.style.display = 'none'
    return
  }

  const history = getUnitCommandHistory(unit.id)
  const toggleLabel = overlayMinimized ? '▢' : '—'
  const toggleTitle = overlayMinimized ? 'Maximize commands panel' : 'Minimize commands panel'

  const renderHeader = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <strong>Last 10 Commands</strong>
      <button id="${OVERLAY_ID}-toggle" type="button" title="${toggleTitle}" style="cursor:pointer;border:1px solid rgba(255,255,255,0.25);background:#1a1a1a;color:#fff;border-radius:4px;padding:2px 6px;font-size:11px;">${toggleLabel}</button>
    </div>
    <div style="margin-bottom:8px;opacity:0.85;">Unit: ${unit.type || 'unknown'} · ${unit.id}</div>
  `

  if (overlayMinimized) {
    overlay.style.width = 'auto'
    overlay.style.maxHeight = 'none'
    overlay.style.padding = '6px'
    overlay.style.top = 'auto'
    overlay.style.transform = 'none'
    overlay.style.right = '16px'
    overlay.style.bottom = '88px'
    overlay.innerHTML = `<button id="${OVERLAY_ID}-toggle" type="button" title="${toggleTitle}" style="cursor:pointer;border:1px solid rgba(255,255,255,0.25);background:#1a1a1a;color:#fff;border-radius:4px;padding:4px 8px;font-size:11px;">Maximize logs</button>`
    attachToggleHandler()
    overlay.style.display = 'block'
    return
  }

  overlay.style.width = '360px'
  overlay.style.maxHeight = '60vh'
  overlay.style.padding = '10px'
  overlay.style.top = '50%'
  overlay.style.transform = 'translateY(-50%)'
  overlay.style.right = '24px'
  overlay.style.bottom = 'auto'

  if (!history || history.length === 0) {
    overlay.innerHTML = `${renderHeader}<div style="margin-top:8px;opacity:0.8;">No commands recorded yet.</div>`
    attachToggleHandler()
    overlay.style.display = 'block'
    return
  }

  const rows = [...history]
    .reverse()
    .map((entry, index) => (`
      <li style="margin-bottom:4px;">
        <span style="opacity:0.7;">#${history.length - index}</span>
        <strong>${entry.type}</strong>
        <span style="opacity:0.8;">[${entry.source}]</span>
        <span style="opacity:0.9;">${entry.details || ''}</span>
        <span style="opacity:0.6;float:right;">${formatCommandTime(entry.timestamp)}</span>
      </li>
    `)).join('')

  overlay.innerHTML = `
    ${renderHeader}
    <ol style="margin:0;padding-left:18px;max-height:42vh;overflow:auto;">
      ${rows}
    </ol>
  `
  attachToggleHandler()
  overlay.style.display = 'block'
}

function attachToggleHandler() {
  const button = document.getElementById(`${OVERLAY_ID}-toggle`)
  if (!button) return
  button.onclick = () => {
    overlayMinimized = !overlayMinimized
    renderOverlay()
  }
}

export function initDebugUnitCommandOverlay() {
  if (!DEBUG_ENABLED || typeof document === 'undefined') {
    return
  }

  createOverlayElement()
  if (updateTimer) {
    window.clearInterval(updateTimer)
  }

  updateTimer = window.setInterval(renderOverlay, 200)
  renderOverlay()
}
