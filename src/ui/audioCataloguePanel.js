// Settings > Audio. The catalogue module and every audio file stay unloaded until this tab is opened
// and the player asks for one entry. Playback is local to this panel and never touches gameRandom.

import './audioCatalogue.css'
import { AUDIO_CATALOGUE, AUDIO_CATALOGUE_SECTIONS } from '../audio/audioCatalogue.js'
import { computeSpectrogram, computeWaveformPeaks } from './audioCatalogueVisual.js'

const PEAK_BUCKETS = 480
const SPEC_COLUMNS = 280
const SPEC_ROWS = 72
const SEEK_STEPS = 1000

let audioContext = null
let gainNode = null
let sourceNode = null
let buffer = null
let activeEntry = null
let offset = 0
let startedAt = 0
let playing = false
let seeking = false
let volume = 0.85
let mode = 'waveform'
let raf = 0
let playToken = 0
let peaks = null
let peakScale = 1
let spectrogram = null
let spectrogramImage = null
let root = null
let visibilityBound = false
const decoded = new Map()

function catalogueContext() {
  if (!audioContext) {
    const Context = window.AudioContext || window.webkitAudioContext
    audioContext = new Context()
    gainNode = audioContext.createGain()
    gainNode.gain.value = volume
    gainNode.connect(audioContext.destination)
  }
  return audioContext
}

function stopSource() {
  if (!sourceNode) return
  sourceNode.onended = null
  try { sourceNode.stop() } catch { /* already stopped */ }
  try { sourceNode.disconnect() } catch { /* already disconnected */ }
  sourceNode = null
}

function panelVisible() {
  if (!root || !root.isConnected) return false
  if (root.closest('[hidden]')) return false
  return document.hidden !== true
}

function cancelVisual() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function playbackTime() {
  if (!buffer) return 0
  const duration = buffer.duration || 0
  if (!playing || !audioContext) return Math.min(offset, duration)
  let elapsed = offset + (audioContext.currentTime - startedAt)
  if (activeEntry && activeEntry.loop && duration > 0) elapsed %= duration
  if (elapsed < 0) return 0
  if (elapsed > duration) return duration
  return elapsed
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const remain = whole % 60
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

function element(selector) {
  return root ? root.querySelector(selector) : null
}

function paint() {
  const canvas = element('.audio-catalogue__canvas')
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return
  const width = canvas.width
  const height = canvas.height
  const progress = buffer && buffer.duration > 0 ? playbackTime() / buffer.duration : 0
  if (mode === 'spectrogram' && spectrogram) {
    if (!spectrogramImage || spectrogramImage.width !== spectrogram.columns || spectrogramImage.height !== spectrogram.rows) {
      spectrogramImage = new window.ImageData(spectrogram.rgba, spectrogram.columns, spectrogram.rows)
    }
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, width, height)
    context.drawImage(holdCanvas(spectrogramImage), 0, 0, width, height)
  } else {
    context.fillStyle = '#0c1218'
    context.fillRect(0, 0, width, height)
    if (peaks) {
      const played = Math.floor(progress * width)
      const mid = height / 2
      for (let x = 0; x < width; x++) {
        const bucket = peaks[Math.floor((x * peaks.length) / width)] || 0
        const bar = Math.max(1, (bucket / peakScale) * (height * 0.46))
        context.fillStyle = x <= played ? '#8ec8ff' : '#2f6ea8'
        context.fillRect(x, mid - bar, 1, bar * 2)
      }
    }
  }
  if (buffer) {
    const x = Math.round(progress * (width - 1))
    context.fillStyle = '#ffcc66'
    context.fillRect(x, 0, 2, height)
  }
}

const blitCanvases = new Map()

function holdCanvas(image) {
  const key = `${image.width}x${image.height}`
  let canvas = blitCanvases.get(key)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    blitCanvases.set(key, canvas)
  }
  canvas.getContext('2d').putImageData(image, 0, 0)
  return canvas
}

function tick() {
  raf = 0
  if (!playing || !panelVisible()) return
  if (!seeking) syncSeek()
  paint()
  raf = requestAnimationFrame(tick)
}

function startVisual() {
  cancelVisual()
  paint()
  if (!playing || !panelVisible()) return
  raf = requestAnimationFrame(tick)
}

function syncSeek() {
  const seek = element('.audio-catalogue__seek')
  const current = element('.audio-catalogue__time')
  const time = playbackTime()
  if (current) current.textContent = formatTime(time)
  if (seek && buffer && !seeking) seek.value = String(Math.round((time / buffer.duration) * SEEK_STEPS))
}

