import '../utils/debugLogger.js'
import { TILE_SIZE, loadGraphicsSettingsFromIndexedDb, resolveRendererBackendAvailability, setGraphicsTunerOptions } from '../config.js'
import { advanceSimulationTime } from '../game/time.js'
import { gameState } from '../gameState.js'
import { mapGrid, factories, units, bullets } from '../main.js'
import { getGameRenderer, getTextureManager, prepareRuntimeSprites, publishPreparedRuntimeMap, renderGame, renderMinimap } from '../rendering.js'
import { prepareFireSprites } from '../rendering/fireSprites.js'
import { publishCanvasViewport } from '../rendering/prepared/canvasViewportRegistry.js'
import { hasHardwareGpuInfo, hasWebGlHardwareGpu } from '../rendering/waterRenderingMode.js'
import { updateGame } from '../updateGame.js'
import { prewarmDestructionExplosionTexture } from '../game/spriteSheetEffects.js'
import { framePhases } from '../performance/framePhases.js'
import { DEFAULT_SSE_SHEETS } from '../ui/spriteSheetRegistry.js'
import { fetchAssetJson } from '../utils/assetLoading.js'
import { GRAPHICS_BATTLE_MAP, GRAPHICS_BATTLE_VIEW } from './graphicsTunerLayout.js'
import { setupGraphicsBattle } from './graphicsTunerScenario.js'
import { TARGET_FRAME_MS, graphicsCadenceDeadline, summarizeGraphicsFrames } from './graphicsTunerModel.js'

const WARMUP_MS = 1100
const STATIONARY_MS = 1450
const MEASUREMENT_MS = 5800
const SCROLL_SPEED = 600
const SCROLL_SPAN = (GRAPHICS_BATTLE_MAP.width - GRAPHICS_BATTLE_VIEW.width) * TILE_SIZE
const FIRST_LAP_MS = 2 * SCROLL_SPAN / SCROLL_SPEED * 1000
const MAX_FRAME_SIMULATION_MS = 100

function canvases() {
  const world = ['gameCanvasGL', 'gameCanvasGPU', 'gameCanvas'].map(id => document.getElementById(id))
  const minimap = document.getElementById('minimap')
  const stage = document.createElement('main')
  stage.style.cssText = 'position:fixed;inset:0;background:#182126;overflow:hidden;'
  for (const canvas of world) stage.append(canvas)
  stage.append(minimap)
  document.body.replaceChildren(stage)
  document.body.className = ''
  return { world, minimap }
}

function configureCanvases(surfaces, density) {
  const width = GRAPHICS_BATTLE_VIEW.width * TILE_SIZE
  const height = GRAPHICS_BATTLE_VIEW.height * TILE_SIZE
  const zoom = Math.min(1, window.innerWidth / width, window.innerHeight / height)
  const cssWidth = width * zoom
  const cssHeight = height * zoom
  const effectiveDensity = density * zoom
  const backingWidth = Math.max(1, Math.round(cssWidth * density))
  const backingHeight = Math.max(1, Math.round(cssHeight * density))
  surfaces.world.forEach((canvas, index) => {
    canvas.style.cssText = `position:absolute;z-index:${index};left:${(window.innerWidth - cssWidth) / 2}px;top:${(window.innerHeight - cssHeight) / 2}px;width:${cssWidth}px;height:${cssHeight}px;`
    canvas.width = backingWidth
    canvas.height = backingHeight
    publishCanvasViewport(canvas, { logicalWidth: width, logicalHeight: height, backingWidth, backingHeight, density: effectiveDensity })
  })
  const minimapWidth = 160
  const minimapHeight = 100
  surfaces.minimap.style.cssText = 'position:absolute;z-index:3;bottom:8px;right:8px;width:160px;height:100px;'
  surfaces.minimap.width = minimapWidth * density
  surfaces.minimap.height = minimapHeight * density
  publishCanvasViewport(surfaces.minimap, { logicalWidth: minimapWidth, logicalHeight: minimapHeight, density })
  surfaces.context.setTransform(effectiveDensity, 0, 0, effectiveDensity, 0, 0)
  surfaces.context.imageSmoothingQuality = 'high'
  surfaces.miniContext.setTransform(density, 0, 0, density, 0, 0)
  gameState.canvasPixelRatio = effectiveDensity
  gameState.overlayCanvasPixelRatio = effectiveDensity
  gameState.rawCanvasPixelRatio = window.devicePixelRatio || 1
  return { width: backingWidth, height: backingHeight, effectiveDensity }
}

