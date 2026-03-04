import { test, expect } from '@playwright/test'

/* ------------------------------------------------------------------ *
 *  Multiplayer 4-party E2E test                                       *
 *                                                                     *
 *  Flow (matches manual session):                                     *
 *    1. HOST opens the game with URL params (?size, ?players, ?seed)  *
 *    2. HOST pauses immediately so AI cannot pre-build                *
 *    3. HOST sets map seed / dimensions / player count via sidebar    *
 *    4. HOST minimises tutorial overlay (if visible)                  *
 *    5. HOST clicks Invite for RED  → extracts invite URL             *
 *    6. HOST clicks Invite for YELLOW → extracts invite URL           *
 *    7. RED  opens invite URL → fills alias → submits                *
 *    8. YELLOW opens invite URL → fills alias → submits              *
 *    9. HOST verifies RED/YELLOW connected, BLUE stays AI            *
 *   10. HOST resumes the game                                        *
 *   11. HOST/RED/YELLOW build stack to tank via production flow      *
 *   12. Verify refinery unload income per party                      *
 * ------------------------------------------------------------------ */

const MAP_SIZE = 40
const MAP_SEED = '4'
const CONTROLLED_PARTIES = ['player1', 'player2', 'player4']
const AI_PARTY = 'player3'

// Replicate baseURL resolution from playwright.config.js so that
// browser.newContext() – which does NOT inherit config.use.baseURL –
// gets the correct origin when we call page.goto('/…').
const useNetlifyDev = process.env.PLAYWRIGHT_NETLIFY_DEV === '1'
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL
  || (useNetlifyDev ? 'http://localhost:8888' : 'http://localhost:5173')
const LARGEST_SCREEN_WIDTH = Number.parseInt(process.env.PLAYWRIGHT_LARGEST_SCREEN_WIDTH || '0', 10)
const LARGEST_SCREEN_HEIGHT = Number.parseInt(process.env.PLAYWRIGHT_LARGEST_SCREEN_HEIGHT || '0', 10)
const WINDOW_MAX_WIDTH = Number.parseInt(process.env.PLAYWRIGHT_WINDOW_MAX_WIDTH || '1280', 10)
const WINDOW_MAX_HEIGHT = Number.parseInt(process.env.PLAYWRIGHT_WINDOW_MAX_HEIGHT || '900', 10)
const PREFERRED_BROWSER_CHANNEL = process.env.PLAYWRIGHT_BROWSER_CHANNEL || ''
const ENABLE_UNCAPPED_RENDERING = process.env.PLAYWRIGHT_UNCAPPED_RENDERING === '1'
const ENABLE_GPU_ACCELERATION = process.env.PLAYWRIGHT_FORCE_GPU !== '0'
const FULL_ASSAULT_TANK_COUNT = 2

function getWindowLayout() {
  if (!Number.isFinite(LARGEST_SCREEN_WIDTH) || !Number.isFinite(LARGEST_SCREEN_HEIGHT)
    || LARGEST_SCREEN_WIDTH <= 0 || LARGEST_SCREEN_HEIGHT <= 0) {
    return {
      host: { left: 0, top: 40, width: 900, height: 920 },
      red: { left: 920, top: 40, width: 900, height: 920 },
      yellow: { left: 1840, top: 40, width: 900, height: 920 }
    }
  }

  const top = 40
  const calculatedHeight = Math.max(700, LARGEST_SCREEN_HEIGHT - 120)
  const calculatedWidth = Math.max(700, Math.floor(LARGEST_SCREEN_WIDTH / 3))
  const usableHeight = Number.isFinite(WINDOW_MAX_HEIGHT) ? Math.min(calculatedHeight, WINDOW_MAX_HEIGHT) : calculatedHeight
  const paneWidth = Number.isFinite(WINDOW_MAX_WIDTH) ? Math.min(calculatedWidth, WINDOW_MAX_WIDTH) : calculatedWidth

  return {
    host: { left: 0, top, width: paneWidth, height: usableHeight },
    red: { left: paneWidth, top, width: paneWidth, height: usableHeight },
    yellow: { left: paneWidth * 2, top, width: paneWidth, height: usableHeight }
  }
}

function logStep(message) {
  console.log(`[E2E][multiplayer][${new Date().toISOString()}] ${message}`)
}

async function positionBrowserWindow(page, { left, top, width, height, label }) {
  try {
    const session = await page.context().newCDPSession(page)
    const { windowId } = await session.send('Browser.getWindowForTarget')
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        left,
        top,
        width,
        height,
        windowState: 'normal'
      }
    })
    logStep(`${label}: positioned window at (${left}, ${top}) size ${width}x${height}`)
  } catch (error) {
    logStep(`${label}: window positioning not available (${error?.message || 'unknown error'})`)
  }
}

