import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import http from 'node:http'
import os from 'node:os'

const RUN_REAL_DEVICE_BENCHMARK = process.env.IOS_REAL_DEVICE_BENCHMARK === '1'
const APP_PORT = Number.parseInt(process.env.IOS_REAL_DEVICE_APP_PORT || '5173', 10)
const APP_COMMAND = process.env.IOS_REAL_DEVICE_APP_COMMAND || `npm run dev -- --host 0.0.0.0 --port ${APP_PORT}`
const HOST_OVERRIDE = process.env.IOS_REAL_DEVICE_HOST || ''
const BENCHMARK_DURATION_MS = Number.parseInt(process.env.IOS_BENCHMARK_DURATION_MS || '60000', 10)
const MIN_AVG_FPS = Number.parseFloat(process.env.IOS_BENCHMARK_MIN_AVG_FPS || '55')
const MAP_SIZE = Number.parseInt(process.env.IOS_BENCHMARK_MAP_SIZE || '100', 10)
const HEARTBEAT_MS = Number.parseInt(process.env.IOS_REAL_DEVICE_HEARTBEAT_MS || '1000', 10)
const PHONE_OPEN_TIMEOUT_MS = Number.parseInt(process.env.IOS_REAL_DEVICE_OPEN_TIMEOUT_MS || '300000', 10)
const RESULT_TIMEOUT_MS = Number.parseInt(
  process.env.IOS_REAL_DEVICE_RESULT_TIMEOUT_MS || String(BENCHMARK_DURATION_MS + 180000),
  10
)
const MAX_BLACK_TERRAIN_RATIO = Number.parseFloat(process.env.IOS_REAL_DEVICE_MAX_BLACK_TERRAIN_RATIO || '0.05')
const MAX_WHITE_STREET_RATIO = Number.parseFloat(process.env.IOS_REAL_DEVICE_MAX_WHITE_STREET_RATIO || '0.05')

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function appendOutput(output, chunk) {
  output.push(chunk.toString())
  while (output.join('').length > 20_000) {
    output.shift()
  }
}

function getLanHost() {
  if (HOST_OVERRIDE) {
    return HOST_OVERRIDE
  }

  const interfaces = os.networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address
      }
    }
  }

  return '127.0.0.1'
}

function startProcess(command) {
  const output = []
  const child = spawn(command, {
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout.on('data', chunk => appendOutput(output, chunk))
  child.stderr.on('data', chunk => appendOutput(output, chunk))
  const exitPromise = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => resolve(code))
  })

  return {
    child,
    exitPromise,
    getOutput: () => output.join('')
  }
}

function stopProcess(child) {
  if (!child || child.killed) return

  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, 'SIGTERM')
    } else {
      child.kill('SIGTERM')
    }
  } catch {
    child.kill('SIGTERM')
  }
}

async function waitForHttpOk(url, timeoutMs, appProcess) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    const exited = await Promise.race([
      appProcess.exitPromise.then(code => ({ exited: true, code })),
      wait(0).then(() => ({ exited: false }))
    ])
    if (exited.exited) {
      throw new Error(`App server exited before becoming reachable (exit ${exited.code}).\n${appProcess.getOutput()}`)
    }

    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.ok) {
        return
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (err) {
      lastError = err
    }
    await wait(1000)
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`)
}

async function startCollector(host) {
  const events = []
  let resolveFirstHeartbeat
  let resolveResult
  const firstHeartbeatPromise = new Promise(resolve => {
    resolveFirstHeartbeat = resolve
  })
  const resultPromise = new Promise(resolve => {
    resolveResult = resolve
  })

  const server = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method !== 'POST' || req.url !== '/ios-real-device-benchmark-result') {
      res.writeHead(404)
      res.end()
      return
    }

    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        events.push({ receivedAt: Date.now(), payload })
        if (payload.event === 'heartbeat') {
          resolveFirstHeartbeat(payload)
        } else if (payload.event === 'result' || !payload.event) {
          resolveResult(payload)
        }
        res.writeHead(204)
        res.end()
      } catch (err) {
        res.writeHead(400)
        res.end(err?.message || 'Invalid benchmark payload')
      }
    })
  })

  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve))
  const { port } = server.address()
  return {
    reportUrl: `http://${host}:${port}/ios-real-device-benchmark-result`,
    firstHeartbeatPromise,
    resultPromise,
    getEvents: () => [...events],
    close: () => new Promise(resolve => server.close(resolve))
  }
}

