import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const htmlPath = path.resolve(process.cwd(), 'index.html')
const smokeDelayMs = 2000

const formatFailure = (value) => {
  if (value instanceof Error) {
    return value.stack || value.message
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const waitFor = async(predicate, timeoutMs, errorMessage) => {
  const start = performance.now()

  while (!predicate()) {
    if (performance.now() - start >= timeoutMs) {
      throw new Error(errorMessage)
    }

    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

const createFetchMock = () => vi.fn(async(input) => {
  const url = typeof input === 'string' ? input : input?.url ?? ''
  const baseResponse = {
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async() => new ArrayBuffer(0),
    text: async() => ''
  }

  if (url.includes('grass_tiles.json')) {
    return {
      ...baseResponse,
      json: async() => ({
        passablePaths: [],
        decorativePaths: [],
        impassablePaths: [],
        metadata: { generatedAt: 'smoke-test' }
      })
    }
  }

  return {
    ...baseResponse,
    json: async() => ({})
  }
})

describe('Browser smoke test', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads the game without console errors', async() => {
    const html = readFileSync(htmlPath, 'utf-8')
    document.documentElement.innerHTML = html

    const startupFailures = []
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      startupFailures.push(`console.error: ${args.map(formatFailure).join(' ')}`)
    })

    const handleWindowError = (event) => {
      startupFailures.push(`window.error: ${formatFailure(event.error || event.message)}`)
    }

    const handleUnhandledRejection = (event) => {
      startupFailures.push(`unhandledrejection: ${formatFailure(event.reason)}`)
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    vi.stubGlobal('fetch', createFetchMock())

    try {
      await import('../../src/main.js')
      document.dispatchEvent(new window.Event('DOMContentLoaded'))

      await waitFor(
        () => Boolean(window.gameInstance),
        smokeDelayMs,
        'Game instance was not created during smoke test startup'
      )

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(window.gameInstance).toBeTruthy()
      expect(startupFailures, `Startup failures detected:\n${startupFailures.join('\n')}`).toHaveLength(0)
    } finally {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  })
})