async function ensureSidebarVisible(page) {
  await page.waitForSelector('#sidebar', { state: 'visible', timeout: 30000 })
  await page.waitForSelector('#sidebarScroll', { state: 'visible', timeout: 30000 })

  const sidebarCollapsed = await page.evaluate(() => document.body.classList.contains('sidebar-collapsed'))
  if (sidebarCollapsed) {
    logStep('Sidebar is collapsed, attempting to open via #sidebarToggle')
    const toggle = page.locator('#sidebarToggle')
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click()
    }
    await page.waitForFunction(() => !document.body.classList.contains('sidebar-collapsed'), { timeout: 15000 })
  }
}

async function ensureMapSettingsExpanded(page) {
  await ensureSidebarVisible(page)

  await page.evaluate(() => {
    const toggle = document.getElementById('mapSettingsToggle')
    if (toggle) {
      toggle.scrollIntoView({ behavior: 'instant', block: 'center' })
    }
  })

  const mapSettingsVisible = await page.evaluate(() => {
    const content = document.getElementById('mapSettingsContent')
    if (!content) return false
    return content.style.display !== 'none'
  })

  if (!mapSettingsVisible) {
    logStep('Map settings accordion is collapsed, expanding it now')
    await page.locator('#mapSettingsToggle').click()
  }

  await expect(page.locator('#mapSettingsContent')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#playerCount')).toBeVisible({ timeout: 30000 })
}

async function ensureMultiplayerInviteSectionVisible(page) {
  await ensureSidebarVisible(page)
  await page.evaluate(() => {
    const multiplayer = document.getElementById('multiplayerSettings')
    if (multiplayer) {
      multiplayer.scrollIntoView({ behavior: 'instant', block: 'center' })
    }
  })
  await expect(page.locator('#inviteLinkInput')).toBeVisible({ timeout: 30000 })
}

async function dismissInviteQrModalIfVisible(page) {
  const modal = page.locator('.multiplayer-qr-modal.visible')
  if (!await modal.isVisible().catch(() => false)) {
    return
  }

  logStep('QR invite modal is visible, dismissing it before continuing')
  const closeBtn = page.locator('.multiplayer-qr-modal__close')
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true })
  } else {
    await page.keyboard.press('Escape').catch(() => {})
  }

  await expect(modal).toBeHidden({ timeout: 10000 })
}

// ────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────

/** Pre-seed localStorage so the tutorial is configured before page load. */
async function configureTutorial(page, { showTutorial, completed }) {
  await page.addInitScript((cfg) => {
    localStorage.setItem(
      'tutorial-settings',
      JSON.stringify({ showTutorial: cfg.showTutorial, speechEnabled: false })
    )
    localStorage.setItem(
      'tutorial-progress',
      JSON.stringify({ completed: cfg.completed, stepIndex: 0 })
    )
  }, { showTutorial, completed })
}

/** Navigate to a path and wait until gameState.gameStarted is true. */
async function gotoAndWaitGameReady(page, urlPath = '/') {
  logStep(`Navigating to ${urlPath}`)
  await page.goto(urlPath, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 60000 })
  await page.waitForFunction(
    () => window.gameState !== undefined && window.gameState.gameStarted === true,
    { timeout: 60000 }
  )
  logStep(`Game ready on ${urlPath}`)
}

/** Force-pause gameState (called right after page load, before any AI tick). */
async function pauseGameImmediately(page) {
  logStep('Pausing host game immediately')
  await page.evaluate(() => {
    window.gameState.gamePaused = true
    const icon = document.querySelector('#pauseBtn .play-pause-icon')
    if (icon) icon.textContent = '▶'
  })
  await page.waitForFunction(
    () => window.gameState?.gamePaused === true,
    { timeout: 10000 }
  )
}

async function ensureHostPaused(page) {
  const paused = await page.evaluate(() => {
    if (!window.gameState) {
      return false
    }

    if (window.gameState.gamePaused !== true) {
      window.gameState.gamePaused = true
      const icon = document.querySelector('#pauseBtn .play-pause-icon')
      if (icon) {
        icon.textContent = '▶'
      }
    }

    return window.gameState.gamePaused === true
  })

  expect(paused).toBe(true)
}

/** Set map dimensions, player count and seed via sidebar inputs. */
async function setHostMapAndPlayers(page) {
  logStep('Preparing sidebar/map settings for host map configuration')
  await ensureMapSettingsExpanded(page)

  logStep('Setting playerCount=4')
  await page.locator('#playerCount').fill('4')
  await page.locator('#playerCount').dispatchEvent('change')

  logStep(`Setting map width/height to ${MAP_SIZE}`)
  await page.locator('#mapWidthTiles').fill(String(MAP_SIZE))
  await page.locator('#mapWidthTiles').dispatchEvent('change')
  await page.locator('#mapHeightTiles').fill(String(MAP_SIZE))
  await page.locator('#mapHeightTiles').dispatchEvent('change')

  logStep(`Setting map seed to ${MAP_SEED} (auto-regenerate on change)`)
  await page.locator('#mapSeed').fill(MAP_SEED)
  await page.locator('#mapSeed').dispatchEvent('change')

  await page.waitForFunction(
    (args) => {
      const gs = window.gameState
      return gs
        && Number(gs.mapTilesX) === args.size
        && Number(gs.mapTilesY) === args.size
        && Number(gs.playerCount) === 4
        && String(gs.mapSeed) === args.seed
    },
    { size: MAP_SIZE, seed: MAP_SEED },
    { timeout: 30000 }
  )

  logStep('Host map settings applied and confirmed in gameState')
}

