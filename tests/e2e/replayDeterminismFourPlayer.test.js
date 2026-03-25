import { test, expect } from '@playwright/test'

const MATCH_URL = '/?size=60&players=4&seed=5&oreFields=1'
const FAST_SPEED = 5
const BUILD_SPEED = 4
const MATCH_DURATION_SECONDS = 180
const MIN_STATE_OVERLAP_PERCENT = 99
const MAX_MISMATCH_LEAVES = 40

const OMIT_EXACT_PATHS = new Set([
  '$.gameState.frameCount',
  '$.gameState.scrollOffset',
  '$.gameState.playerBuildHistory',
  '$.gameState.currentSessionId',
  '$.gameState.selectedWreckId',
  '$.gameState.buildingPlacementMode',
  '$.gameState.currentBuildingType',
  '$.gameState.chainBuildPrimed',
  '$.gameState.chainBuildMode',
  '$.gameState.chainStartX',
  '$.gameState.chainStartY',
  '$.gameState.chainBuildingType',
  '$.gameState.mineDeploymentPreview',
  '$.gameState.sweepAreaPreview',
  '$.gameState.enemyUnitsDestroyed',
  '$.gameState.powerSupply',
  '$.gameState.playerPowerSupply',
  '$.gameState.enemyPowerSupply'
])

const OMIT_SUFFIXES = [
  '.createdAt',
  '.recycleStartedAt',
  '.noiseSeed',
  '.spriteCacheKey',
  '.armDelayRemaining',
  '.mineDeployRemaining'
]

function shouldOmitComparisonPath(path) {
  if (OMIT_EXACT_PATHS.has(path)) {
    return true
  }

  return OMIT_SUFFIXES.some((suffix) => path.endsWith(suffix))
}

function getArraySortKey(path, item) {
  if (!item || typeof item !== 'object') {
    return JSON.stringify(item)
  }

  switch (path) {
    case '$.units':
      return [item.owner, item.type, item.id, item.tileX, item.tileY, item.x, item.y].join('|')
    case '$.buildings':
      return [item.owner, item.type, item.x, item.y, item.width, item.height, item.id].join('|')
    case '$.unitWrecks':
      return [item.owner, item.unitType, item.sourceUnitId, item.id, item.tileX, item.tileY].join('|')
    case '$.factoryRallyPoints':
      return [item.rallyPoint?.x, item.rallyPoint?.y, item.id].join('|')
    case '$.orePositions':
      return [item.x, item.y].join('|')
    case '$.gameState.blueprints':
      return [item.type, item.x, item.y].join('|')
    case '$.gameState.mines':
      return [item.owner, item.tileX, item.tileY, item.health, item.active].join('|')
    default:
      return JSON.stringify(item)
  }
}

function canonicalizeComparableState(value, path = '$') {
  if (Array.isArray(value)) {
    const canonicalItems = value.map((entry) => canonicalizeComparableState(entry, path))
    return canonicalItems.sort((left, right) => getArraySortKey(path, left).localeCompare(getArraySortKey(path, right)))
  }

  if (value && typeof value === 'object') {
    const canonicalObject = {}
    Object.keys(value).sort().forEach((key) => {
      const nextPath = `${path}.${key}`
      if (shouldOmitComparisonPath(nextPath)) {
        return
      }
      canonicalObject[key] = canonicalizeComparableState(value[key], nextPath)
    })
    return canonicalObject
  }

  return value
}

function collectStateEntries(value, path = '$', entries = new Map()) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      entries.set(path, '[]')
      return entries
    }

    value.forEach((entry, index) => {
      collectStateEntries(entry, `${path}[${index}]`, entries)
    })
    return entries
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    if (keys.length === 0) {
      entries.set(path, '{}')
      return entries
    }

    keys.forEach((key) => {
      collectStateEntries(value[key], `${path}.${key}`, entries)
    })
    return entries
  }

  entries.set(path, JSON.stringify(value))
  return entries
}