function renderTransport() {
  const name = element('.audio-catalogue__now')
  const total = element('.audio-catalogue__duration')
  const play = element('.audio-catalogue__transport-play')
  if (name) name.textContent = activeEntry ? activeEntry.name : 'Nothing selected'
  if (total) total.textContent = buffer ? formatTime(buffer.duration) : '0:00'
  if (play) {
    play.textContent = playing ? 'Pause' : 'Play'
    play.setAttribute('aria-pressed', playing ? 'true' : 'false')
    play.disabled = !activeEntry
  }
  const seek = element('.audio-catalogue__seek')
  if (seek) seek.disabled = !buffer
  const stop = element('.audio-catalogue__stop')
  if (stop) stop.disabled = !activeEntry
  syncSeek()
  paint()
  markActiveRow()
}

function markActiveRow() {
  if (!root) return
  root.querySelectorAll('.audio-catalogue__row').forEach(row => {
    const on = activeEntry && row.dataset.id === activeEntry.id
    row.classList.toggle('audio-catalogue__row--active', Boolean(on))
    if (on) row.setAttribute('aria-current', 'true')
    else row.removeAttribute('aria-current')
    const button = row.querySelector('.audio-catalogue__row-play')
    if (button) button.textContent = on && playing ? '❚❚' : '▶'
  })
}

function rememberBuffer(id, decodedBuffer) {
  decoded.delete(id)
  decoded.set(id, decodedBuffer)
  while (decoded.size > 2) decoded.delete(decoded.keys().next().value)
}

async function loadBuffer(entry) {
  const cached = decoded.get(entry.id)
  if (cached) {
    rememberBuffer(entry.id, cached)
    return cached
  }
  const response = await fetch(`/${entry.file}`)
  if (!response.ok) throw new Error(`Could not load ${entry.file} (${response.status})`)
  const bytes = await response.arrayBuffer()
  const decodedBuffer = await catalogueContext().decodeAudioData(bytes.slice(0))
  rememberBuffer(entry.id, decodedBuffer)
  return decodedBuffer
}

function prepareVisuals(decodedBuffer) {
  const channel = decodedBuffer.getChannelData(0)
  peaks = computeWaveformPeaks(channel, Math.min(PEAK_BUCKETS, channel.length || 1))
  peakScale = 0.001
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > peakScale) peakScale = peaks[i]
  spectrogram = computeSpectrogram(channel, { columns: SPEC_COLUMNS, rows: SPEC_ROWS })
  spectrogramImage = null
}

function startAt(seconds) {
  stopSource()
  const audio = catalogueContext()
  sourceNode = audio.createBufferSource()
  sourceNode.buffer = buffer
  sourceNode.loop = Boolean(activeEntry && activeEntry.loop)
  sourceNode.connect(gainNode)
  offset = Math.max(0, Math.min(seconds, Math.max(0, buffer.duration - 0.01)))
  startedAt = audio.currentTime
  const token = playToken
  sourceNode.onended = () => {
    if (token !== playToken || sourceNode && sourceNode.loop) return
    if (!playing) return
    playing = false
    offset = 0
    cancelVisual()
    renderTransport()
  }
  sourceNode.start(0, offset)
  playing = true
  startVisual()
  renderTransport()
}

export function stopAudioCatalogue() {
  playToken += 1
  playing = false
  offset = 0
  stopSource()
  cancelVisual()
  if (audioContext && audioContext.state === 'running') audioContext.suspend().catch(() => {})
  renderTransport()
}

async function playEntry(entry, resumePromise) {
  const token = ++playToken
  if (activeEntry && activeEntry.id === entry.id && buffer && playing) {
    offset = playbackTime()
    playing = false
    stopSource()
    cancelVisual()
    renderTransport()
    return
  }
  if (!activeEntry || activeEntry.id !== entry.id) {
    playing = false
    offset = 0
    stopSource()
    cancelVisual()
  }
  activeEntry = entry
  const status = element('.audio-catalogue__status')
  if (!buffer || decoded.get(entry.id) !== buffer) {
    if (status) status.textContent = 'Loading…'
  }
  renderTransport()
  try {
    const next = await loadBuffer(entry)
    if (resumePromise) await resumePromise
    if (token !== playToken) return
    if (buffer !== next) {
      buffer = next
      prepareVisuals(next)
      offset = 0
    }
    const rowTime = element(`.audio-catalogue__row[data-id="${entry.id}"] .audio-catalogue__row-time`)
    if (rowTime) rowTime.textContent = formatTime(next.duration)
    if (audioContext.state === 'suspended') await audioContext.resume()
    if (token !== playToken) return
    if (status) status.textContent = ''
    startAt(buffer === next && offset ? offset : 0)
  } catch (error) {
    if (token !== playToken) return
    playing = false
    stopSource()
    cancelVisual()
    if (decoded.get(entry.id) !== buffer) {
      buffer = null
      peaks = null
      spectrogram = null
      spectrogramImage = null
      offset = 0
    }
    if (status) status.textContent = error && error.message ? error.message : 'Playback failed'
    renderTransport()
  }
}