/** If the tutorial overlay is showing, minimise it. */
async function minimizeTutorialIfVisible(page) {
  const overlay = page.locator('#tutorialOverlay')
  if (await overlay.isVisible().catch(() => false)) {
    const minimizeBtn = page.locator('[data-tutorial-action="minimize"]')
    if (await minimizeBtn.count() > 0) {
      await minimizeBtn.first().click()
    }
  }
}

/**
 * Click Invite for a party, wait for token creation, then try to read
 * the copied link from clipboard. Falls back to URL built from token.
 */
async function invitePartyAndCaptureCopiedUrl(hostPage, partyId) {
  await dismissInviteQrModalIfVisible(hostPage)
  logStep(`Preparing invite section for ${partyId}`)
  await ensureMultiplayerInviteSectionVisible(hostPage)

  const btn = hostPage.locator(`[data-testid="multiplayer-invite-${partyId}"]`)
  await btn.scrollIntoViewIfNeeded()
  await expect(btn).toBeVisible({ timeout: 30000 })
  logStep(`Clicking invite button for ${partyId}`)
  await btn.click()

  // Wait until the party state contains an inviteToken
  await hostPage.waitForFunction(
    (pid) => {
      const parties = window.gameState?.partyStates || []
      return parties.some((p) => p.partyId === pid && p.inviteToken)
    },
    partyId,
    { timeout: 30000 }
  )

  // Read the token back
  const token = await hostPage.evaluate((pid) => {
    const party = (window.gameState?.partyStates || []).find((p) => p.partyId === pid)
    return party?.inviteToken || null
  }, partyId)

  const copiedUrl = await hostPage.evaluate(async() => {
    if (!navigator?.clipboard || typeof navigator.clipboard.readText !== 'function') {
      return ''
    }

    try {
      return (await navigator.clipboard.readText()).trim()
    } catch {
      return ''
    }
  })

  const fallbackUrl = token ? `${BASE_URL}/?invite=${encodeURIComponent(token)}` : null
  const inviteUrl = copiedUrl && copiedUrl.includes('invite=') ? copiedUrl : fallbackUrl

  logStep(`Invite resolved for ${partyId} | token=${token ? 'yes' : 'no'} | copied=${copiedUrl ? 'yes' : 'no'} | usingFallback=${copiedUrl && copiedUrl.includes('invite=') ? 'no' : 'yes'}`)

  await dismissInviteQrModalIfVisible(hostPage)

  return { copiedUrl, inviteUrl }
}

/**
 * A client (RED / YELLOW) joins the game:
 *   1. Navigate directly to the invite URL  (same result as pasting
 *      into #inviteLinkInput and clicking Join – both end up at
 *      /?invite=TOKEN which triggers remoteInviteLanding.js).
 *   2. Wait for the "Join Remote Match" overlay.
 *   3. Fill alias → submit.
 *   4. Wait until the WebRTC session status is 'connected'.
 */
async function joinViaDirectInviteUrl(page, inviteUrl, alias) {
  logStep(`${alias}: opening invite URL directly`)
  await page.goto(inviteUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 60000 })

  // The invite overlay should appear
  const overlay = page.locator('#remoteInviteLanding')
  await expect(overlay).toBeVisible({ timeout: 30000 })

  // Fill alias and submit
  await page.locator('#remoteAliasInput').fill(alias)
  await page.locator('#remoteInviteSubmit').click()
  logStep(`${alias}: alias submitted, waiting for stable connection`)

  // Wait for connection on the joining client.
  await page.waitForFunction(
    () => {
      const s = window.gameState?.multiplayerSession
      return s && s.isRemote === true && s.status === 'connected'
    },
    undefined,
    { timeout: 90000 }
  )

  await expect(overlay).toBeHidden({ timeout: 15000 }).catch(() => {})
  logStep(`${alias}: remote session connected`)
}

async function openProductionTab(page, tabName) {
  const tab = page.locator(`.tab-button[data-tab="${tabName}"]`)
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
}