async function verifyHardware(gl) {
  if (hasWebGlHardwareGpu(gl)) return true
  try {
    const adapter = await navigator.gpu?.requestAdapter()
    return Boolean(adapter && hasHardwareGpuInfo(adapter.info, adapter.isFallbackAdapter))
  } catch {
    return false
  }
}

function animationWindow(duration, step, signal) {
  return new Promise((resolve, reject) => {
    let frame
    let first = null
    let previous = null
    const abort = () => finish(signal.reason)
    const finish = error => {
      cancelAnimationFrame(frame)
      signal.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }
    const tick = timestamp => {
      if (document.hidden || signal.aborted) {
        finish(signal.reason || new Error('Keep the benchmark visible while it runs.'))
        return
      }
      try {
        first ??= timestamp
        step(timestamp - first, previous === null ? 0 : timestamp - previous)
        previous = timestamp
        if (timestamp - first >= duration) finish()
        else frame = requestAnimationFrame(tick)
      } catch (error) {
        finish(error)
      }
    }
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    frame = requestAnimationFrame(tick)
  })
}

async function readDisplayCadence(signal) {
  const intervals = []
  await animationWindow(500, (_, interval) => { if (interval > 0) intervals.push(interval) }, signal)
  intervals.sort((a, b) => a - b)
  const fastestTypical = intervals[Math.floor(intervals.length / 4)]
  const refreshHz = 1000 / fastestTypical
  return { refreshHz, deadline: graphicsCadenceDeadline(refreshHz) }
}

function scrollBattle(elapsed) {
  const startX = GRAPHICS_BATTLE_VIEW.x * TILE_SIZE
  const startY = GRAPHICS_BATTLE_VIEW.y * TILE_SIZE
  if (elapsed <= STATIONARY_MS) {
    gameState.scrollOffset.x = startX
    gameState.scrollOffset.y = startY
    return
  }
  const travel = ((elapsed - STATIONARY_MS) / 1000 * SCROLL_SPEED + SCROLL_SPAN - startX) % (SCROLL_SPAN * 2)
  gameState.scrollOffset.x = Math.abs(SCROLL_SPAN - travel)
  gameState.scrollOffset.y = startY + Math.sin(travel * Math.PI / SCROLL_SPAN) * TILE_SIZE * 3
}

async function readBenchmarkSheets(entries, signal) {
  if (entries?.length) return entries
  const sheets = await Promise.all(DEFAULT_SSE_SHEETS.map(async sheetPath => ({
    sheetPath,
    metadata: await fetchAssetJson(`/${sheetPath.replace(/\.webp$/, '.json')}`, { signal })
  })))
  return sheets
}

