// main.js
// Entry point orchestrating high-level wiring after code-splitting

import './utils/debugLogger.js'
import { registerMapEditorRendering } from './mapEditor.js'
import { getTextureManager, notifyTileMutation } from './rendering.js'
import { initializeMobileViewportLock } from './ui/mobileViewportLock.js'
import { scheduleAfterNextPaint, scheduleIdleTask } from './startupScheduler.js'
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
import { selectedUnits } from './inputHandler.js'
import {
  resumeAllSounds,
  testNarratedSounds,
  playSound,
  getSoundCacheStatus,
  clearSoundCache
} from './sound.js'
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
  MAP_WIDTH_TILES_STORAGE_KEY,
  MAP_HEIGHT_TILES_STORAGE_KEY
} from './game/gameOrchestrator.js'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        window.logger.warn('Service worker registration failed', err)
      })
      return
    }

    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.unregister().catch(err => {
          window.logger.warn('Service worker unregistration failed', err)
        })
      })
    }).catch(err => {
      window.logger.warn('Service worker lookup failed', err)
    })

    if (typeof caches !== 'undefined' && caches?.keys) {
      caches.keys().then(cacheNames => {
        cacheNames
          .filter(name => name.startsWith('code-for-battle-cache-'))
          .forEach(name => {
            caches.delete(name).catch(err => {
              window.logger.warn('Failed to delete service worker cache', name, err)
            })
          })
      }).catch(err => {
        window.logger.warn('Failed to enumerate service worker caches', err)
      })
    }
  })
}

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

  const gameInstance = new Game()
  window.gameInstance = gameInstance
  window.gameInstance.units = units
})

window.debugGetSelectedUnits = () => selectedUnits

window.testNarratedSounds = testNarratedSounds
window.debugPlaySound = playSound
window.debugShorelineMesh = false
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
  MAP_WIDTH_TILES_STORAGE_KEY,
  MAP_HEIGHT_TILES_STORAGE_KEY,
  updateTouchClass,
  updateStandaloneClass,
  updateVehicleButtonStates,
  updateBuildingButtonStates
}