async function selectBuildTileNearCurrentPartyBase(page, buildingType) {
  const candidates = await page.evaluate(async(type) => {
    const { canPlaceBuilding, buildingData } = await import('/src/buildings.js')
    const { mapGrid, units, factories } = await import('/src/main.js')
    const gs = window.gameState

    if (!gs || !mapGrid?.length || !mapGrid[0]?.length) {
      return []
    }

    const owner = gs.humanPlayer || 'player1'
    const ownerAliases = owner === 'player1' ? ['player1', 'player', owner] : [owner]
    const yard = (gs.buildings || []).find((building) => building.type === 'constructionYard' && ownerAliases.includes(building.owner))
    const info = buildingData?.[type]

    if (!yard || !info?.width || !info?.height) {
      return []
    }

    const around = [
      { x: 4, y: 0 },
      { x: 0, y: 4 },
      { x: -4, y: 0 },
      { x: 0, y: -4 },
      { x: 5, y: 3 },
      { x: -5, y: 3 },
      { x: 5, y: -3 },
      { x: -5, y: -3 },
      { x: 7, y: 0 },
      { x: 0, y: 7 }
    ]

    const points = []

    around.forEach((offset) => {
      const tileX = yard.x + offset.x
      const tileY = yard.y + offset.y

      if (tileX < 0 || tileY < 0 || tileY >= mapGrid.length || tileX >= mapGrid[0].length) {
        return
      }

      const canPlace = canPlaceBuilding(type, tileX, tileY, mapGrid, units, gs.buildings || [], factories, owner)
      if (!canPlace) {
        return
      }

      points.push({ x: tileX, y: tileY })
    })

    if (points.length > 0) {
      return points
    }

    for (let y = 0; y < mapGrid.length; y++) {
      for (let x = 0; x < mapGrid[0].length; x++) {
        if (canPlaceBuilding(type, x, y, mapGrid, units, gs.buildings || [], factories, owner)) {
          points.push({ x, y })
          if (points.length >= 5) {
            return points
          }
        }
      }
    }

    return points
  }, buildingType)

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`No valid placement candidates for ${buildingType}`)
  }

  return candidates[0]
}

async function queueAndCompleteBuilding(page, buildingType, roleLabel) {
  const baseline = await page.evaluate((type) => {
    const gs = window.gameState
    const owner = gs?.humanPlayer || 'player1'
    const aliases = owner === 'player1' ? ['player1', 'player', owner] : [owner]
    return (gs?.buildings || []).filter((building) => building.type === type && aliases.includes(building.owner)).length
  }, buildingType)

  const button = page.locator(`.production-button[data-building-type="${buildingType}"]`)
  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeVisible({ timeout: 30000 })
  await expect(button).toBeEnabled({ timeout: 30000 })

  const buildTile = await selectBuildTileNearCurrentPartyBase(page, buildingType)
  await page.evaluate(async({ type, x, y }) => {
    const { productionQueue } = await import('/src/productionQueue.js')
    const buttonEl = document.querySelector(`.production-button[data-building-type="${type}"]`)
    if (!buttonEl) {
      throw new Error(`Missing production button for ${type}`)
    }

    productionQueue.addItem(type, buttonEl, true, { type, x, y })
  }, { type: buildingType, x: buildTile.x, y: buildTile.y })

  await page.waitForFunction(
    ({ type, previousCount }) => {
      const gs = window.gameState
      const owner = gs?.humanPlayer || 'player1'
      const aliases = owner === 'player1' ? ['player1', 'player', owner] : [owner]
      const completed = (gs?.buildings || []).filter((building) => building.type === type && aliases.includes(building.owner))
      return completed.length > previousCount
    },
    { type: buildingType, previousCount: baseline },
    { timeout: 90000 }
  )

  logStep(`${roleLabel}: completed ${buildingType}`)
}

async function queueAndCompleteUnit(page, unitType, roleLabel, completionTimeout = 90000) {
  const baseline = await page.evaluate((type) => {
    const gs = window.gameState
    const owner = gs?.humanPlayer || 'player1'
    const aliases = owner === 'player1' ? ['player1', 'player', owner] : [owner]
    return (gs?.units || []).filter((unit) => aliases.includes(unit.owner) && (unit.type === type || (type === 'tank' && unit.type === 'tank_v1'))).length
  }, unitType)

  const button = page.locator(`.production-button[data-unit-type="${unitType}"]`)
  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeVisible({ timeout: 30000 })
  await expect(button).toBeEnabled({ timeout: 30000 })
  await button.click()

  await page.waitForFunction(
    ({ type, previousCount }) => {
      const gs = window.gameState
      const owner = gs?.humanPlayer || 'player1'
      const aliases = owner === 'player1' ? ['player1', 'player', owner] : [owner]
      const count = (gs?.units || []).filter((unit) => aliases.includes(unit.owner) && (unit.type === type || (type === 'tank' && unit.type === 'tank_v1'))).length
      return count > previousCount
    },
    { type: unitType, previousCount: baseline },
    { timeout: completionTimeout }
  )

  logStep(`${roleLabel}: completed ${unitType}`)
}