function onPlay(entry) {
  const audio = catalogueContext()
  const resumePromise = audio.state === 'suspended' ? audio.resume() : Promise.resolve()
  playEntry(entry, resumePromise)
}

function applyFilter() {
  const query = (element('.audio-catalogue__search')?.value || '').trim().toLowerCase()
  const empty = element('.audio-catalogue__empty')
  let shown = 0
  for (const section of root.querySelectorAll('.audio-catalogue__section')) {
    let sectionShown = 0
    for (const row of section.querySelectorAll('.audio-catalogue__row')) {
      const haystack = row.dataset.search || ''
      const match = !query || haystack.includes(query)
      row.hidden = !match
      const detail = row.nextElementSibling
      if (detail && detail.classList.contains('audio-catalogue__detail')) detail.hidden = !match || detail.dataset.open !== 'true'
      if (match) sectionShown += 1
    }
    section.hidden = sectionShown === 0
    if (query && sectionShown) section.open = true
    shown += sectionShown
  }
  if (empty) empty.hidden = shown !== 0
}

function buildRow(entry) {
  const row = document.createElement('div')
  row.className = 'audio-catalogue__row'
  row.dataset.id = entry.id
  row.dataset.search = `${entry.name} ${entry.file} ${entry.description} ${entry.prompt || ''} ${entry.modelId || ''}`.toLowerCase()
  const play = document.createElement('button')
  play.type = 'button'
  play.className = 'audio-catalogue__row-play'
  play.textContent = '▶'
  play.setAttribute('aria-label', `Play ${entry.name}`)
  play.addEventListener('click', () => onPlay(entry))
  const expand = document.createElement('button')
  expand.type = 'button'
  expand.className = 'audio-catalogue__expand'
  expand.setAttribute('aria-expanded', 'false')
  const title = document.createElement('span')
  title.className = 'audio-catalogue__name'
  title.textContent = entry.name
  const nameLine = document.createElement('span')
  nameLine.className = 'audio-catalogue__name-line'
  nameLine.append(title)
  if (entry.loop) {
    const badge = document.createElement('span')
    badge.className = 'audio-catalogue__loop'
    badge.textContent = 'Loop'
    nameLine.append(badge)
  }
  const file = document.createElement('span')
  file.className = 'audio-catalogue__file'
  file.textContent = entry.file
  expand.append(nameLine, file)
  expand.addEventListener('click', () => {
    const detail = row.nextElementSibling
    const open = detail.hidden
    detail.hidden = !open
    detail.dataset.open = open ? 'true' : 'false'
    expand.setAttribute('aria-expanded', open ? 'true' : 'false')
  })
  const time = document.createElement('span')
  time.className = 'audio-catalogue__row-time'
  time.textContent = '—'
  row.append(play, expand, time)

  const detail = document.createElement('div')
  detail.className = 'audio-catalogue__detail'
  detail.hidden = true
  const description = document.createElement('p')
  description.textContent = entry.description
  detail.append(description)
  if (entry.modelId || entry.prompt) {
    const meta = document.createElement('p')
    meta.className = 'audio-catalogue__meta'
    meta.textContent = entry.modelId ? `Model ${entry.modelId}` : 'Generation notes'
    detail.append(meta)
  }
  if (entry.prompt) {
    const prompt = document.createElement('p')
    prompt.className = 'audio-catalogue__prompt'
    prompt.textContent = entry.prompt
    detail.append(prompt)
  }
  return [row, detail]
}