function calculateStateOverlap(leftState, rightState) {
  const leftEntries = collectStateEntries(leftState)
  const rightEntries = collectStateEntries(rightState)
  const allPaths = [...new Set([...leftEntries.keys(), ...rightEntries.keys()])].sort()

  let matchingEntries = 0
  const mismatches = []

  allPaths.forEach((path) => {
    const leftValue = leftEntries.get(path)
    const rightValue = rightEntries.get(path)
    if (leftValue === rightValue) {
      matchingEntries += 1
      return
    }

    if (mismatches.length < MAX_MISMATCH_LEAVES) {
      mismatches.push({
        path,
        leftValue: leftValue ?? '<missing>',
        rightValue: rightValue ?? '<missing>'
      })
    }
  })

  const percentage = allPaths.length === 0
    ? 100
    : Number(((matchingEntries / allPaths.length) * 100).toFixed(2))

  return {
    percentage,
    matchingEntries,
    totalEntries: allPaths.length,
    mismatches,
    mismatchBranches: summarizeMismatchBranches(mismatches)
  }
}

function getMismatchBranch(path) {
  const branchPatterns = [
    /^(\$\.(?:units|buildings|unitWrecks|factoryRallyPoints|orePositions)\[\d+\])/,
    /^(\$\.gameState\.(?:blueprints|mines)\[\d+\])/,
    /^(\$\.gameState\.[^.[\]]+)/,
    /^(\$\.[^.[\]]+)/
  ]

  for (const pattern of branchPatterns) {
    const match = path.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return path
}

function summarizeMismatchBranches(mismatches) {
  const groups = new Map()

  mismatches.forEach((mismatch) => {
    const branch = getMismatchBranch(mismatch.path)
    if (!groups.has(branch)) {
      groups.set(branch, {
        branch,
        mismatchCount: 0,
        samplePaths: []
      })
    }

    const group = groups.get(branch)
    group.mismatchCount += 1
    if (group.samplePaths.length < 5) {
      group.samplePaths.push(mismatch.path)
    }
  })

  return [...groups.values()]
    .sort((left, right) => right.mismatchCount - left.mismatchCount)
    .slice(0, 12)
}

async function enforceFastForward(page) {
  await page.evaluate(({ fastSpeed, buildSpeed }) => {
    const gs = window.gameState
    if (!gs) return

    gs.speedMultiplier = fastSpeed
    gs.playerBuildSpeedModifier = buildSpeed
    gs.enemyBuildSpeedModifier = buildSpeed
  }, { fastSpeed: FAST_SPEED, buildSpeed: BUILD_SPEED })
}

async function expectSimulationAdvancing(page, label, minimumDelta = 3) {
  const startingTime = await page.evaluate(() => Number(window.gameState?.gameTime) || 0)

  await expect.poll(async() => {
    await enforceFastForward(page)
    const currentTime = await page.evaluate(() => Number(window.gameState?.gameTime) || 0)
    return currentTime - startingTime
  }, {
    timeout: 15000,
    intervals: [1000],
    message: `${label} should advance simulation time at 5x speed`
  }).toBeGreaterThan(minimumDelta)
}

async function suppressTutorial(page) {
  await page.evaluate(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))

    const overlay = document.getElementById('tutorialOverlay')
    if (overlay) {
      overlay.style.display = 'none'
      overlay.setAttribute('aria-hidden', 'true')
      overlay.classList.add('hidden')
    }

    const dock = document.getElementById('tutorialDock')
    if (dock) {
      dock.hidden = true
      dock.classList.add('tutorial-dock--hidden')
    }

    if (window.tutorialSystem) {
      window.tutorialSystem.settings.showTutorial = false
      window.tutorialSystem.progress.completed = true
      window.tutorialSystem.hideUI?.()
    }
  })

  const skipButton = page.getByRole('button', { name: 'Skip tutorial' })
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click()
  }

  await expect.poll(async() => page.evaluate(() => {
    const overlay = document.getElementById('tutorialOverlay')
    if (!overlay) return true
    const computed = window.getComputedStyle(overlay)
    return overlay.hidden || overlay.classList.contains('hidden') || computed.display === 'none' || computed.visibility === 'hidden'
  }), {
    timeout: 10000
  }).toBe(true)
}

