// notificationHistory.js
// Persistent notification history with toggle panel in top-right corner

const MAX_HISTORY = 100
const notificationLog = []
let panelOpen = false
let panelEl = null
let badgeEl = null
let unreadCount = 0

function formatTimestamp(ts) {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function ensurePanel() {
  if (panelEl) return panelEl

  // Container
  panelEl = document.createElement('div')
  panelEl.id = 'notificationHistoryPanel'
  panelEl.className = 'notif-history'
  panelEl.setAttribute('aria-hidden', 'true')

  panelEl.innerHTML = `
    <div class="notif-history__header">
      <span class="notif-history__title">Notifications</span>
      <div class="notif-history__actions">
        <button class="notif-history__clear" type="button" aria-label="Clear all" title="Clear all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
        <button class="notif-history__close-btn" type="button" aria-label="Close">&times;</button>
      </div>
    </div>
    <div class="notif-history__list" role="log" aria-live="polite"></div>
    <div class="notif-history__empty">No notifications yet.</div>
  `

  document.body.appendChild(panelEl)

  panelEl.querySelector('.notif-history__close-btn').addEventListener('click', () => toggleNotificationPanel(false))
  panelEl.querySelector('.notif-history__clear').addEventListener('click', clearHistory)

  return panelEl
}

function ensureBadge() {
  if (badgeEl) return badgeEl

  badgeEl = document.createElement('button')
  badgeEl.id = 'notificationHistoryBadge'
  badgeEl.className = 'notif-badge'
  badgeEl.setAttribute('aria-label', 'Notification history')
  badgeEl.title = 'Notifications'
  badgeEl.innerHTML = `
    <svg class="notif-badge__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
    <span class="notif-badge__count" aria-hidden="true">0</span>
  `

  document.body.appendChild(badgeEl)
  badgeEl.addEventListener('click', () => toggleNotificationPanel())

  return badgeEl
}

function renderList() {
  const panel = ensurePanel()
  const list = panel.querySelector('.notif-history__list')
  const empty = panel.querySelector('.notif-history__empty')
  if (!list) return

  if (notificationLog.length === 0) {
    list.innerHTML = ''
    empty.style.display = 'block'
    return
  }

  empty.style.display = 'none'
  // Render in reverse chronological order
  const entries = notificationLog.slice().reverse()
  list.innerHTML = entries
    .map(entry => {
      const actionable = typeof entry.onActivate === 'function'
      const tag = actionable ? 'button' : 'div'
      const llmIndicator = entry.llmPlayerId
        ? `<span class="notif-history__llm-indicator" style="background-color: ${escapeHtml(entry.llmColor || '#FF0000')}">🤖</span>`
        : ''
      return `
      <${tag}${actionable ? ' type="button"' : ''} class="notif-history__item${actionable ? ' notif-history__item--actionable' : ''}${entry.llmPlayerId ? ' notif-history__item--llm' : ''}">
        ${llmIndicator}
        <span class="notif-history__time">${formatTimestamp(entry.timestamp)}</span>
        <span class="notif-history__msg">${escapeHtml(entry.message)}</span>
      </${tag}>
    `
    })
    .join('')
  list.querySelectorAll('.notif-history__item').forEach((row, index) => {
    if (typeof entries[index].onActivate === 'function') {
      row.addEventListener('click', entries[index].onActivate)
      // Keep button activation keys from triggering game shortcuts.
      const stopActivationShortcut = event => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
      }
      row.addEventListener('keydown', stopActivationShortcut)
      row.addEventListener('keyup', stopActivationShortcut)
    }
  })
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function updateBadge() {
  const badge = ensureBadge()
  const countEl = badge.querySelector('.notif-badge__count')
  if (countEl) {
    countEl.textContent = unreadCount > 99 ? '99+' : String(unreadCount)
    countEl.classList.toggle('notif-badge__count--visible', unreadCount > 0)
  }
}

export function pushNotification(message, options = {}) {
  notificationLog.push({
    message,
    timestamp: Date.now(),
    llmPlayerId: options.llmPlayerId || null,
    llmColor: options.llmColor || null,
    onActivate: typeof options.onActivate === 'function' ? options.onActivate : null
  })
  if (notificationLog.length > MAX_HISTORY) {
    notificationLog.splice(0, notificationLog.length - MAX_HISTORY)
  }
  if (!panelOpen) {
    unreadCount++
    updateBadge()
  } else {
    renderList()
  }
}

export function toggleNotificationPanel(forceState) {
  const panel = ensurePanel()
  panelOpen = forceState !== undefined ? forceState : !panelOpen

  if (panelOpen) {
    unreadCount = 0
    updateBadge()
    renderList()
    panel.setAttribute('aria-hidden', 'false')
    panel.classList.add('notif-history--open')
  } else {
    panel.setAttribute('aria-hidden', 'true')
    panel.classList.remove('notif-history--open')
  }
}

function clearHistory() {
  notificationLog.length = 0
  unreadCount = 0
  updateBadge()
  renderList()
}

export function initNotificationHistory() {
  ensureBadge()
  updateBadge()
}