export async function createGraphicsTunerSandbox(options, signal) {
  const surfaces = canvases()
  const [glCanvas, gpuCanvas, canvas] = surfaces.world
  surfaces.context = canvas.getContext('2d')
  surfaces.miniContext = surfaces.minimap.getContext('2d')
  surfaces.gl = glCanvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'high-performance' })
  if (!surfaces.context || !surfaces.miniContext || !await verifyHardware(surfaces.gl)) {
    throw new Error('This browser did not expose a verified hardware graphics adapter.')
  }

  window.gameState = gameState
  const renderer = getGameRenderer()
  const textures = getTextureManager()
  if (options.graphicsPreferences) loadGraphicsSettingsFromIndexedDb(options.graphicsPreferences)
  await resolveRendererBackendAvailability()
  gameState.selectionHudMode = options.selectionHudMode
  gameState.selectionHudBarThickness = options.selectionHudBarThickness
  const { refreshHz, deadline } = await readDisplayCadence(signal)
  if (!Number.isFinite(refreshHz)) throw new Error('Unable to measure the display refresh cadence.')
  const sheets = await readBenchmarkSheets(options.sheets, signal)
  await Promise.all([textures.preloadAllTextures(), prepareFireSprites(), prewarmDestructionExplosionTexture(gameState)])

  async function measure(profile) {
    signal.throwIfAborted()
    setGraphicsTunerOptions(profile.settings, { persist: false, notify: false })
    const backing = configureCanvases(surfaces, profile.settings.density)
    setupGraphicsBattle(textures)
    gameState.useIntegratedSpriteSheetMode = profile.settings.customSprites
    if (textures.integratedSpriteSheetMode !== profile.settings.customSprites) {
      await textures.setIntegratedSpriteSheetConfig({
        enabled: profile.settings.customSprites, sheets, biomeTag: 'grass', preparedTier: 'final'
      })
      if (profile.settings.customSprites && !textures.integratedSpriteSheetMode) throw new Error('Custom map sprites could not be prepared.')
    }
    const { registry } = await prepareRuntimeSprites({ density: backing.effectiveDensity, signal })
    if (registry) renderer.setPreparedSpriteRegistry(registry)
    renderer.mapRenderer.invalidateAllChunks()
    renderer.mapRenderer.computeSOTMask(mapGrid)
    const prepared = await publishPreparedRuntimeMap(mapGrid)
    if (!prepared) throw new Error('The benchmark terrain could not be prepared.')
    signal.throwIfAborted()

    const samples = []
    const stationary = []
    const scrolling = []
    const firstTraversal = []
    const repeatedTraversal = []
    let accumulator = 0
    let peakProjectiles = 0
    let peakSmoke = 0
    let lastMinimap = -Infinity
    let peakHeapBytes = null
    let peakGpuMs = null
    let nextDiagnostics = 0
    function draw(elapsed, interval, record) {
      scrollBattle(elapsed)
      const started = performance.now()
      accumulator += Math.min(interval, MAX_FRAME_SIMULATION_MS)
      while (accumulator >= TARGET_FRAME_MS) {
        advanceSimulationTime(TARGET_FRAME_MS, gameState)
        gameState.frameCount++
        updateGame(TARGET_FRAME_MS, mapGrid, factories, units, bullets, gameState)
        accumulator -= TARGET_FRAME_MS
      }
      const afterUpdate = performance.now()
      renderGame(surfaces.context, canvas, mapGrid, factories, units, bullets, gameState.buildings,
        gameState.scrollOffset, false, null, null, gameState, surfaces.gl, glCanvas, gpuCanvas)
      if (gameState.simulationTime - lastMinimap >= options.minimapInterval) {
        renderMinimap(surfaces.miniContext, surfaces.minimap, mapGrid, gameState.scrollOffset, canvas, units, gameState.buildings, gameState)
        lastMinimap = gameState.simulationTime
      }
      const afterRender = performance.now()
      framePhases.finishFrame(interval)
      peakProjectiles = Math.max(peakProjectiles, bullets.length)
      peakSmoke = Math.max(peakSmoke, gameState.smokeParticles.length)
      if (record && interval > 0) {
        const sample = { interval, update: afterUpdate - started, render: afterRender - afterUpdate }
        samples.push(sample)
        if (elapsed <= STATIONARY_MS) stationary.push(sample)
        else {
          scrolling.push(sample)
          ;(elapsed <= STATIONARY_MS + FIRST_LAP_MS ? firstTraversal : repeatedTraversal).push(sample)
        }
        if (elapsed >= nextDiagnostics) {
          const heap = performance.memory?.usedJSHeapSize
          const gpu = gameState.renderStats?.gpuOverlay?.gpuMilliseconds
          if (Number.isFinite(heap)) peakHeapBytes = Math.max(peakHeapBytes ?? 0, heap)
          if (Number.isFinite(gpu)) peakGpuMs = Math.max(peakGpuMs ?? 0, gpu)
          nextDiagnostics = elapsed + 250
        }
      }
    }

    await animationWindow(WARMUP_MS, (_, interval) => draw(0, interval, false), signal)
    await animationWindow(MEASUREMENT_MS, (elapsed, interval) => draw(elapsed, interval, true), signal)
    if (!peakProjectiles || !peakSmoke || !stationary.length || !firstTraversal.length || !repeatedTraversal.length) {
      throw new Error('The benchmark battle did not produce a comparable sample.')
    }
    return {
      ...profile,
      backing,
      backend: gameState.renderStats?.gpuTerrain?.backend || 'canvas',
      peakProjectiles,
      peakSmoke,
      peakHeapBytes,
      peakGpuMs,
      metrics: summarizeGraphicsFrames(samples, deadline),
      stationary: summarizeGraphicsFrames(stationary, deadline),
      scrolling: summarizeGraphicsFrames(scrolling, deadline),
      firstTraversal: summarizeGraphicsFrames(firstTraversal, deadline),
      repeatedTraversal: summarizeGraphicsFrames(repeatedTraversal, deadline)
    }
  }

  return { measure, refreshHz, deadline }
}

window.createGraphicsTunerSandbox = createGraphicsTunerSandbox
