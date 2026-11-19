import {
  COASTAL_SHALLOWS_ENABLED, DETAILED_SELECTION_HUD_ENABLED, RENDER_PIXEL_DENSITY, SMOKE_RENDERING_ENABLED,
  UNIT_SHADOWS_ENABLED, USE_OCEAN_WATER_RENDERING, setGraphicsTunerOptions
} from '../config.js'
import { gameState } from '../gameState.js'
import { GRAPHICS_TUNER_FEATURES, formatGraphicsValue } from '../benchmark/graphicsTunerModel.js'
import { loadGraphicsTunerReport } from '../benchmark/graphicsTunerReportStore.js'
import { placeFloatingTip } from '../pwa/offlineController.js'

let activeInfo = null
let pinned = false
let dismissTimer

function hideGraphicsTip(tip) {
  clearTimeout(dismissTimer)
  activeInfo?.removeAttribute('aria-describedby')
  activeInfo = null
  pinned = false
  tip.hidden = true
}

function bindGraphicsTips(tip) {
  if (tip.dataset.bound) return
  tip.dataset.bound = 'true'
  const show = button => {
    clearTimeout(dismissTimer)
    activeInfo?.removeAttribute('aria-describedby')
    activeInfo = button
    tip.textContent = button.dataset.cost
    button.setAttribute('aria-describedby', tip.id)
    placeFloatingTip(button, tip)
  }
  const hideAfterPointerLeaves = () => {
    clearTimeout(dismissTimer)
    if (!pinned) dismissTimer = setTimeout(() => hideGraphicsTip(tip), 150)
  }
  for (const button of document.querySelectorAll('.graphics-tuner-info')) {
    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch' && !pinned) show(button)
    })
    button.addEventListener('pointerleave', () => {
      if (activeInfo === button) hideAfterPointerLeaves()
    })
    button.addEventListener('focus', () => { if (button.matches(':focus-visible')) show(button) })
    button.addEventListener('click', () => {
      if (pinned && activeInfo === button) hideGraphicsTip(tip)
      else {
        pinned = true
        show(button)
      }
    })
  }
  tip.addEventListener('pointerenter', () => clearTimeout(dismissTimer))
  tip.addEventListener('pointerleave', hideAfterPointerLeaves)
  const dismissOutside = event => {
    if (activeInfo && !activeInfo.contains(event.target) && !tip.contains(event.target)) hideGraphicsTip(tip)
  }
  document.addEventListener('pointerdown', dismissOutside, true)
  document.addEventListener('focusin', dismissOutside, true)
  document.addEventListener('keydown', event => {
    if (!activeInfo || event.key !== 'Escape') return
    hideGraphicsTip(tip)
    event.stopImmediatePropagation()
  }, true)
  document.addEventListener('scroll', () => {
    if (!activeInfo) return
    const { left, top, width, height } = activeInfo.getBoundingClientRect()
    const visible = activeInfo.contains(document.elementFromPoint(left + width / 2, top + height / 2))
    if (visible) placeFloatingTip(activeInfo, tip)
    else hideGraphicsTip(tip)
  }, true)
  window.addEventListener('resize', () => { if (activeInfo) hideGraphicsTip(tip) })
}

function readGraphicsSettings() {
  return {
    shadows: UNIT_SHADOWS_ENABLED,
    selectionHud: DETAILED_SELECTION_HUD_ENABLED,
    density: RENDER_PIXEL_DENSITY,
    customSprites: gameState.useIntegratedSpriteSheetMode,
    smoke: SMOKE_RENDERING_ENABLED,
    oceanWater: USE_OCEAN_WATER_RENDERING,
    coastalShallows: COASTAL_SHALLOWS_ENABLED
  }
}

export function refreshGraphicsTunerControls(report = loadGraphicsTunerReport()) {
  const settings = readGraphicsSettings()
  const tip = document.getElementById('graphics-tuner-tip')
  if (tip && activeInfo) hideGraphicsTip(tip)
  for (const { key, label, control } of GRAPHICS_TUNER_FEATURES) {
    const input = document.getElementById(control)
    if (!input) continue
    if (key === 'density') input.value = String(settings.density ?? 'auto')
    else input.checked = Boolean(settings[key])

    const data = report?.ranking.find(feature => feature.key === key)
    const info = document.getElementById(`graphics-tuner-info-${key}`)
    if (!info) continue
    info.hidden = !data?.variants?.length
    if (!data?.variants?.length) continue
    const costs = data.variants.map(variant =>
      `${formatGraphicsValue(variant.value)} ${variant.fps.toFixed(1)} FPS, p95 ${variant.p95.toFixed(1)} ms`).join(' · ')
    info.dataset.cost = `Last device benchmark · ${costs}`
    info.setAttribute('aria-label', `Measured cost of ${label}`)
    if (tip) bindGraphicsTips(tip)
  }
  const viewReport = document.getElementById('settingsGraphicsTunerReport')
  if (viewReport) viewReport.hidden = !report
}

export async function applyGraphicsTunerSettings(settings) {
  const previous = readGraphicsSettings()
  const densityChanged = Object.hasOwn(settings, 'density') && settings.density !== previous.density
  const spritesChanged = Object.hasOwn(settings, 'customSprites') && (settings.customSprites !== previous.customSprites ||
    (settings.customSprites && gameState.activeSpriteSheetSelections?.length === 0))
  if (!densityChanged && !spritesChanged) {
    setGraphicsTunerOptions(settings)
    refreshGraphicsTunerControls()
    return
  }

  const { withPreparedRendering } = await import('../rendering/prepared/runtimeGraphicsPreparation.js')
  const { getGameRenderer, prepareRuntimeSprites, publishPreparedRuntimeMap } = await import('../rendering.js')
  const manager = window.gameInstance?.canvasManager
  const prepareDensity = async() => {
    manager?.resizeCanvases({ notifyDensity: false })
    const prepared = await prepareRuntimeSprites({ density: manager?.overlayPixelRatio })
    if (prepared?.registry) getGameRenderer().setPreparedSpriteRegistry(prepared.registry)
  }

  await withPreparedRendering(async() => {
    setGraphicsTunerOptions(settings, { persist: false, notify: false })
    try {
      if (densityChanged) await prepareDensity()
      if (spritesChanged) {
        const { setIntegratedSpriteSheetMode } = await import('./mapEditorControls.js')
        await setIntegratedSpriteSheetMode(settings.customSprites, { preserveTopology: true, restoreDefaults: true })
      } else if (densityChanged && gameState.mapGrid?.length) {
        const prepared = await publishPreparedRuntimeMap(gameState.mapGrid)
        if (!prepared) throw new Error('The new render density could not be prepared.')
      }
      setGraphicsTunerOptions(settings, { notify: false })
    } catch (error) {
      setGraphicsTunerOptions(previous, { persist: false, notify: false })
      if (densityChanged) {
        await prepareDensity()
        if (gameState.mapGrid?.length) await publishPreparedRuntimeMap(gameState.mapGrid)
      }
      throw error
    }
  })
  refreshGraphicsTunerControls()
}
