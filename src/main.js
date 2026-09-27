// main.js
// Entry point orchestrating high-level wiring after code-splitting

import './utils/debugLogger.js'
import { registerMapEditorRendering } from './mapEditor.js'
import { getGameRenderer, getTextureManager, notifyTileMutation } from './rendering.js'
import { initializeMobileViewportLock } from './ui/mobileViewportLock.js'
import { scheduleAfterNextPaint, scheduleIdleTask } from './startupScheduler.js'
import { trackBootProgress } from './ui/loadingScreen.js'
import { bootMark } from './ui/bootTiming.js'
import { beginBootProgress, getBootProgress } from './ui/bootProgress.js'
import { initializeGameStorage } from './storage/indexedDbStorage.js'
import { RENDERER_BACKEND, loadGraphicsSettingsFromIndexedDb, resolveRendererBackendAvailability } from './config.js'
import './ui/mobileJoysticks.js'
import './ui/mobileControlGroups.js'
import {
  initDeviceLifecycle,
  updateTouchClass,
  updateStandaloneClass,
  setupDoubleTapPrevention,
  updateMobileLayoutClasses
} from './ui/deviceLifecycle.js'
import { setMobileLayoutGameAccessor } from './ui/mobileLayout.js'
import { initRemoteInviteLanding } from './ui/remoteInviteLanding.js'
import { initNotificationHistory } from './ui/notificationHistory.js'
import { initDebugUnitCommandOverlay } from './ui/debugUnitCommandOverlay.js'
import { initializePerformanceMonitor } from './performance/performanceMonitor.js'
import { selectedUnits } from './inputHandler.js'
import {
  resumeAllSounds,
  reloadMasterVolumeFromStorage,
  testNarratedSounds,
  playSound,
  getSoundCacheStatus,
  clearSoundCache
} from './sound.js'
import { startOfflineMode } from './pwa/offlineController.js'
import {
  Game,
  getCurrentGame,
  mapGrid,
  factories,
  units,
  bullets,
  buildingCosts,
  unitCosts,
  showNotification,
  sanitizeMapDimension,
  resolveMapSeed,
  loadPersistedSettings,
  regenerateMapForClient,
  updateVehicleButtonStates,
  updateBuildingButtonStates,
  MAP_SEED_STORAGE_KEY,
  PLAYER_COUNT_STORAGE_KEY,
  ORE_FIELD_COUNT_STORAGE_KEY,
  ORE_TOTAL_VALUE_STORAGE_KEY,
  MAP_WIDTH_TILES_STORAGE_KEY,
  MAP_HEIGHT_TILES_STORAGE_KEY
} from './game/gameOrchestrator.js'

startOfflineMode()

initializeMobileViewportLock()
registerMapEditorRendering(getTextureManager, notifyTileMutation)
setMobileLayoutGameAccessor(() => getCurrentGame())

function requestRenderAfterResize() {
  const game = getCurrentGame()
  if (game && game.gameLoop && typeof game.gameLoop.requestRender === 'function') {
    game.gameLoop.requestRender()
  }
}

initDeviceLifecycle({
  getGameInstanceAccessor: getCurrentGame,
  requestRender: requestRenderAfterResize
})

function setupAudioUnlock() {
  const unlock = () => {
    resumeAllSounds()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  window.addEventListener('touchstart', unlock, { once: true })
}

document.addEventListener('DOMContentLoaded', async() => {
  bootMark('dom-content-loaded')
  const boot = beginBootProgress()
  trackBootProgress()
  boot.start('storage')
  await initializeGameStorage()
  boot.finish('storage')
  bootMark('storage-ready')
  loadGraphicsSettingsFromIndexedDb()
  boot.start('backend')
  await resolveRendererBackendAvailability()
  if (RENDERER_BACKEND !== 'webgpu') getBootProgress()?.applyWebGLProfile()
  getBootProgress()?.finish('backend')
  bootMark('renderer-backend-ready')
  reloadMasterVolumeFromStorage()
  updateTouchClass()
  updateMobileLayoutClasses()
  setupDoubleTapPrevention()
  loadPersistedSettings()
  setupAudioUnlock()

  scheduleAfterNextPaint('startup:remote-invite-landing', () => {
    initRemoteInviteLanding()
  })

  scheduleIdleTask('startup:notification-history', () => {
    initNotificationHistory()
  })

  scheduleIdleTask('startup:debug-unit-command-overlay', () => {
    initDebugUnitCommandOverlay()
  })

  bootMark('game-construct')
  const gameInstance = new Game()
  window.gameInstance = gameInstance
  window.gameInstance.units = units
  window.gameInstance.renderer = getGameRenderer()
  initializePerformanceMonitor()
})

window.debugGetSelectedUnits = () => selectedUnits

window.testNarratedSounds = testNarratedSounds
window.debugPlaySound = playSound
window.getSoundCacheStatus = getSoundCacheStatus
window.clearSoundCache = clearSoundCache


export {
  mapGrid,
  factories,
  units,
  bullets,
  buildingCosts,
  unitCosts,
  showNotification,
  sanitizeMapDimension,
  resolveMapSeed,
  loadPersistedSettings,
  regenerateMapForClient,
  getCurrentGame,
  MAP_SEED_STORAGE_KEY,
  PLAYER_COUNT_STORAGE_KEY,
  ORE_FIELD_COUNT_STORAGE_KEY,
  ORE_TOTAL_VALUE_STORAGE_KEY,
  MAP_WIDTH_TILES_STORAGE_KEY,
  MAP_HEIGHT_TILES_STORAGE_KEY,
  updateTouchClass,
  updateStandaloneClass,
  updateVehicleButtonStates,
  updateBuildingButtonStates
}