function build(panel) {
  panel.textContent = ''
  const wrap = document.createElement('div')
  wrap.className = 'audio-catalogue'
  wrap.innerHTML = `
    <div class="audio-catalogue__toolbar">
      <label class="audio-catalogue__search-label" for="audioCatalogueSearch">Search the catalogue</label>
      <input id="audioCatalogueSearch" class="audio-catalogue__search" type="search" placeholder="Search name, file, or when it plays" autocomplete="off">
      <p class="audio-catalogue__count">${AUDIO_CATALOGUE.length} sounds. Nothing is downloaded until you press play.</p>
    </div>
    <div class="audio-catalogue__list"></div>
    <p class="audio-catalogue__empty" hidden>No sounds match that search.</p>
    <section class="audio-catalogue__player" aria-label="Audio preview">
      <div class="audio-catalogue__player-head">
        <p class="audio-catalogue__now">Nothing selected</p>
        <div class="audio-catalogue__modes" role="group" aria-label="Visual display">
          <button type="button" class="audio-catalogue__mode" data-mode="waveform" aria-pressed="true">Waveform</button>
          <button type="button" class="audio-catalogue__mode" data-mode="spectrogram" aria-pressed="false">Spectrogram</button>
        </div>
      </div>
      <canvas class="audio-catalogue__canvas" width="640" height="96" aria-hidden="true"></canvas>
      <p class="audio-catalogue__status" role="status"></p>
      <div class="audio-catalogue__transport">
        <button type="button" class="audio-catalogue__transport-play" disabled>Play</button>
        <button type="button" class="audio-catalogue__stop" disabled>Stop</button>
        <label class="audio-catalogue__seek-label">
          <span class="audio-catalogue__time">0:00</span>
          <input class="audio-catalogue__seek" type="range" min="0" max="${SEEK_STEPS}" value="0" step="1" aria-label="Seek" disabled>
          <span class="audio-catalogue__duration">0:00</span>
        </label>
        <label class="audio-catalogue__volume-label">
          Amplitude
          <input class="audio-catalogue__volume" type="range" min="0" max="100" value="${Math.round(volume * 100)}" step="1" aria-label="Preview amplitude">
        </label>
      </div>
    </section>
  `
  const list = wrap.querySelector('.audio-catalogue__list')
  for (const section of AUDIO_CATALOGUE_SECTIONS) {
    const entries = AUDIO_CATALOGUE.filter(entry => entry.section === section.id)
    if (!entries.length) continue
    const details = document.createElement('details')
    details.className = 'audio-catalogue__section'
    details.open = section.id === 'music'
    const summary = document.createElement('summary')
    summary.textContent = `${section.title} (${entries.length})`
    details.append(summary)
    for (const entry of entries) details.append(...buildRow(entry))
    list.append(details)
  }
  wrap.querySelector('.audio-catalogue__search').addEventListener('input', applyFilter)
  wrap.querySelector('.audio-catalogue__transport-play').addEventListener('click', () => {
    if (!activeEntry) return
    onPlay(activeEntry)
  })
  wrap.querySelector('.audio-catalogue__stop').addEventListener('click', () => {
    playToken += 1
    playing = false
    offset = 0
    stopSource()
    cancelVisual()
    renderTransport()
  })
  const seek = wrap.querySelector('.audio-catalogue__seek')
  seek.addEventListener('input', () => {
    seeking = true
    if (!buffer) return
    offset = (Number(seek.value) / SEEK_STEPS) * buffer.duration
    syncSeek()
  })
  seek.addEventListener('change', () => {
    seeking = false
    if (!buffer) return
    const time = (Number(seek.value) / SEEK_STEPS) * buffer.duration
    if (playing) startAt(time)
    else {
      offset = time
      renderTransport()
    }
  })
  const volumeInput = wrap.querySelector('.audio-catalogue__volume')
  volumeInput.addEventListener('input', () => {
    volume = Number(volumeInput.value) / 100
    if (gainNode) gainNode.gain.value = volume
  })
  wrap.querySelectorAll('.audio-catalogue__mode').forEach(button => {
    button.addEventListener('click', () => {
      mode = button.dataset.mode
      wrap.querySelectorAll('.audio-catalogue__mode').forEach(other => {
        other.setAttribute('aria-pressed', other === button ? 'true' : 'false')
        other.classList.toggle('audio-catalogue__mode--active', other === button)
      })
      paint()
    })
  })
  wrap.querySelector('[data-mode="waveform"]').classList.add('audio-catalogue__mode--active')
  panel.append(wrap)
  root = wrap
  const canvas = wrap.querySelector('.audio-catalogue__canvas')
  const fit = () => {
    const rect = canvas.getBoundingClientRect()
    const nextWidth = Math.max(320, Math.round(rect.width))
    const nextHeight = Math.max(72, Math.round(rect.height))
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth
      canvas.height = nextHeight
      paint()
    }
  }
  requestAnimationFrame(fit)
  if (typeof window.ResizeObserver === 'function') new window.ResizeObserver(fit).observe(canvas)
  if (!visibilityBound) {
    document.addEventListener('visibilitychange', () => {
      if (!playing) return
      if (document.hidden) cancelVisual()
      else startVisual()
    })
    visibilityBound = true
  }
}

export function mountAudioCatalogue(panel) {
  if (!panel || panel.dataset.audioCatalogueMounted === 'true') {
    if (panel && root) startVisual()
    return
  }
  panel.dataset.audioCatalogueMounted = 'true'
  build(panel)
}
