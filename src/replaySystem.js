import { gameState } from './gameState.js'
import { saveGame, loadGame, updateSaveGamesList } from './saveGame.js'
import { showNotification } from './ui/notifications.js'
import { applyGameTickOutput } from './ai-api/applier.js'
import { productionQueue } from './productionQueue.js'
import { CheatSystem } from './input/cheatSystem.js'

const REPLAY_STORAGE_PREFIX = 'rts_replay_'
const TEMP_BASELINE_LABEL_PREFIX = '__replay_baseline__'

function sanitizeFileSegment(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
  return cleaned || fallback
}

function buildReplayExportFilename(label, time) {
  const safeLabel = sanitizeFileSegment(label, 'replay')
  const safeDate = Number.isFinite(time)
    ? new Date(time).toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', 'Z')
    : 'unknown-date'
  return `${safeDate}_${safeLabel}.json`
}

function getNowMs() {
  return Number.isFinite(gameState.simulationTime) ? gameState.simulationTime : Date.now()
}

function ensureReplayState() {
  if (!gameState.replay) {
    gameState.replay = {
      recordingActive: false,
      recordingStartedAt: 0,
      recordingLabel: '',
      recordingStartedWallClock: 0,
      commands: [],
      baselineState: null,
      playbackActive: false,
      playbackStartedAt: 0,
      playbackCursor: 0,
      playbackCommands: []
    }
  }
  return gameState.replay
}

function buildReplayStorageKey(label) {
  return `${REPLAY_STORAGE_PREFIX}${label}`
}

function serializeReplay({ label, startedAt, baselineState, commands }) {
  const durationMs = commands.length > 0 ? (commands[commands.length - 1].at || 0) : 0
  return {
    label,
    time: Date.now(),
    startedAt,
    startedAtWallClock: ensureReplayState().recordingStartedWallClock || Date.now(),
    durationMs,
    baselineState,
    commands
  }
}

