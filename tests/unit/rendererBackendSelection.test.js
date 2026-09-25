import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoredItem, resetGameStorageForTests } from '../../src/storage/indexedDbStorage.js'
import {
  describeRendererBackendStatus,
  summarizeWebGPUFailure,
  migrateRendererBackendChoice,
  probeWebGPUAvailability,
  resolveRequestedRendererBackend
} from '../../src/rendering/rendererBackendSelection.js'
import {
  GRAPHICS_SETTINGS_STORAGE_KEY,
  RENDERER_BACKEND,
  getActiveRendererBackend,
  getRendererBackendChoice,
  getRendererBackendStatusText,
  loadGraphicsSettingsFromIndexedDb,
  noteActiveRendererBackend,
  resetRendererBackendStateForTests,
  setRendererBackendFailureSummary,
  resolveRendererBackendAvailability,
  setRendererBackend,
  setWaterEffectTone,
  WATER_EFFECT_TONE
} from '../../src/config.js'
import { getConfigValue, setConfigValue } from '../../src/configRegistry.js'

function storedGraphics() {
  const raw = getStoredItem(GRAPHICS_SETTINGS_STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

function storeGraphics(value) {
  resetGameStorageForTests({
    [GRAPHICS_SETTINGS_STORAGE_KEY]: JSON.stringify(value)
  })
}

describe('renderer backend selection', () => {
  beforeEach(() => {
    resetGameStorageForTests()
    resetRendererBackendStateForTests()
  })

  describe('migrateRendererBackendChoice', () => {
    it('treats a missing record as automatic', () => {
      expect(migrateRendererBackendChoice(null)).toBe('auto')
      expect(migrateRendererBackendChoice(undefined)).toBe('auto')
    })

    it('treats a legacy webgl value as automatic', () => {
      expect(migrateRendererBackendChoice({ rendererBackend: 'webgl' })).toBe('auto')
      expect(migrateRendererBackendChoice({ useProceduralWaterRendering: true })).toBe('auto')
      expect(migrateRendererBackendChoice({ rendererBackend: 'webgl2' })).toBe('auto')
    })

    it('treats a legacy webgpu value as an explicit choice', () => {
      expect(migrateRendererBackendChoice({ rendererBackend: 'webgpu' })).toBe('webgpu')
    })

    it('keeps a stored explicit choice, including explicit webgl', () => {
      expect(migrateRendererBackendChoice({
        rendererBackend: 'webgl',
        rendererBackendChoice: 'webgl'
      })).toBe('webgl')
      expect(migrateRendererBackendChoice({
        rendererBackend: 'webgpu',
        rendererBackendChoice: 'auto'
      })).toBe('auto')
      expect(migrateRendererBackendChoice({
        rendererBackendChoice: 'webgpu'
      })).toBe('webgpu')
    })
  })

  describe('resolveRequestedRendererBackend', () => {
    it('uses webgpu for automatic and explicit webgpu only when a device is available', () => {
      expect(resolveRequestedRendererBackend('auto', true)).toBe('webgpu')
      expect(resolveRequestedRendererBackend('auto', false)).toBe('webgl')
      expect(resolveRequestedRendererBackend('webgpu', true)).toBe('webgpu')
      expect(resolveRequestedRendererBackend('webgpu', false)).toBe('webgl')
    })

    it('keeps an explicit webgl choice even when webgpu is available', () => {
      expect(resolveRequestedRendererBackend('webgl', true)).toBe('webgl')
    })
  })

  describe('describeRendererBackendStatus', () => {
    it('describes the backend actually in use without hiding an explicit choice', () => {
      expect(describeRendererBackendStatus({ choice: 'auto', requested: 'webgpu', active: null })).toBe('Using WebGPU.')
      expect(describeRendererBackendStatus({ choice: 'auto', requested: 'webgl', active: 'webgl' })).toBe('Using WebGL. WebGPU is not available in this browser.')
      expect(describeRendererBackendStatus({ choice: 'webgl', requested: 'webgl', active: 'webgl' })).toBe('Using WebGL.')
      expect(describeRendererBackendStatus({ choice: 'webgpu', requested: 'webgl', active: 'webgl' })).toBe('WebGPU did not initialize. Using WebGL.')
      expect(describeRendererBackendStatus({ choice: 'webgpu', requested: 'webgpu', active: 'webgl' })).toBe('WebGPU did not initialize. Using WebGL.')
      expect(describeRendererBackendStatus({
        choice: 'webgpu',
        requested: 'webgpu',
        active: 'webgl',
        failureSummary: 'shader validation'
      })).toBe('WebGPU failed: shader validation – using WebGL')
    })
  })

  describe('summarizeWebGPUFailure', () => {
    it('maps shader, pipeline, adapter, and device failures to a short settings reason', () => {
      expect(summarizeWebGPUFailure(
        "WebGPU pipeline validation failed: Error while parsing WGSL: :91:45 error: 'textureSample' must only be called from uniform control flow"
      )).toBe('shader validation')
      expect(summarizeWebGPUFailure('WebGPU pipeline validation failed: invalid blend')).toBe('pipeline validation')
      expect(summarizeWebGPUFailure('No WebGPU adapter is available')).toBe('no adapter')
      expect(summarizeWebGPUFailure('device request failed')).toBe('device request failed')
      expect(summarizeWebGPUFailure('Could not create a WebGPU canvas context')).toBe('canvas context failed')
      expect(summarizeWebGPUFailure('WebGPU device lost')).toBe('device lost')
      expect(summarizeWebGPUFailure('Device was destroyed.')).toBe('device lost')
      expect(summarizeWebGPUFailure('')).toBe('initialization failed')
    })
  })

  describe('probeWebGPUAvailability', () => {
    it('rejects a missing gpu object, a missing adapter, and a failed device request', async() => {
      await expect(probeWebGPUAvailability(undefined)).resolves.toBe(false)
      await expect(probeWebGPUAvailability({ requestAdapter: async() => null })).resolves.toBe(false)
      await expect(probeWebGPUAvailability({
        requestAdapter: async() => ({ requestDevice: async() => { throw new Error('no device') } })
      })).resolves.toBe(false)
    })

    it('accepts webgpu only after a device is created and then releases that device', async() => {
      const destroy = vi.fn()
      const available = await probeWebGPUAvailability({
        requestAdapter: async() => ({ requestDevice: async() => ({ destroy }) })
      })
      expect(available).toBe(true)
      expect(destroy).toHaveBeenCalledTimes(1)
    })

    it('treats a hung adapter request as unavailable', async() => {
      const started = Date.now()
      await expect(probeWebGPUAvailability({
        requestAdapter: () => new Promise(() => {})
      }, { timeoutMs: 20 })).resolves.toBe(false)
      expect(Date.now() - started).toBeLessThan(500)
    })

    it('releases a device that arrives after the probe times out', async() => {
      let resolveDevice
      const device = { destroy: vi.fn() }
      const pending = probeWebGPUAvailability({
        requestAdapter: async() => ({
          requestDevice: () => new Promise(resolve => {
            resolveDevice = resolve
          })
        })
      }, { timeoutMs: 15 })

      await expect(pending).resolves.toBe(false)
      resolveDevice(device)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(device.destroy).toHaveBeenCalledTimes(1)
    })
  })

  describe('persisted graphics settings', () => {
    it('selects webgpu for a fresh profile when the probe succeeds and does not store that as an explicit choice', async() => {
      loadGraphicsSettingsFromIndexedDb()
      expect(getRendererBackendChoice()).toBe('auto')

      await expect(resolveRendererBackendAvailability(async() => true)).resolves.toBe('webgpu')
      expect(RENDERER_BACKEND).toBe('webgpu')
      expect(getRendererBackendChoice()).toBe('auto')
      expect(getRendererBackendStatusText()).toBe('Using WebGPU.')
      expect(storedGraphics()).toBeNull()
    })

    it('falls back to webgl when webgpu cannot create a device', async() => {
      await expect(resolveRendererBackendAvailability(async() => false)).resolves.toBe('webgl')
      expect(getRendererBackendChoice()).toBe('auto')
      expect(RENDERER_BACKEND).toBe('webgl')
      expect(getRendererBackendStatusText()).toBe('Using WebGL. WebGPU is not available in this browser.')
    })

    it('migrates a legacy default webgl record to automatic and can then use webgpu', async() => {
      storeGraphics({
        useProceduralWaterRendering: true,
        waterEffectTone: 0.35,
        rendererBackend: 'webgl'
      })
      loadGraphicsSettingsFromIndexedDb()
      expect(getRendererBackendChoice()).toBe('auto')

      await resolveRendererBackendAvailability(async() => true)
      expect(RENDERER_BACKEND).toBe('webgpu')
      expect(getRendererBackendChoice()).toBe('auto')
    })

    it('does not turn an automatic choice into explicit webgl when another graphics setting is saved', () => {
      const originalTone = WATER_EFFECT_TONE
      storeGraphics({ rendererBackend: 'webgl', useProceduralWaterRendering: true })
      loadGraphicsSettingsFromIndexedDb()

      try {
        setWaterEffectTone(0.55)
        expect(storedGraphics()).toMatchObject({
          rendererBackend: 'auto',
          rendererBackendChoice: 'auto',
          waterEffectTone: 0.55
        })
      } finally {
        setWaterEffectTone(originalTone)
      }
    })

    it('keeps an explicit webgl choice ahead of a successful webgpu probe', async() => {
      storeGraphics({
        rendererBackend: 'webgl',
        rendererBackendChoice: 'webgl'
      })
      loadGraphicsSettingsFromIndexedDb()

      await resolveRendererBackendAvailability(async() => true)
      expect(getRendererBackendChoice()).toBe('webgl')
      expect(RENDERER_BACKEND).toBe('webgl')
      expect(getRendererBackendStatusText()).toBe('Using WebGL.')
    })

    it('keeps an explicit webgpu choice and falls back when initialization is unavailable', async() => {
      storeGraphics({ rendererBackend: 'webgpu' })
      loadGraphicsSettingsFromIndexedDb()
      expect(getRendererBackendChoice()).toBe('webgpu')

      await resolveRendererBackendAvailability(async() => false)
      expect(getRendererBackendChoice()).toBe('webgpu')
      expect(RENDERER_BACKEND).toBe('webgl')
      expect(getRendererBackendStatusText()).toBe('WebGPU did not initialize. Using WebGL.')

      const choice = await setRendererBackend('webgpu')
      expect(choice).toBe('webgpu')
      expect(storedGraphics()).toMatchObject({
        rendererBackend: 'webgpu',
        rendererBackendChoice: 'webgpu'
      })
    })

    it('persists an explicit webgl selection from the settings registry', async() => {
      expect(getConfigValue('rendererBackend')).toBe('auto')
      expect(setConfigValue('rendererBackend', 'webgl')).toBe(true)
      await resolveRendererBackendAvailability(async() => true)
      expect(getConfigValue('rendererBackend')).toBe('webgl')
      expect(RENDERER_BACKEND).toBe('webgl')
      expect(storedGraphics().rendererBackendChoice).toBe('webgl')
    })

    it('ignores a late successful probe after the user switches to webgl', async() => {
      let finishProbe
      const pending = resolveRendererBackendAvailability(() => new Promise(resolve => {
        finishProbe = resolve
      }))
      expect(getRendererBackendStatusText()).toBe('Checking WebGPU support…')

      await setRendererBackend('webgl')
      finishProbe(true)
      await pending

      expect(getRendererBackendChoice()).toBe('webgl')
      expect(RENDERER_BACKEND).toBe('webgl')
    })

    it('records the backend that actually drew and ignores unrelated names', () => {
      noteActiveRendererBackend('webgpu')
      expect(getActiveRendererBackend()).toBe('webgpu')
      noteActiveRendererBackend('cpu')
      expect(getActiveRendererBackend()).toBe('webgpu')
      noteActiveRendererBackend('webgl')
      expect(getActiveRendererBackend()).toBe('webgl')
    })

    it('updates the open settings status when WebGPU initialization fails after a successful probe', async() => {
      document.body.innerHTML = '<span id="settingsRendererBackendStatus"></span>'
      await resolveRendererBackendAvailability(async() => true)
      noteActiveRendererBackend('webgl')
      expect(document.getElementById('settingsRendererBackendStatus').textContent).toBe('WebGPU did not initialize. Using WebGL.')
      expect(getRendererBackendChoice()).toBe('auto')
    })

    it('shows the short WebGPU failure reason in the settings status', async() => {
      document.body.innerHTML = '<span id="settingsRendererBackendStatus"></span>'
      await resolveRendererBackendAvailability(async() => true)
      setRendererBackendFailureSummary('shader validation')
      noteActiveRendererBackend('webgl')
      expect(document.getElementById('settingsRendererBackendStatus').textContent)
        .toBe('WebGPU failed: shader validation – using WebGL')
      expect(getRendererBackendStatusText()).toBe('WebGPU failed: shader validation – using WebGL')
    })
  })
})