async function enableObserverAutomation(page) {
  await page.evaluate(async() => {
    const { setHostPartyAutomationMode } = await import('/src/network/multiplayerStore.js')
    const gs = window.gameState
    gs.humanPlayer = 'player1'
    gs.isSpectator = true
    gs.localPlayerDefeated = false
    gs.gameOver = false
    gs.gameOverMessage = null
    gs.gameResult = null
    setHostPartyAutomationMode('local')
  })

  await expect.poll(async() => page.evaluate(() => {
    const party = window.gameState?.partyStates?.find((entry) => entry.partyId === 'player1')
    return {
      aiActive: party?.aiActive,
      localAutomationEnabled: party?.localAutomationEnabled,
      llmControlled: party?.llmControlled,
      isSpectator: window.gameState?.isSpectator
    }
  }), {
    timeout: 15000
  }).toEqual({
    aiActive: true,
    localAutomationEnabled: true,
    llmControlled: false,
    isSpectator: true
  })
}

async function saveGameSnapshot(page, label) {
  await page.click('#saveListTab')
  await page.fill('#saveLabelInput', label)
  await page.click('#saveGameBtn')
  await expect.poll(async() => page.evaluate((saveLabel) => localStorage.getItem(`rts_save_${saveLabel}`) || null, label), {
    timeout: 15000
  }).not.toBeNull()

  return page.evaluate((saveLabel) => JSON.parse(localStorage.getItem(`rts_save_${saveLabel}`) || 'null'), label)
}

async function pauseGameAndWaitForStableTime(page, label) {
  await page.evaluate(() => {
    if (window.gameState) {
      window.gameState.gamePaused = true
    }
  })

  const pausedSnapshot = await page.evaluate(() => ({
    gamePaused: Boolean(window.gameState?.gamePaused),
    gameTime: Number(window.gameState?.gameTime) || 0,
    frameCount: Number(window.gameState?.frameCount) || 0,
    simulationTime: Number(window.gameState?.simulationTime) || 0,
    simulationAccumulator: Number(window.gameState?.simulationAccumulator) || 0,
    lastOreUpdate: Number(window.gameState?.lastOreUpdate) || 0
  }))

  await expect.poll(async() => page.evaluate(() => ({
    gamePaused: Boolean(window.gameState?.gamePaused),
    gameTime: Number(window.gameState?.gameTime) || 0,
    frameCount: Number(window.gameState?.frameCount) || 0,
    simulationTime: Number(window.gameState?.simulationTime) || 0,
    simulationAccumulator: Number(window.gameState?.simulationAccumulator) || 0,
    lastOreUpdate: Number(window.gameState?.lastOreUpdate) || 0
  })), {
    timeout: 10000,
    intervals: [250],
    message: `${label} should freeze simulation state before saving`
  }).toEqual(pausedSnapshot)
}