function formatDuration(durationMs = 0) {
  const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatReplayTimestamp(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}/${month}/${day}, ${hours}:${minutes}:${seconds}`
}

function formatReplayListLabel(timestamp, durationMs = 0) {
  return `${formatReplayTimestamp(timestamp)}, ${formatDuration(durationMs)}`
}

function syncPauseButtonIcon() {
  const pauseBtn = document.getElementById('pauseBtn')
  const playPauseIcon = pauseBtn?.querySelector('.play-pause-icon')
  if (playPauseIcon) {
    playPauseIcon.textContent = gameState.gamePaused ? '▶' : '⏸'
  }
}

function captureBaselineState() {
  const replay = ensureReplayState()
  const baselineLabel = `${TEMP_BASELINE_LABEL_PREFIX}${Date.now()}`
  const baselineKey = `rts_save_${baselineLabel}`
  saveGame(baselineLabel)
  try {
    const raw = localStorage.getItem(baselineKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    replay.baselineState = parsed?.state || null
    return replay.baselineState
  } finally {
    localStorage.removeItem(baselineKey)
    updateSaveGamesList()
  }
}

export function listReplays() {
  const replays = []
  if (typeof localStorage === 'undefined') return replays
  for (const key in localStorage) {
    if (!key.startsWith(REPLAY_STORAGE_PREFIX)) continue
    try {
      const replay = JSON.parse(localStorage.getItem(key))
      replays.push({ key, label: replay?.label || '(no label)', time: replay?.time || 0 })
    } catch (err) {
      window.logger.warn('Failed to parse replay entry:', err)
    }
  }
  replays.sort((a, b) => (b.time || 0) - (a.time || 0))
  return replays
}

export function isReplayInteractionLocked() {
  return Boolean(gameState.replay?.playbackActive && !gameState.replay?.isApplyingReplayCommand)
}

export function isReplayModeActive() {
  return Boolean(gameState.replayMode)
}

export function startReplayRecording() {
  const replay = ensureReplayState()
  if (replay.recordingActive) return
  const baselineState = captureBaselineState()
  if (!baselineState) {
    showNotification('Replay recording failed: baseline save could not be captured.')
    return
  }

  replay.recordingActive = true
  replay.recordingStartedAt = getNowMs()
  replay.recordingStartedWallClock = Date.now()
  replay.commands = []
  replay.recordingLabel = formatReplayTimestamp(replay.recordingStartedWallClock)
  replay.baselineState = baselineState
  showNotification('Replay recording started')
}

export function stopReplayRecording() {
  const replay = ensureReplayState()
  if (!replay.recordingActive) return

  replay.recordingActive = false
  const payload = serializeReplay({
    label: replay.recordingLabel,
    startedAt: replay.recordingStartedAt,
    baselineState: replay.baselineState,
    commands: replay.commands
  })
  const key = buildReplayStorageKey(`${payload.time}_${payload.label}`)
  localStorage.setItem(key, JSON.stringify(payload))
  updateReplayList()
  showNotification(`Replay saved (${replay.commands.length} commands)`)
}

export function toggleReplayRecording() {
  const replay = ensureReplayState()
  if (replay.recordingActive) {
    stopReplayRecording()
  } else {
    startReplayRecording()
  }
  updateRecordButtonState()
}

export function recordReplayCommand(command, metadata = {}) {
  const replay = ensureReplayState()
  if (!replay.recordingActive) return
  replay.commands.push({
    at: Math.max(0, getNowMs() - replay.recordingStartedAt),
    command,
    metadata
  })
}

function executeReplayCommand(entry) {
  if (!entry?.command) return
  const { command } = entry

  const replay = ensureReplayState()
  replay.isApplyingReplayCommand = true
  try {
    if (command.type === 'unit_command' || command.type === 'build_place' || command.type === 'build_queue') {
      applyGameTickOutput(gameState, {
        protocolVersion: '1.0',
        tick: gameState.frameCount || 0,
        intent: 'replay',
        confidence: 1,
        notes: 'Replay command execution',
        commentary: null,
        actions: [{ actionId: `replay_${Date.now()}_${Math.random()}`, ...command }]
      }, {
        playerId: command.owner || gameState.humanPlayer
      })
      return
    }

    if (command.type === 'production_add') {
      const isBuilding = Boolean(command.isBuilding)
      const selector = isBuilding
        ? `.production-button[data-building-type="${command.itemType}"]`
        : `.production-button[data-unit-type="${command.itemType}"]`
      const button = document.querySelector(selector)
      if (button) {
        productionQueue.addItem(
          command.itemType,
          button,
          isBuilding,
          command.blueprint || null,
          command.rallyPoint || null,
          { allowReplay: true, record: false }
        )
      }
      return
    }

    if (command.type === 'production_pause') {
      if (command.queueType === 'unit') {
        productionQueue.setUnitPaused(command.paused, { record: false })
      } else if (command.queueType === 'building') {
        productionQueue.setBuildingPaused(command.paused, { record: false })
      }
      return
    }

    if (command.type === 'remote_control_action') {
      const action = command.action
      if (action && gameState.remoteControl && typeof gameState.remoteControl[action] === 'number') {
        gameState.remoteControl[action] = command.active ? Math.max(0, Math.min(1, command.intensity || 1)) : 0
      }
      return
    }

    if (command.type === 'remote_control_absolute') {
      gameState.remoteControlAbsolute = {
        wagonDirection: command.wagonDirection ?? null,
        wagonSpeed: Number.isFinite(command.wagonSpeed) ? command.wagonSpeed : 0,
        turretDirection: command.turretDirection ?? null,
        turretTurnFactor: Number.isFinite(command.turretTurnFactor) ? command.turretTurnFactor : 0
      }
      return
    }

    if (command.type === 'cheat_code') {
      if (!executeReplayCommand.cheatSystemInstance) {
        executeReplayCommand.cheatSystemInstance = new CheatSystem()
      }
      executeReplayCommand.cheatSystemInstance.processCheatCode(command.code || '')
    }
  } finally {
    replay.isApplyingReplayCommand = false
  }
}

export function updateReplayPlayback() {
  const replay = ensureReplayState()
  if (!replay.playbackActive || gameState.gamePaused) return

  const elapsed = Math.max(0, getNowMs() - replay.playbackStartedAt)
  while (replay.playbackCursor < replay.playbackCommands.length && replay.playbackCommands[replay.playbackCursor].at <= elapsed) {
    executeReplayCommand(replay.playbackCommands[replay.playbackCursor])
    replay.playbackCursor += 1
  }

  if (replay.playbackCursor >= replay.playbackCommands.length) {
    replay.playbackActive = false
    showNotification('Replay finished')
  }
}

export function loadReplay(key) {
  if (typeof localStorage === 'undefined') return
  const raw = localStorage.getItem(key)
  if (!raw) return

  const parsed = JSON.parse(raw)
  if (!parsed?.baselineState) {
    showNotification('Replay is missing baseline state')
    return
  }

  const tempLabel = `${TEMP_BASELINE_LABEL_PREFIX}load_${Date.now()}`
  const tempKey = `rts_save_${tempLabel}`
  localStorage.setItem(tempKey, JSON.stringify({
    label: tempLabel,
    time: Date.now(),
    state: parsed.baselineState
  }))

  loadGame(tempKey)
  localStorage.removeItem(tempKey)

  const replay = ensureReplayState()
  replay.playbackActive = true
  replay.playbackStartedAt = getNowMs()
  replay.playbackCursor = 0
  replay.playbackCommands = Array.isArray(parsed.commands) ? parsed.commands : []
  gameState.gamePaused = false
  gameState.replayMode = true
  syncPauseButtonIcon()
  showNotification(`Loaded replay: ${parsed.label || 'Unnamed replay'}`)
}

export function updateRecordButtonState() {
  const replay = ensureReplayState()
  const recordBtn = document.getElementById('recordBtn')
  if (!recordBtn) return
  recordBtn.classList.toggle('recording-active', replay.recordingActive)
  recordBtn.setAttribute('aria-pressed', replay.recordingActive ? 'true' : 'false')
}

export function exportReplay(key) {
  if (typeof localStorage === 'undefined') return

  const rawReplay = localStorage.getItem(key)
  if (!rawReplay) {
    window.logger.warn('No replay found to export for key:', key)
    return
  }

  let replayObj = null
  try {
    replayObj = JSON.parse(rawReplay)
  } catch (err) {
    window.logger.warn('Failed to parse replay data for export:', err)
    return
  }

  const payload = JSON.stringify(replayObj, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = buildReplayExportFilename(replayObj?.label, replayObj?.time)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export function deleteReplay(key) {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(key)
}

function createReplayRowActionButton({ title, ariaLabel, html, onClick }) {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = title
  button.setAttribute('aria-label', ariaLabel)
  button.classList.add('action-button', 'icon-button')
  button.style.marginLeft = '6px'
  button.innerHTML = html
  button.onclick = (event) => {
    event.stopPropagation()
    onClick()
  }
  return button
}

export function updateReplayList() {
  const list = document.getElementById('replayList')
  if (!list) return
  list.innerHTML = ''

  listReplays().forEach(replay => {
    const rawReplay = JSON.parse(localStorage.getItem(replay.key) || '{}')
    const startTs = Number.isFinite(rawReplay.startedAtWallClock) ? rawReplay.startedAtWallClock : replay.time
    const durationMs = Number.isFinite(rawReplay.durationMs) ? rawReplay.durationMs : (
      Array.isArray(rawReplay.commands) && rawReplay.commands.length > 0 ? rawReplay.commands[rawReplay.commands.length - 1].at : 0
    )
    const li = document.createElement('li')
    li.style.display = 'flex'
    li.style.alignItems = 'center'
    li.style.justifyContent = 'space-between'
    li.style.padding = '2px 0'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'save-game-label-button'
    btn.style.flex = '1'
    const replayLabel = formatReplayListLabel(startTs, durationMs)
    btn.title = `Load ${replayLabel}`
    btn.textContent = replayLabel
    btn.onclick = () => loadReplay(replay.key)
    li.appendChild(btn)

    li.appendChild(createReplayRowActionButton({
      title: 'Export replay as JSON',
      ariaLabel: 'Export replay',
      html: '<img src="/icons/export.svg" alt="Export" class="button-icon white-icon">',
      onClick: () => exportReplay(replay.key)
    }))

    li.appendChild(createReplayRowActionButton({
      title: 'Delete replay',
      ariaLabel: 'Delete replay',
      html: '✗',
      onClick: () => {
        deleteReplay(replay.key)
        updateReplayList()
      }
    }))

    list.appendChild(li)
  })
}

export function initReplaySystem() {
  ensureReplayState()
  if (typeof window !== 'undefined') {
    window.recordReplayCommand = recordReplayCommand
  }

  const recordBtn = document.getElementById('recordBtn')
  if (recordBtn && recordBtn.dataset.boundReplay !== 'true') {
    recordBtn.dataset.boundReplay = 'true'
    recordBtn.addEventListener('click', () => toggleReplayRecording())
  }

  const saveTab = document.getElementById('saveListTab')
  const replayTab = document.getElementById('replayListTab')
  const savePane = document.getElementById('saveGamesPane')
  const replayPane = document.getElementById('replaysPane')

  const activateTab = (tab) => {
    const showReplays = tab === 'replays'
    saveTab?.classList.toggle('active', !showReplays)
    replayTab?.classList.toggle('active', showReplays)
    savePane?.classList.toggle('hidden', showReplays)
    replayPane?.classList.toggle('hidden', !showReplays)
  }

  saveTab?.addEventListener('click', () => activateTab('saves'))
  replayTab?.addEventListener('click', () => activateTab('replays'))

  updateRecordButtonState()
  updateReplayList()
}