async function buildStackToTank(page, roleLabel) {
  await ensureSidebarVisible(page)
  await openProductionTab(page, 'buildings')
  await queueAndCompleteBuilding(page, 'powerPlant', roleLabel)
  await queueAndCompleteBuilding(page, 'oreRefinery', roleLabel)
  await queueAndCompleteBuilding(page, 'vehicleFactory', roleLabel)

  await openProductionTab(page, 'units')
  await queueAndCompleteUnit(page, 'harvester', roleLabel)
  await queueAndCompleteUnit(page, 'tank', roleLabel)
}

async function getOwnedTankCount(page) {
  return page.evaluate(() => {
    const gs = window.gameState
    const owner = gs?.humanPlayer || 'player1'
    const aliases = owner === 'player1' ? ['player1', 'player', owner] : [owner]
    return (gs?.units || []).filter((unit) =>
      aliases.includes(unit.owner) && (unit.type === 'tank_v1' || unit.type === 'tank') && unit.health > 0
    ).length
  })
}

async function buildTankStack(page, roleLabel, targetTankCount, onTankReady = null) {
  await ensureSidebarVisible(page)
  await openProductionTab(page, 'units')

  while (true) {
    const currentTankCount = await getOwnedTankCount(page)
    if (currentTankCount >= targetTankCount) {
      logStep(`${roleLabel}: reached tank stack target ${currentTankCount}/${targetTankCount}`)
      return
    }

    await queueAndCompleteUnit(page, 'tank', roleLabel, 240000)
    if (typeof onTankReady === 'function') {
      await onTankReady()
    }
  }
}

async function issuePartyAgfAssaultViaEngine(page, roleLabel, targetPartyIds) {
  const setup = await page.evaluate(async({ targetIds }) => {
    const gs = window.gameState

    if (!gs) {
      return { ok: false, reason: 'missing-game-state' }
    }

    const { selectedUnits, getUnitCommandsHandler } = await import('/src/inputHandler.js')
    const { mapGrid } = await import('/src/main.js')

    const humanPlayer = gs.humanPlayer || 'player1'
    const isHumanOwned = (owner) => owner === humanPlayer || (humanPlayer === 'player1' && owner === 'player')

    const ownedTanks = (gs.units || []).filter((unit) =>
      isHumanOwned(unit.owner)
      && (unit.type === 'tank' || unit.type === 'tank_v1')
      && unit.health > 0
    )

    if (ownedTanks.length === 0) {
      return { ok: false, reason: 'no-owned-tanks' }
    }

    const enemyStructures = [
      ...(gs.buildings || []),
      ...(gs.factories || [])
    ].filter((entity) =>
      entity
      && entity.health > 0
      && entity.type !== 'concreteWall'
      && targetIds.includes(entity.owner || entity.id)
    )

    if (enemyStructures.length === 0) {
      return { ok: false, reason: 'no-enemy-structures' }
    }

    selectedUnits.forEach((unit) => {
      if (unit) {
        unit.selected = false
      }
    })

    selectedUnits.splice(0, selectedUnits.length, ...ownedTanks)
    gs.selectedUnits = selectedUnits

    ownedTanks.forEach((unit) => {
      unit.selected = true
    })

    const attackTargets = [...enemyStructures]
    gs.attackGroupTargets = [...attackTargets]

    const unitCommands = getUnitCommandsHandler()
    const combatUnits = ownedTanks.filter((unit) => unit.type !== 'harvester' && isHumanOwned(unit.owner))

    combatUnits.forEach((unit) => {
      unit.attackQueue = [...attackTargets]
      unit.target = unit.attackQueue[0] || null
      unit.currentCommand = null
      unit.moveTarget = null
      unit.path = null
      unit.commandQueue = [{ type: 'agf', targets: attackTargets }]
    })

    if (unitCommands && combatUnits.length > 0 && combatUnits[0].target) {
      unitCommands.isAttackGroupOperation = true
      unitCommands.handleAttackCommand(combatUnits, combatUnits[0].target, mapGrid, false)
      unitCommands.isAttackGroupOperation = false
    }

    gs.attackGroupMode = false
    gs.attackGroupStart = { x: 0, y: 0 }
    gs.attackGroupEnd = { x: 0, y: 0 }
    gs.disableAGFRendering = false

    return {
      ok: true,
      selectedTankCount: ownedTanks.length,
      targetStructureCount: enemyStructures.length
    }
  }, { targetIds: targetPartyIds })

  if (!setup.ok) {
    logStep(`${roleLabel}: skipped AGF engine issue (${setup.reason || 'unknown-reason'})`)
    return
  }

  await page.waitForFunction(
    (minimumTargetCount) => {
      const gs = window.gameState
      const targets = gs?.attackGroupTargets || []
      return targets.length >= minimumTargetCount
    },
    setup.targetStructureCount,
    { timeout: 15000 }
  )

  logStep(`${roleLabel}: issued AGF via engine state with ${setup.selectedTankCount} tanks against ${setup.targetStructureCount} BLUE structures`)
}