function buildBenchmarkUrl(appUrl, reportUrl) {
  const url = new URL(appUrl)
  url.searchParams.set('e2eIosBenchmark', '1')
  url.searchParams.set('benchmarkReportUrl', reportUrl)
  url.searchParams.set('benchmarkDurationMs', String(BENCHMARK_DURATION_MS))
  url.searchParams.set('benchmarkHeartbeatMs', String(HEARTBEAT_MS))
  url.searchParams.set('benchmarkScroll', '1')
  url.searchParams.set('benchmarkScrollPixelsPerFrame', process.env.IOS_REAL_DEVICE_SCROLL_PIXELS_PER_FRAME || '72')
  url.searchParams.set('seed', process.env.IOS_BENCHMARK_SEED || '4')
  url.searchParams.set('players', process.env.IOS_BENCHMARK_PLAYERS || '2')
  url.searchParams.set('size', String(MAP_SIZE))
  return url.toString()
}

function buildTimeoutError(events, benchmarkUrl) {
  const lastEvent = events.at(-1)?.payload || null
  return [
    `Timed out waiting for a real-device benchmark result after ${RESULT_TIMEOUT_MS}ms.`,
    `Open this exact URL on the connected iPhone: ${benchmarkUrl}`,
    `Received ${events.length} telemetry event(s).`,
    lastEvent ? `Last event: ${JSON.stringify(lastEvent, null, 2)}` : 'No heartbeat was received; the phone may not have reached the Mac dev server.'
  ].join('\n\n')
}

test.describe('iOS real-device benchmark', () => {
  test.skip(!RUN_REAL_DEVICE_BENCHMARK, 'Set IOS_REAL_DEVICE_BENCHMARK=1 to run the manual real-iPhone benchmark.')

  test('runs the benchmark on a manually connected real iPhone and fails on crash/reload/visual corruption', async({ browserName }, testInfo) => {
    void browserName
    testInfo.setTimeout(PHONE_OPEN_TIMEOUT_MS + RESULT_TIMEOUT_MS + 30000)

    const host = getLanHost()
    const appUrl = `http://${host}:${APP_PORT}`
    const localAppUrl = `http://127.0.0.1:${APP_PORT}`
    const appProcess = startProcess(APP_COMMAND)
    const collector = await startCollector(host)
    const benchmarkUrl = buildBenchmarkUrl(appUrl, collector.reportUrl)

    console.log(`REAL_IOS_BENCHMARK_URL ${benchmarkUrl}`)

    try {
      await waitForHttpOk(localAppUrl, 120000, appProcess)

      const firstHeartbeat = await Promise.race([
        collector.firstHeartbeatPromise,
        wait(PHONE_OPEN_TIMEOUT_MS).then(() => {
          throw new Error([
            `No real-iPhone heartbeat received after ${PHONE_OPEN_TIMEOUT_MS}ms.`,
            `Make sure the iPhone is on the same Wi-Fi as this Mac and open: ${benchmarkUrl}`,
            'If Safari cannot reach it, set IOS_REAL_DEVICE_HOST=<your-mac-lan-ip> and rerun.'
          ].join('\n\n'))
        })
      ])
      await testInfo.attach('ios-real-device-first-heartbeat.json', {
        body: JSON.stringify(firstHeartbeat, null, 2),
        contentType: 'application/json'
      })

      const payload = await Promise.race([
        collector.resultPromise,
        wait(RESULT_TIMEOUT_MS).then(() => {
          throw new Error(buildTimeoutError(collector.getEvents(), benchmarkUrl))
        })
      ])

      const events = collector.getEvents()
      await testInfo.attach('ios-real-device-events.json', {
        body: JSON.stringify(events, null, 2),
        contentType: 'application/json'
      })
      await testInfo.attach('ios-real-device-app-output.txt', {
        body: appProcess.getOutput(),
        contentType: 'text/plain'
      })

      const runIds = new Set(events.map(event => event.payload?.runId).filter(Boolean))
      expect(runIds.size, 'The benchmark page reloaded or restarted during the real-device run').toBeLessThanOrEqual(1)
      expect(payload.ok, payload.error || 'Real-device benchmark did not report a successful result').toBe(true)

      const averageFps = payload.result?.averageFps ?? 0
      expect(Math.round(averageFps), `Raw real-device benchmark average FPS: ${averageFps}`).toBeGreaterThanOrEqual(MIN_AVG_FPS)

      const visualSamples = events
        .map(event => event.payload?.visualSample)
        .filter(sample => sample?.sampled)
      const maxBlackRatio = Math.max(0, ...visualSamples.map(sample => sample.blackRatio || 0))
      const maxWhiteStreetRatio = Math.max(0, ...visualSamples.map(sample => sample.whiteStreetRatio || 0))
      expect(maxBlackRatio, 'Real-device benchmark black terrain ratio').toBeLessThanOrEqual(MAX_BLACK_TERRAIN_RATIO)
      expect(maxWhiteStreetRatio, 'Real-device benchmark white street flicker ratio').toBeLessThanOrEqual(MAX_WHITE_STREET_RATIO)
    } finally {
      await collector.close()
      stopProcess(appProcess.child)
    }
  })
})
