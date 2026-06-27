import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import http from 'node:http'

const APP_URL = process.env.IOS_EMULATOR_APP_URL || 'http://localhost:5173'
const EMULATOR_COMMAND = process.env.IOS_EMULATOR_SCRIPT || 'npm run emulator'
const BENCHMARK_DURATION_MS = Number.parseInt(process.env.IOS_BENCHMARK_DURATION_MS || '60000', 10)
const MIN_AVG_FPS = Number.parseFloat(process.env.IOS_BENCHMARK_MIN_AVG_FPS || '55')
const START_TIMEOUT_MS = Number.parseInt(process.env.IOS_EMULATOR_START_TIMEOUT_MS || '120000', 10)
const RESULT_TIMEOUT_MS = Number.parseInt(
  process.env.IOS_BENCHMARK_RESULT_TIMEOUT_MS || String(BENCHMARK_DURATION_MS + 90000),
  10
)

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function appendOutput(output, chunk) {
  output.push(chunk.toString())
  while (output.join('').length > 20_000) {
    output.shift()
  }
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

  return {
    child,
    getOutput: () => output.join('')
  }
}

function stopProcess(child) {
  if (!child || child.killed) {
    return
  }

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

async function startCollector() {
  let resolveResult
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

    if (req.method !== 'POST' || req.url !== '/ios-benchmark-result') {
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
        resolveResult(payload)
        res.writeHead(204)
        res.end()
      } catch (err) {
        res.writeHead(400)
        res.end(err?.message || 'Invalid benchmark payload')
      }
    })
  })

  await new Promise(resolve => server.listen(0, resolve))

  const { port } = server.address()
  return {
    reportUrl: `http://localhost:${port}/ios-benchmark-result`,
    resultPromise,
    close: () => new Promise(resolve => server.close(resolve))
  }
}

async function waitForHttpOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
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

function buildBenchmarkUrl(reportUrl) {
  const url = new URL(APP_URL)
  url.searchParams.set('e2eIosBenchmark', '1')
  url.searchParams.set('benchmarkReportUrl', reportUrl)
  url.searchParams.set('benchmarkDurationMs', String(BENCHMARK_DURATION_MS))
  url.searchParams.set('seed', process.env.IOS_BENCHMARK_SEED || '4')
  url.searchParams.set('players', process.env.IOS_BENCHMARK_PLAYERS || '2')
  url.searchParams.set('size', process.env.IOS_BENCHMARK_MAP_SIZE || '40')
  return url.toString()
}

async function openSimulatorUrl(url) {
  await new Promise((resolve, reject) => {
    const child = spawn('xcrun', ['simctl', 'openurl', 'booted', url], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`xcrun simctl openurl failed with ${code}: ${stderr}`))
      }
    })
  })
}

test.describe('iOS Simulator benchmark', () => {
  test.skip(process.env.IOS_EMULATOR_BENCHMARK !== '1', 'Set IOS_EMULATOR_BENCHMARK=1 to run the iOS Simulator benchmark.')
  test.skip(process.platform !== 'darwin', 'The iOS Simulator benchmark requires macOS and Xcode Simulator.')

  test('runs the existing game benchmark in Simulator Safari at the configured average FPS threshold', async({ browserName: _browserName }, testInfo) => {
    testInfo.setTimeout(START_TIMEOUT_MS + RESULT_TIMEOUT_MS + 30000)

    const collector = await startCollector()
    const emulator = startProcess(EMULATOR_COMMAND)
    let outputAttached = false

    try {
      await waitForHttpOk(APP_URL, START_TIMEOUT_MS)

      const benchmarkUrl = buildBenchmarkUrl(collector.reportUrl)
      await openSimulatorUrl(benchmarkUrl)

      const timeoutPromise = wait(RESULT_TIMEOUT_MS).then(() => {
        throw new Error(`Timed out waiting for iOS benchmark result after ${RESULT_TIMEOUT_MS}ms`)
      })
      const payload = await Promise.race([collector.resultPromise, timeoutPromise])

      await testInfo.attach('ios-benchmark-result.json', {
        body: JSON.stringify(payload, null, 2),
        contentType: 'application/json'
      })
      await testInfo.attach('ios-emulator-output.txt', {
        body: emulator.getOutput(),
        contentType: 'text/plain'
      })
      outputAttached = true

      expect(payload.ok, payload.error || 'iOS benchmark did not report a successful result').toBe(true)
      const averageFps = payload.result?.averageFps ?? 0
      expect(Math.round(averageFps), `Raw iOS benchmark average FPS: ${averageFps}`).toBeGreaterThanOrEqual(MIN_AVG_FPS)
    } finally {
      if (!outputAttached) {
        await testInfo.attach('ios-emulator-output.txt', {
          body: emulator.getOutput(),
          contentType: 'text/plain'
        })
      }
      stopProcess(emulator.child)
      await collector.close()
    }
  })
})