async function waitForPartyStructuresElimination(hostPage, partyId, timeout = 300000) {
  await hostPage.waitForFunction(
    (targetPartyId) => {
      const gs = window.gameState
      if (!gs) return false

      const isAliveStructure = (entity) => {
        if (!entity || entity.health <= 0) return false
        if (entity.type === 'concreteWall') return false
        const entityOwner = entity.owner || entity.id
        return entityOwner === targetPartyId
      }

      const aliveBuildings = (gs.buildings || []).some(isAliveStructure)
      const aliveFactories = (gs.factories || []).some(isAliveStructure)
      return !aliveBuildings && !aliveFactories
    },
    partyId,
    { timeout }
  )
}

async function runMultiplayerScenario(browser, { fullAssault = false } = {}) {
  const browserType = browser.browserType()
  const windowLayout = getWindowLayout()

  const launchRoleBrowser = async(role, bounds) => {
    const args = [
      `--window-position=${bounds.left},${bounds.top}`,
      `--window-size=${bounds.width},${bounds.height}`,
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--no-first-run',
      '--no-default-browser-check'
    ]

    if (ENABLE_GPU_ACCELERATION) {
      args.push(
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--ignore-gpu-blocklist',
        '--enable-accelerated-2d-canvas',
        '--enable-accelerated-video-decode',
        '--enable-webgl',
        '--use-angle=metal'
      )
    }

    if (ENABLE_UNCAPPED_RENDERING) {
      args.push('--disable-frame-rate-limit', '--disable-gpu-vsync')
    }

    const launchOptions = {
      headless: false,
      args
    }

    if (ENABLE_GPU_ACCELERATION) {
      launchOptions.ignoreDefaultArgs = ['--disable-gpu']
    }

    if (PREFERRED_BROWSER_CHANNEL) {
      launchOptions.channel = PREFERRED_BROWSER_CHANNEL
    }

    let roleBrowser = null
    try {
      roleBrowser = await browserType.launch(launchOptions)
      if (PREFERRED_BROWSER_CHANNEL) {
        logStep(`${role}: launched using browser channel ${PREFERRED_BROWSER_CHANNEL}`)
      }
    } catch {
      if (!PREFERRED_BROWSER_CHANNEL) {
        throw new Error(`${role}: browser launch failed`)
      }

      roleBrowser = await browserType.launch({
        headless: false,
        args
      })
      logStep(`${role}: falling back to bundled chromium launch`)
    }

    const roleContext = await roleBrowser.newContext({
      baseURL: BASE_URL,
      viewport: {
        width: bounds.width,
        height: bounds.height
      }
    })
    const rolePage = await roleContext.newPage()
    await positionBrowserWindow(rolePage, { ...bounds, label: role })
    return { roleBrowser, roleContext, rolePage }
  }

  const hostRole = await launchRoleBrowser('HOST', windowLayout.host)
  const hostBrowser = hostRole.roleBrowser
  const hostContext = hostRole.roleContext
  const hostPage = hostRole.rolePage
  let redPage = null
  let yellowPage = null
  let redBrowser = null
  let yellowBrowser = null

  try {
    logStep('Starting host-first multiplayer test flow')
    await hostContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL }).catch(() => {})
    logStep(`Window layout source: ${LARGEST_SCREEN_WIDTH > 0 ? `${LARGEST_SCREEN_WIDTH}x${LARGEST_SCREEN_HEIGHT}` : 'default fallback'}`)

    await configureTutorial(hostPage, { showTutorial: true, completed: false })
    await gotoAndWaitGameReady(hostPage, `/?size=${MAP_SIZE}&players=4&seed=${MAP_SEED}`)
    await pauseGameImmediately(hostPage)
    await setHostMapAndPlayers(hostPage)
    await ensureHostPaused(hostPage)
    await minimizeTutorialIfVisible(hostPage)

    const redInvite = await invitePartyAndCaptureCopiedUrl(hostPage, 'player2')
    expect(redInvite.inviteUrl).toBeTruthy()
    logStep(`RED invite URL ready: ${redInvite.inviteUrl}`)

    const redRole = await launchRoleBrowser('RED', windowLayout.red)
    redBrowser = redRole.roleBrowser
    redPage = redRole.rolePage
    await configureTutorial(redPage, { showTutorial: false, completed: true })
    await joinViaDirectInviteUrl(redPage, redInvite.inviteUrl, 'RED')
    await ensureHostPaused(hostPage)

    const yellowInvite = await invitePartyAndCaptureCopiedUrl(hostPage, 'player4')
    expect(yellowInvite.inviteUrl).toBeTruthy()
    logStep(`YELLOW invite URL ready: ${yellowInvite.inviteUrl}`)
    await dismissInviteQrModalIfVisible(hostPage)

    const yellowRole = await launchRoleBrowser('YELLOW', windowLayout.yellow)
    yellowBrowser = yellowRole.roleBrowser
    yellowPage = yellowRole.rolePage
    await configureTutorial(yellowPage, { showTutorial: false, completed: true })
    await joinViaDirectInviteUrl(yellowPage, yellowInvite.inviteUrl, 'YELLOW')
    await dismissInviteQrModalIfVisible(hostPage)
    logStep('Host invite modal closed after YELLOW invite flow')
    await ensureHostPaused(hostPage)

    await waitForHumansAndBlueAi(hostPage)
    logStep('Host sees RED + YELLOW connected and BLUE still AI')
    await ensureHostPaused(hostPage)

    await resumeHost(hostPage)
    logStep('Host resumed game after human connections')

    logStep('Starting parallel build progression for HOST, RED, and YELLOW')
    await Promise.all([
      buildStackToTank(hostPage, 'HOST'),
      buildStackToTank(redPage, 'RED'),
      buildStackToTank(yellowPage, 'YELLOW')
    ])

    await hostPage.waitForFunction(
      (parties) => {
        const gs = window.gameState
        if (!gs) return false

        const ownerAliasesForParty = (partyId) => {
          if (partyId === 'player1') {
            const aliases = ['player1', 'player']
            if (typeof gs.humanPlayer === 'string' && gs.humanPlayer.length > 0) {
              aliases.push(gs.humanPlayer)
            }
            return [...new Set(aliases)]
          }
          return [partyId]
        }

        const buildingMatchesParty = (building, partyId) => ownerAliasesForParty(partyId).includes(building.owner)
        const unitMatchesParty = (unit, partyId) => ownerAliasesForParty(partyId).includes(unit.owner)

        return parties.every((partyId) => {
          const hasPower = (gs.buildings || []).some((building) => buildingMatchesParty(building, partyId) && building.type === 'powerPlant')
          const hasRefinery = (gs.buildings || []).some((building) => buildingMatchesParty(building, partyId) && building.type === 'oreRefinery')
          const hasFactory = (gs.buildings || []).some((building) => buildingMatchesParty(building, partyId) && building.type === 'vehicleFactory')
          const hasHarvester = (gs.units || []).some((unit) => unitMatchesParty(unit, partyId) && unit.type === 'harvester')
          const hasTank = (gs.units || []).some((unit) => unitMatchesParty(unit, partyId) && (unit.type === 'tank_v1' || unit.type === 'tank'))
          return hasPower && hasRefinery && hasFactory && hasHarvester && hasTank
        })
      },
      CONTROLLED_PARTIES,
      { timeout: 90000 }
    )

    const baseProgression = await hostPage.evaluate((parties) => {
      const gs = window.gameState
      if (!gs) return null

      const ownerAliasesForParty = (partyId) => {
        if (partyId === 'player1') {
          const aliases = ['player1', 'player']
          if (typeof gs?.humanPlayer === 'string' && gs.humanPlayer.length > 0) {
            aliases.push(gs.humanPlayer)
          }
          return [...new Set(aliases)]
        }
        return [partyId]
      }

      const unitMatchesParty = (unit, partyId) => ownerAliasesForParty(partyId).includes(unit.owner)
      const buildingMatchesParty = (building, partyId) => ownerAliasesForParty(partyId).includes(building.owner)

      return parties.map((pid) => {
        const blds = gs.buildings || []
        const uts = gs.units || []
        return {
          partyId: pid,
          hasConstructionYard: blds.some((b) => buildingMatchesParty(b, pid) && b.type === 'constructionYard'),
          hasPowerPlant: blds.some((b) => buildingMatchesParty(b, pid) && b.type === 'powerPlant'),
          hasOreRefinery: blds.some((b) => buildingMatchesParty(b, pid) && b.type === 'oreRefinery'),
          hasVehicleFactory: blds.some((b) => buildingMatchesParty(b, pid) && b.type === 'vehicleFactory'),
          harvesterCount: uts.filter((u) => unitMatchesParty(u, pid) && u.type === 'harvester').length,
          tankCount: uts.filter((u) => unitMatchesParty(u, pid) && (u.type === 'tank_v1' || u.type === 'tank')).length
        }
      })
    }, CONTROLLED_PARTIES)

    logStep(`Base progression snapshot: ${JSON.stringify(baseProgression)}`)
    const economyBaseline = await capturePartyEconomyBaseline(hostPage)
    await waitForPartyIncomeAfterRefineryUnload(hostPage, economyBaseline)
    logStep('Refinery unload income accounted for HOST, RED, and YELLOW parties')
    logStep('Host/RED/YELLOW each completed visible build stack to tank without direct spawn shortcuts')

    if (fullAssault) {
      logStep('FULL assault: issuing immediate AGF from current tanks to BLUE targets')
      await Promise.all([
        issuePartyAgfAssaultViaEngine(hostPage, 'HOST', [AI_PARTY]),
        issuePartyAgfAssaultViaEngine(redPage, 'RED', [AI_PARTY]),
        issuePartyAgfAssaultViaEngine(yellowPage, 'YELLOW', [AI_PARTY])
      ])

      logStep(`FULL assault: building to ${FULL_ASSAULT_TANK_COUNT} tanks per human party with immediate programmatic AGF targeting of BLUE structures`)
      await Promise.all([
        buildTankStack(hostPage, 'HOST', FULL_ASSAULT_TANK_COUNT, () => issuePartyAgfAssaultViaEngine(hostPage, 'HOST', [AI_PARTY])),
        buildTankStack(redPage, 'RED', FULL_ASSAULT_TANK_COUNT, () => issuePartyAgfAssaultViaEngine(redPage, 'RED', [AI_PARTY])),
        buildTankStack(yellowPage, 'YELLOW', FULL_ASSAULT_TANK_COUNT, () => issuePartyAgfAssaultViaEngine(yellowPage, 'YELLOW', [AI_PARTY]))
      ])

      await waitForPartyStructuresElimination(hostPage, AI_PARTY, 360000)
      logStep('FULL assault: BLUE structures eliminated')
    }
  } finally {
    logStep('Cleaning up browser contexts')
    await hostBrowser.close().catch(() => {})
    if (redBrowser) {
      await redBrowser.close().catch(() => {})
    }
    if (yellowBrowser) {
      await yellowBrowser.close().catch(() => {})
    }
  }
}