test.describe('Replay determinism in four-player AI match', () => {
  test('replay export reproduces the original saved end state', async({ page }) => {
    test.setTimeout(360000)

    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto(MATCH_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 60000 })
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted), { timeout: 60000 })
    await page.waitForSelector('#recordBtn', { state: 'visible', timeout: 30000 })
    await suppressTutorial(page)

    await page.evaluate(() => {
      const gs = window.gameState
      gs.gamePaused = true
      gs.humanPlayer = 'player1'
      gs.localPlayerDefeated = false
      gs.gameOver = false
      gs.gameOverMessage = null
      gs.gameResult = null
    })
    await enableObserverAutomation(page)
    await enforceFastForward(page)
    await expect.poll(async() => page.evaluate(() => Number(window.gameState?.speedMultiplier) || 0), {
      timeout: 10000
    }).toBe(FAST_SPEED)

    await page.click('#recordBtn')
    await expect.poll(async() => page.evaluate(() => Boolean(window.gameState?.replay?.recordingActive)), {
      timeout: 15000
    }).toBe(true)

    await page.evaluate(() => {
      window.gameState.gamePaused = false
    })
    await expectSimulationAdvancing(page, 'Initial live match')

    await expect.poll(async() => page.evaluate(() => Number(window.gameState?.gameTime) || 0), {
      timeout: 240000,
      intervals: [1000],
      message: 'Live match should reach the 3 minute recording point at 5x speed'
    }).toBeGreaterThanOrEqual(MATCH_DURATION_SECONDS)

    await pauseGameAndWaitForStableTime(page, 'Live-match save point')

    const uniqueSuffix = Date.now().toString().slice(-6)
    const saveLabelA = `Replay Determinism A ${uniqueSuffix}`
    const saveLabelB = `Replay Determinism B ${uniqueSuffix}`

    const saveSnapshotA = await saveGameSnapshot(page, saveLabelA)

    await page.click('#recordBtn')
    await expect.poll(async() => page.evaluate(() => Boolean(window.gameState?.replay?.recordingActive)), {
      timeout: 15000
    }).toBe(false)

    await page.click('#replayListTab')
    const replayRow = page.locator('#replayList > li').first()
    await expect(replayRow).toBeVisible({ timeout: 15000 })

    const originalSnapshot = await page.evaluate(({ saveLabel }) => {
      const saveObj = JSON.parse(localStorage.getItem(`rts_save_${saveLabel}`) || 'null')
      const replayKeys = Object.keys(localStorage).filter(key => key.startsWith('rts_replay_')).sort()
      const latestReplayKey = replayKeys[replayKeys.length - 1] || null
      const latestReplay = latestReplayKey ? JSON.parse(localStorage.getItem(latestReplayKey) || 'null') : null
      return {
        state: saveObj?.state || '',
        replayKey: latestReplayKey,
        replayCommandCount: Array.isArray(latestReplay?.commands) ? latestReplay.commands.length : 0,
        replayHasBaseline: Boolean(latestReplay?.baselineState)
      }
    }, { saveLabel: saveLabelA })

    expect(originalSnapshot.replayKey).toBeTruthy()
    expect(originalSnapshot.replayCommandCount).toBeGreaterThan(0)
    expect(originalSnapshot.replayHasBaseline).toBe(true)

    await replayRow.locator('.save-game-label-button').click()
    await expect.poll(async() => page.evaluate(() => Boolean(window.gameState?.replayMode && window.gameState?.replay?.playbackActive)), {
      timeout: 15000
    }).toBe(true)
    await enforceFastForward(page)
    await expect.poll(async() => page.evaluate(() => Number(window.gameState?.speedMultiplier) || 0), {
      timeout: 10000
    }).toBe(FAST_SPEED)
    await expectSimulationAdvancing(page, 'Replay playback start')

    await expect.poll(async() => page.evaluate(() => Boolean(window.gameState?.replay?.playbackFinished)), {
      timeout: 180000,
      intervals: [1000]
    }).toBe(true)

    await pauseGameAndWaitForStableTime(page, 'Replay-end save point')

    const saveSnapshotB = await saveGameSnapshot(page, saveLabelB)
    const parsedStateA = canonicalizeComparableState(JSON.parse(saveSnapshotA.state))
    const parsedStateB = canonicalizeComparableState(JSON.parse(saveSnapshotB.state))
    const overlap = calculateStateOverlap(parsedStateA, parsedStateB)

    expect(saveSnapshotA?.state).toBeTruthy()
    expect(overlap.percentage, `State overlap ${overlap.percentage.toFixed(2)}% with mismatch branches: ${JSON.stringify(overlap.mismatchBranches)}`).toBeGreaterThanOrEqual(MIN_STATE_OVERLAP_PERCENT)
  })
})
