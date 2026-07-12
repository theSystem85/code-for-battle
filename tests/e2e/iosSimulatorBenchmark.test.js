import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import http from 'node:http'

const APP_URL = process.env.IOS_EMULATOR_APP_URL || 'http://localhost:5173'
const EMULATOR_COMMAND = process.env.IOS_EMULATOR_SCRIPT || 'npm run emulator'
const SIMULATOR_DEVICE_NAME = process.env.IOS_SIMULATOR_DEVICE || 'iPhone 13 Pro Max'
const SIMULATOR_RUNTIME_HINT = process.env.IOS_SIMULATOR_RUNTIME || ''
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

function startProcess(command, env = {}) {
  const output = []
  const child = spawn(command, {
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...env
    }
  })

  child.stdout.on('data', chunk => appendOutput(output, chunk))
  child.stderr.on('data', chunk => appendOutput(output, chunk))
  const exitPromise = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => {
      resolve(code)
    })
  })

  return {
    child,
    getOutput: () => output.join(''),
    exitPromise
  }
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', code => {
      resolve({ code, stdout, stderr })
    })
  })
}

function getSimulatorInstallInstructions(deviceName) {
  return [
    `${deviceName} is not installed as an available iOS Simulator device.`,
    'Install an iOS Simulator runtime in Xcode: Xcode > Settings > Platforms > iOS, or run `xcodebuild -downloadPlatform iOS`.',
    'Then create the device with:',
    '`xcrun simctl create "iPhone 13 Pro Max" com.apple.CoreSimulator.SimDeviceType.iPhone-13-Pro-Max com.apple.CoreSimulator.SimRuntime.iOS-17-0`',
    'Use `xcrun simctl list devicetypes | grep "iPhone 13 Pro Max"` and `xcrun simctl list runtimes` if your runtime identifier differs.'
  ].join('\n')
}

async function resolveSimulatorDevice() {
  const result = await runCommand('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])
  if (result.code !== 0) {
    throw new Error(`Unable to list iOS Simulator devices: ${result.stderr || result.stdout}`)
  }

  const parsed = JSON.parse(result.stdout)
  const candidates = Object.entries(parsed.devices || {})
    .flatMap(([runtime, devices]) => (devices || []).map(device => ({ ...device, runtime })))
    .filter(device => device.name === SIMULATOR_DEVICE_NAME && device.isAvailable !== false)

  if (!candidates.length) {
    throw new Error(getSimulatorInstallInstructions(SIMULATOR_DEVICE_NAME))
  }

  const hinted = SIMULATOR_RUNTIME_HINT
    ? candidates.find(device => device.runtime.includes(SIMULATOR_RUNTIME_HINT))
    : null

  return hinted ||
    candidates.find(device => device.state === 'Booted') ||
    candidates[0]
}

async function bootSimulatorDevice(device) {
  const bootResult = await runCommand('xcrun', ['simctl', 'boot', device.udid])
  const alreadyBooted = /current state: Booted|already booted|Unable to boot device in current state/i.test(bootResult.stderr)
  if (bootResult.code !== 0 && !alreadyBooted) {
    throw new Error(`Unable to boot ${device.name} (${device.udid}): ${bootResult.stderr || bootResult.stdout}`)
  }

  const bootStatus = await runCommand('xcrun', ['simctl', 'bootstatus', device.udid, '-b'])
  if (bootStatus.code !== 0) {
    throw new Error(`Timed out waiting for ${device.name} (${device.udid}) to boot: ${bootStatus.stderr || bootStatus.stdout}`)
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

async function waitForAppServer(url, timeoutMs, emulator) {
  const serverPromise = waitForHttpOk(url, timeoutMs)
  const exitPromise = emulator.exitPromise.then(code => {
    throw new Error(`Emulator command exited before ${url} became reachable (exit ${code}).\n${emulator.getOutput()}`)
  })

  await Promise.race([serverPromise, exitPromise])
}

function buildBenchmarkUrl(reportUrl) {
  const url = new URL(APP_URL)
  url.searchParams.set('e2eIosBenchmark', '1')
  url.searchParams.set('benchmarkReportUrl', reportUrl)
  url.searchParams.set('benchmarkDurationMs', String(BENCHMARK_DURATION_MS))
  url.searchParams.set('seed', process.env.IOS_BENCHMARK_SEED || '4')
  url.searchParams.set('players', process.env.IOS_BENCHMARK_PLAYERS || '2')
  url.searchParams.set('size', process.env.IOS_BENCHMARK_MAP_SIZE || '100')
  return url.toString()
}

async function openSimulatorUrl(url, device) {
  await new Promise((resolve, reject) => {
    const child = spawn('xcrun', ['simctl', 'openurl', device.udid, url], {
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
        reject(new Error(`xcrun simctl openurl failed for ${device.name} (${device.udid}) with ${code}: ${stderr}`))
      }
    })
  })
}

test.describe('iOS Simulator benchmark', () => {
  test.skip(process.env.IOS_EMULATOR_BENCHMARK !== '1', 'Set IOS_EMULATOR_BENCHMARK=1 to run the iOS Simulator benchmark.')
  test.skip(process.platform !== 'darwin', 'The iOS Simulator benchmark requires macOS and Xcode Simulator.')

  test('runs the existing game benchmark in Simulator Safari at the configured average FPS threshold', async({ browserName: _browserName }, testInfo) => {
    testInfo.setTimeout(START_TIMEOUT_MS + RESULT_TIMEOUT_MS + 30000)

    const simulatorDevice = await resolveSimulatorDevice()
    await bootSimulatorDevice(simulatorDevice)

    const collector = await startCollector()
    const emulator = startProcess(EMULATOR_COMMAND, {
      IOS_SIMULATOR_DEVICE: simulatorDevice.name,
      IOS_SIMULATOR_UDID: simulatorDevice.udid
    })
    let outputAttached = false

    try {
      await waitForAppServer(APP_URL, START_TIMEOUT_MS, emulator)

      const benchmarkUrl = buildBenchmarkUrl(collector.reportUrl)
      await openSimulatorUrl(benchmarkUrl, simulatorDevice)

      const timeoutPromise = wait(RESULT_TIMEOUT_MS).then(() => {
        throw new Error(`Timed out waiting for iOS benchmark result after ${RESULT_TIMEOUT_MS}ms`)
      })
      const payload = await Promise.race([collector.resultPromise, timeoutPromise])

      await testInfo.attach('ios-benchmark-result.json', {
        body: JSON.stringify(payload, null, 2),
        contentType: 'application/json'
      })
      await testInfo.attach('ios-simulator-device.json', {
        body: JSON.stringify(simulatorDevice, null, 2),
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