/** Verify RED and YELLOW are human-connected and BLUE is still AI. */
async function waitForHumansAndBlueAi(hostPage) {
  await hostPage.waitForFunction(
    (aiPid) => {
      const parties = window.gameState?.partyStates || []
      const red = parties.find((p) => p.partyId === 'player2')
      const yellow = parties.find((p) => p.partyId === 'player4')
      const blue = parties.find((p) => p.partyId === aiPid)

      return red?.aiActive === false
        && yellow?.aiActive === false
        && blue?.aiActive === true
    },
    AI_PARTY,
    { timeout: 60000 }
  )
}

/** Unpause the host game. */
async function resumeHost(hostPage) {
  const isPaused = await hostPage.evaluate(() => Boolean(window.gameState?.gamePaused))
  if (isPaused) {
    await hostPage.locator('#pauseBtn').click()
  }
  await hostPage.waitForFunction(
    () => window.gameState?.gamePaused === false,
    { timeout: 15000 }
  )
}

async function capturePartyEconomyBaseline(hostPage) {
  return hostPage.evaluate(async(parties) => {
    const gs = window.gameState
    const { factories } = await import('/src/main.js')
    const baseline = {
      hostMoney: Number(gs?.money) || 0,
      factoryBudgets: {}
    }

    parties.forEach((partyId) => {
      if (partyId === 'player1') {
        return
      }
      const factory = (factories || []).find((item) => (item.owner || item.id) === partyId)
      baseline.factoryBudgets[partyId] = Number(factory?.budget) || 0
    })

    return baseline
  }, CONTROLLED_PARTIES)
}

async function waitForPartyIncomeAfterRefineryUnload(hostPage, baseline) {
  const timeoutMs = 180000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const hasIncomeIncrease = await hostPage.evaluate(async({ parties, baselineSnapshot }) => {
      const gs = window.gameState
      const { factories } = await import('/src/main.js')
      if (!gs) return false

      const hostIncreased = (Number(gs.money) || 0) > (Number(baselineSnapshot.hostMoney) || 0)
      if (!hostIncreased) {
        return false
      }

      return parties
        .filter((partyId) => partyId !== 'player1')
        .every((partyId) => {
          const factory = (factories || []).find((item) => (item.owner || item.id) === partyId)
          const currentBudget = Number(factory?.budget) || 0
          const initialBudget = Number(baselineSnapshot.factoryBudgets?.[partyId]) || 0
          return currentBudget > initialBudget
        })
    }, { parties: CONTROLLED_PARTIES, baselineSnapshot: baseline })

    if (hasIncomeIncrease) {
      return
    }

    await hostPage.waitForTimeout(1000)
  }

  throw new Error('Timed out waiting for HOST/RED/YELLOW refinery income increase after baseline snapshot')
}

// ────────────────────────────────────────────────────────────────────
//  Test
// ────────────────────────────────────────────────────────────────────

test.describe('Netlify multiplayer 4-party sync', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(420000)

  test('host setup + invite flow → 3-party build/combat with blue AI', async({ browser }) => {
    await runMultiplayerScenario(browser, { fullAssault: false })
  })

  test('extended full assault → 2 tanks each + immediate AGF wipe blue structures', async({ browser }) => {
    test.setTimeout(900000)
    await runMultiplayerScenario(browser, { fullAssault: true })
  })
})
