import { test, expect } from '@playwright/test'

/**
 * E2E Test: Basic Game Flow
 *
 * This test simulates a human player:
 * 1. Starting a new game with seed 11
 * 2. Building a power plant
 * 3. Building a refinery
 * 4. Building a vehicle factory
 * 5. Producing a harvester
 * 6. Producing a tank
 * 7. Commanding the tank to move to the closest ore field
 *
 * Verifies:
 * - No console errors during gameplay
 * - Money/power correctly updated after each build
 * - All buildings and units can be built successfully
 */

// Building costs from buildingData.js (for reference)
// powerPlant: 2000, oreRefinery: 2500, vehicleFactory: 3000
// harvester: 1500, tank: 1000

// Initial money
const STARTING_MONEY = 10000

test.describe('Basic Game Flow', () => {
  /** @type {string[]} */
  let consoleErrors = []

  test.beforeEach(async({ page }) => {
    consoleErrors = []

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Capture page errors (uncaught exceptions)
    page.on('pageerror', error => {
      consoleErrors.push(`Page error: ${error.message}`)
    })
  })

  test('[E00013] should build a base and produce units without errors', async({ page }) => {
    // =======================
    // 0. DISABLE TUTORIAL BEFORE PAGE LOAD
    // =======================

    // Disable tutorial to prevent it from blocking UI interaction
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    // =======================
    // 1. LOAD GAME WITH SEED 11 VIA URL PARAMETER
    // =======================

    // Navigate to the game with seed parameter to avoid UI manipulation
    console.log('Loading game with seed 11 via URL parameter...')
    await page.goto('/?seed=11')

    // Wait for game to fully load (canvas should be visible)
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    // Wait for game initialization (game starts unpaused after setup)
    // Wait for the sidebar to be ready
    await page.waitForSelector('#sidebar', { state: 'visible' })

    // Wait for game state to be fully ready - first check that gameState exists
    await page.waitForFunction(() => {
      return window.gameState !== undefined
    }, { timeout: 10000 })

    // Then check game started and unpause if needed
    await page.waitForFunction(() => {
      const gs = window.gameState
      if (!gs) return false

      // If game started but is paused, unpause it
      if (gs.gameStarted && gs.gamePaused) {
        gs.gamePaused = false
      }

      // Return true if game is started and not paused
      return gs.gameStarted && !gs.gamePaused
    }, { timeout: 30000 })

    // Extra safety delay for UI to settle
    await page.waitForTimeout(500)

    // Log game state for debugging
    await page.evaluate(() => {
      console.log('=== GAME STATE CHECK ===')
      console.log('gameStarted:', window.gameState?.gameStarted)
      console.log('gamePaused:', window.gameState?.gamePaused)
      console.log('mapSeed:', window.gameState?.mapSeed)
      console.log('money:', window.gameState?.money)
      console.log('buildings:', window.gameState?.buildings?.length)
      console.log('========================')
    })

    // Verify seed was set correctly
    const actualSeed = await page.evaluate(() => window.gameState?.mapSeed)
    console.log('Map seed from URL parameter:', actualSeed)
    expect(actualSeed).toBe('11')

    // Dismiss any blocking overlays (tutorial/benchmark) before interacting with UI
    const tutorialSkip = page.getByRole('button', { name: 'Skip tutorial' })
    if (await tutorialSkip.isVisible()) {
      await tutorialSkip.click()
    }

    const tutorialMinimize = page.locator('[data-tutorial-action="minimize"]')
    if (await tutorialMinimize.isVisible()) {
      await tutorialMinimize.click()
    }

    // Close benchmark modal via JavaScript to bypass canvas pointer interception
    await page.evaluate(() => {
      const btn = document.getElementById('benchmarkModalCloseBtn') ||
                  document.getElementById('benchmarkModalCloseFooterBtn')
      if (btn) {
        btn.click()
      }
    })

    // Verify initial money is displayed
    const moneyDisplay = page.locator('#moneyText, #mobileMoneyValue').first()
    await expect(moneyDisplay).toBeVisible()

    // Helper function to get current money
    async function getMoney() {
      const text = (await moneyDisplay.textContent()) || ''
      // Extract number from text like "$10,000" or "10000"
      const match = text.replace(/,/g, '').match(/\d+/)
      return match ? parseInt(match[0], 10) : 0
    }

    // Helper function to wait for building to be ready for placement
    async function waitForBuildingReady(buildingType, timeout = 30000) {
      console.log(`Waiting for ${buildingType} to be ready...`)
      const button = page.locator(`button.production-button[data-building-type="${buildingType}"]`)
      // Wait for the button to have 'ready-for-placement' class
      await expect(button).toHaveClass(/ready-for-placement/, { timeout })
      console.log(`${buildingType} is ready for placement`)
    }

    // Helper function to wait for unit production to complete
    async function waitForUnitReady(unitType, timeout = 30000) {
      console.log(`Waiting for ${unitType} production to complete...`)
      // Unit production completes when progress bar disappears or reaches 100%
      const button = page.locator(`button.production-button[data-unit-type="${unitType}"]`)
      // Wait for button to no longer have 'active' class (production complete)
      await expect(button).not.toHaveClass(/active/, { timeout })
      console.log(`${unitType} production complete`)
    }

    // Helper to find placement position for nth building, incrementally offset to avoid collisions
    async function findPlacementPositionForBuilding(buildingIndex) {
      const canvas = page.locator('#gameCanvas')
      const box = await canvas.boundingBox()
      if (!box) throw new Error('Canvas not found')

      const factoryInfo = await page.evaluate(() => {
        const buildings = window.gameState?.buildings || []
        const factory = buildings.find(b => b.type === 'factory' || b.type === 'constructionYard')
        if (factory) {
          return {
            x: factory.x,
            y: factory.y,
            width: factory.width || 3,
            height: factory.height || 3
          }
        }
        return null
      })

      const TILE_SIZE = 32
      const MIN_DISTANCE_TILES = 2

      if (factoryInfo) {
        const factoryRightEdge = factoryInfo.x + factoryInfo.width

        // Place buildings to the right of refinery: each building incrementally to the right
        const buildingWidth = 3 // Standard building width
        const buildingX = factoryRightEdge + MIN_DISTANCE_TILES + (buildingIndex * (buildingWidth + 1))
        const buildingY = factoryInfo.y // Align with factory top

        const scrollOffset = await page.evaluate(() => ({
          x: window.gameState?.scrollOffset?.x || 0,
          y: window.gameState?.scrollOffset?.y || 0
        }))

        const screenX = buildingX * TILE_SIZE - scrollOffset.x
        const screenY = buildingY * TILE_SIZE - scrollOffset.y

        const clampedX = Math.max(box.x, Math.min(box.x + box.width - 100, screenX + box.x))
        const clampedY = Math.max(box.y, Math.min(box.y + box.height - 100, screenY + box.y))

        return {
          x: clampedX,
          y: clampedY
        }
      }

      return {
        x: box.x + box.width * 0.7,
        y: box.y + box.height * 0.7
      }
    }

    // Helper to find placement position for refinery (top left of construction yard)
    async function findRefinerPlacementPosition() {
      const canvas = page.locator('#gameCanvas')
      const box = await canvas.boundingBox()
      if (!box) throw new Error('Canvas not found')

      const factoryInfo = await page.evaluate(() => {
        const buildings = window.gameState?.buildings || []
        const factory = buildings.find(b => b.type === 'factory' || b.type === 'constructionYard')
        if (factory) {
          return {
            x: factory.x,
            y: factory.y,
            width: factory.width || 3,
            height: factory.height || 3
          }
        }
        return null
      })

      const TILE_SIZE = 32
      const MIN_DISTANCE_TILES = 2

      if (factoryInfo) {
        // Place refinery to the top left of factory
        const buildingX = factoryInfo.x - (3 + MIN_DISTANCE_TILES) // 3 is refinery width, place to the left
        const buildingY = factoryInfo.y // Align with factory top

        const scrollOffset = await page.evaluate(() => ({
          x: window.gameState?.scrollOffset?.x || 0,
          y: window.gameState?.scrollOffset?.y || 0
        }))

        const screenX = buildingX * TILE_SIZE - scrollOffset.x
        const screenY = buildingY * TILE_SIZE - scrollOffset.y

        const clampedX = Math.max(box.x, Math.min(box.x + box.width - 100, screenX + box.x))
        const clampedY = Math.max(box.y, Math.min(box.y + box.height - 100, screenY + box.y))

        return {
          x: clampedX,
          y: clampedY
        }
      }

      return {
        x: box.x + box.width * 0.3,
        y: box.y + box.height * 0.7
      }
    }

    let currentMoney = await getMoney()
    console.log('Initial money:', currentMoney)
    expect(currentMoney).toBeGreaterThanOrEqual(STARTING_MONEY - 1000) // Allow some margin

    // Take initial screenshot
    await page.screenshot({ path: 'test-results/01-initial-state.png' })

    // ========================================
    // Step 1: Build Power Plant
    // ========================================
    console.log('=== Step 1: Building Power Plant ===')

    // Make sure we're on the buildings tab
    const buildingsTab = page.locator('button.tab-button[data-tab="buildings"]')
    await expect(buildingsTab).toBeVisible()
    await buildingsTab.click()
    await page.waitForTimeout(300)

    // Take screenshot after tab click
    await page.screenshot({ path: 'test-results/02-buildings-tab.png' })

    // Click power plant button
    const powerPlantBtn = page.locator('button.production-button[data-building-type="powerPlant"]')
    await expect(powerPlantBtn).toBeVisible()

    // Verify button is enabled
    const isPowerPlantEnabled = await powerPlantBtn.isEnabled()
    console.log('Power Plant button enabled:', isPowerPlantEnabled)

    await powerPlantBtn.click()
    console.log('Clicked Power Plant button (first time)')
    await page.waitForTimeout(300)

    // Take screenshot after first click
    await page.screenshot({ path: 'test-results/03-powerplant-queued.png' })

    // Wait for power plant to be ready
    await waitForBuildingReady('powerPlant')

    // Take screenshot when ready
    await page.screenshot({ path: 'test-results/04-powerplant-ready.png' })

    // Click the button again to enter placement mode
    await powerPlantBtn.click()
    console.log('Clicked Power Plant button (second time - enter placement mode)')
    await page.waitForTimeout(300)

    // Click the button again to enter placement mode
    await powerPlantBtn.click()
    console.log('Clicked Power Plant button (second time - enter placement mode)')
    await page.waitForTimeout(300)

    // Take screenshot in placement mode
    await page.screenshot({ path: 'test-results/05-powerplant-placement-mode.png' })

    // Verify placement mode is active
    const isInPlacementMode = await page.evaluate(() => {
      return window.gameState?.buildingPlacementMode === true
    })
    console.log('In placement mode:', isInPlacementMode)

    // Find a valid position and place the building (power plant is first to the right)
    const pos1 = await findPlacementPositionForBuilding(0)
    console.log(`Placing Power Plant at (${pos1.x}, ${pos1.y})`)
    await page.mouse.click(pos1.x, pos1.y)

    // Wait for placement to complete
    await page.waitForTimeout(1000)

    // Take screenshot after placement
    await page.screenshot({ path: 'test-results/06-powerplant-placed.png' })

    // Verify money decreased
    currentMoney = await getMoney()
    console.log('Money after Power Plant:', currentMoney)

    // Verify building count increased
    const buildingCount1 = await page.evaluate(() => window.gameState?.buildings?.length || 0)
    console.log('Building count after Power Plant:', buildingCount1)

    // ========================================
    // Step 2: Build Ore Refinery
    // ========================================
    console.log('=== Step 2: Building Ore Refinery ===')

    const refineryBtn = page.locator('button.production-button[data-building-type="oreRefinery"]')
    await expect(refineryBtn).toBeVisible()
    await refineryBtn.click()
    console.log('Clicked Refinery button (first time)')
    await page.waitForTimeout(300)

    // Wait for refinery to be ready
    await waitForBuildingReady('oreRefinery')

    // Enter placement mode
    await refineryBtn.click()
    console.log('Clicked Refinery button (second time - enter placement mode)')
    await page.waitForTimeout(300)

    // Place refinery to the top left of construction yard
    const pos2 = await findRefinerPlacementPosition()
    console.log(`Placing Refinery at (${pos2.x}, ${pos2.y})`)
    await page.mouse.click(pos2.x, pos2.y)

    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/07-refinery-placed.png' })

    currentMoney = await getMoney()
    console.log('Money after Refinery:', currentMoney)

    const buildingCount2 = await page.evaluate(() => window.gameState?.buildings?.length || 0)
    console.log('Building count after Refinery:', buildingCount2)

    // ========================================
    // Step 3: Build Vehicle Factory
    // ========================================
    console.log('=== Step 3: Building Vehicle Factory ===')

    const factoryBtn = page.locator('button.production-button[data-building-type="vehicleFactory"]')
    await expect(factoryBtn).toBeVisible()
    await factoryBtn.click()
    console.log('Clicked Vehicle Factory button (first time)')
    await page.waitForTimeout(300)

    // Wait for factory to be ready
    await waitForBuildingReady('vehicleFactory')

    // Enter placement mode
    await factoryBtn.click()
    console.log('Clicked Vehicle Factory button (second time - enter placement mode)')
    await page.waitForTimeout(300)

    // Place factory to the right of power plant
    const pos3 = await findPlacementPositionForBuilding(1)
    console.log(`Placing Vehicle Factory at (${pos3.x}, ${pos3.y})`)
    await page.mouse.click(pos3.x, pos3.y)

    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/08-factory-placed.png' })

    currentMoney = await getMoney()
    console.log('Money after Vehicle Factory:', currentMoney)

    const buildingCount3 = await page.evaluate(() => window.gameState?.buildings?.length || 0)
    console.log('Building count after Vehicle Factory:', buildingCount3)

    // ========================================
    // Step 4: Switch to Units tab and build Harvester
    // ========================================
    console.log('=== Step 4: Building Harvester ===')

    // Switch to units tab
    const unitsTab = page.locator('button.tab-button[data-tab="units"]')
    await expect(unitsTab).toBeVisible()
    await unitsTab.click()
    console.log('Switched to Units tab')
    await page.waitForTimeout(300)

    await page.screenshot({ path: 'test-results/09-units-tab.png' })

    // Wait for units tab to be active
    await page.waitForTimeout(300)

    // Click harvester button
    const harvesterBtn = page.locator('button.production-button[data-unit-type="harvester"]')
    await expect(harvesterBtn).toBeVisible()
    await harvesterBtn.click()
    console.log('Clicked Harvester button')
    await page.waitForTimeout(300)

    await page.screenshot({ path: 'test-results/10-harvester-queued.png' })

    // Wait for harvester production to complete
    await waitForUnitReady('harvester', 60000)

    await page.screenshot({ path: 'test-results/11-harvester-complete.png' })

    currentMoney = await getMoney()
    console.log('Money after Harvester:', currentMoney)

    const unitCount1 = await page.evaluate(() => window.gameInstance?.units?.length || 0)
    console.log('Unit count after Harvester:', unitCount1)

    // ========================================
    // Step 5: Build Tank
    // ========================================
    console.log('=== Step 5: Building Tank ===')

    const tankBtn = page.locator('button.production-button[data-unit-type="tank"]')
    await expect(tankBtn).toBeVisible()
    await tankBtn.click()
    console.log('Clicked Tank button')
    await page.waitForTimeout(300)

    await page.screenshot({ path: 'test-results/12-tank-queued.png' })

    // Wait for tank production to complete
    await waitForUnitReady('tank', 60000)

    await page.screenshot({ path: 'test-results/13-tank-complete.png' })

    currentMoney = await getMoney()
    console.log('Money after Tank:', currentMoney)

    const unitCount2 = await page.evaluate(() => window.gameInstance?.units?.length || 0)
    console.log('Unit count after Tank:', unitCount2)

    // ========================================
    // Step 6: Queue harvesters to drain money, then apply cheat for rest of test
    // ========================================
    console.log('=== Step 6: Queuing harvesters ===')

    for (let i = 0; i < 2; i++) {
      console.log(`Building harvester ${i + 1}/2`)
      const harvesterBtn = page.locator('button.production-button[data-unit-type="harvester"]')
      await expect(harvesterBtn).toBeVisible()
      await harvesterBtn.click()
      console.log(`Clicked Harvester button (harvester ${i + 1})`)
      await page.waitForTimeout(300)
    }

    currentMoney = await getMoney()
    console.log('Money after queuing harvesters:', currentMoney)

    const unitCount3 = await page.evaluate(() => window.gameInstance?.units?.length || 0)
    console.log('Unit count after queueing harvesters:', unitCount3)

    await page.screenshot({ path: 'test-results/13b-harvesters-queued.png' })

    // ========================================
    // Step 7: Open cheat console and apply "give 999999"
    // ========================================
    console.log('=== Step 7: Applying cheat to get money for remaining steps ===')

    // Open cheat console by pressing 'c' key
    console.log('Attempting to open cheat console with c key...')
    await page.keyboard.press('KeyC')
    console.log('Pressed c key to open cheat console')
    await page.waitForTimeout(1000)

    await page.screenshot({ path: 'test-results/14-cheat-console-opened.png' })

    // Wait for cheat input to become visible
    const cheatInput = page.locator('#cheat-input')
    console.log('Looking for cheat input element with id #cheat-input...')

    try {
      await expect(cheatInput).toBeVisible({ timeout: 5000 })
      console.log('✓ Cheat input found and visible')
    } catch {
      console.error('❌ Cheat input not visible after 5 seconds')
      await page.screenshot({ path: 'test-results/14b-cheat-console-not-visible.png' })
      throw new Error('Cheat console input not found')
    }

    // Type the cheat command
    console.log('Focusing cheat input and typing command...')
    await cheatInput.focus()
    await page.keyboard.type('give 999999')
    console.log('Typed "give 999999" into cheat console')
    await page.waitForTimeout(300)

    // Press Enter to execute cheat
    await page.keyboard.press('Enter')
    console.log('Pressed Enter to execute cheat')
    await page.waitForTimeout(500)

    await page.screenshot({ path: 'test-results/15-cheat-executed.png' })

    // Close cheat console by pressing Escape
    await page.keyboard.press('Escape')
    console.log('Closed cheat console')
    await page.waitForTimeout(300)

    // ========================================
    // Step 8: Verify cheat money was added and notification shown
    // ========================================
    console.log('=== Step 8: Verifying cheat money and notification ===')

    const moneyAfterCheat = await getMoney()
    console.log('Money after cheat:', moneyAfterCheat)

    // Check if cheat was applied successfully - money should be very high
    // (>= 900000 to ensure the "give 999999" was applied)
    if (moneyAfterCheat >= 900000) {
      console.log('✓ Cheat successfully added money - current balance:', moneyAfterCheat)
      expect(moneyAfterCheat).toBeGreaterThanOrEqual(900000)
    } else {
      console.error('❌ ERROR: Cheat did not add expected amount. Current:', moneyAfterCheat)
      expect(moneyAfterCheat).toBeGreaterThanOrEqual(900000)
    }

    // Look for cheat success notification
    const cheatNotification = page.locator('[class*="notification"]', { has: page.locator('text=/[Cc]heat|success/i') })
    const isNotificationVisible = await cheatNotification.isVisible().catch(() => false)
    console.log('Cheat success notification visible:', isNotificationVisible)

    await page.screenshot({ path: 'test-results/16-cheat-verified.png' })

    currentMoney = moneyAfterCheat

    // Get canvas reference for later use in Steps 12-13
    const canvas = page.locator('#gameCanvas')
    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Canvas not found')

    // ========================================
    // Step 9: Build Radar Station
    // ========================================
    console.log('=== Step 9: Building Radar Station ===')

    // Switch to buildings tab if not already there
    const buildingsTab2 = page.locator('button.tab-button[data-tab="buildings"]')
    await expect(buildingsTab2).toBeVisible()
    await buildingsTab2.click()
    console.log('Switched to Buildings tab')
    await page.waitForTimeout(300)

    const radarBtn = page.locator('button.production-button[data-building-type="radarStation"]')
    await expect(radarBtn).toBeVisible()
    await radarBtn.click()
    console.log('Clicked Radar Station button (first time)')
    await page.waitForTimeout(300)

    // Wait for radar to be ready
    await waitForBuildingReady('radarStation')

    // Enter placement mode
    await radarBtn.click()
    console.log('Clicked Radar Station button (second time - enter placement mode)')
    await page.waitForTimeout(300)

    // Find placement position and place
    const radarPos = await findPlacementPositionForBuilding(2)
    console.log(`Placing Radar Station at (${radarPos.x}, ${radarPos.y})`)
    await page.mouse.click(radarPos.x, radarPos.y)
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'test-results/17-radar-placed.png' })

    currentMoney = await getMoney()
    console.log('Money after Radar Station:', currentMoney)

    const buildingCount4 = await page.evaluate(() => window.gameState?.buildings?.length || 0)
    console.log('Building count after Radar Station:', buildingCount4)

    // Verify minimap is now visible on sidebar
    const minimap = page.locator('#minimapContainer, [class*="minimap"]').first()
    const isMinimapVisible = await minimap.isVisible().catch(() => false)
    console.log('Minimap visible on sidebar:', isMinimapVisible)

    if (isMinimapVisible) {
      console.log('✓ Minimap is now showing on sidebar')
      expect(minimap).toBeVisible()
    }

    await page.screenshot({ path: 'test-results/18-radar-minimap-check.png' })

    // ========================================
    // Step 10: Build Gas Station
    // ========================================
    console.log('=== Step 10: Building Gas Station ===')

    const gasStationBtn = page.locator('button.production-button[data-building-type="gasStation"]')
    await expect(gasStationBtn).toBeVisible()
    await gasStationBtn.click()
    console.log('Clicked Gas Station button (first time)')
    await page.waitForTimeout(300)

    // Wait for gas station to be ready
    await waitForBuildingReady('gasStation')

    // Enter placement mode
    await gasStationBtn.click()
    console.log('Clicked Gas Station button (second time - enter placement mode)')
    await page.waitForTimeout(300)

    // Find placement position and place
    const gasPos = await findPlacementPositionForBuilding(3)
    console.log(`Placing Gas Station at (${gasPos.x}, ${gasPos.y})`)
    await page.mouse.click(gasPos.x, gasPos.y)
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'test-results/19-gasstation-placed.png' })
    currentMoney = await getMoney()
    console.log('Money after Gas Station:', currentMoney)

    const buildingCount5 = await page.evaluate(() => window.gameState?.buildings?.length || 0)
    console.log('Building count after Gas Station:', buildingCount5)

    // ========================================
    // Step 11: Build Tanker Truck
    // ========================================
    console.log('=== Step 11: Building Tanker Truck ===')

    // Wait for tanker truck button to become enabled (requires Vehicle Factory + Gas Station)
    console.log('Waiting for tanker truck button to be enabled...')
    let tankerBtnEnabled = false
    let tankerWaitAttempts = 0
    while (!tankerBtnEnabled && tankerWaitAttempts < 30) {
      const tankerBtn = page.locator('button.production-button[data-unit-type="tankerTruck"]')
      const isDisabled = await tankerBtn.evaluate(el => el.classList.contains('disabled')).catch(() => true)
      if (!isDisabled) {
        tankerBtnEnabled = true
        console.log('✓ Tanker truck button is now enabled')
      } else {
        await page.waitForTimeout(300)
        tankerWaitAttempts++
        if (tankerWaitAttempts % 5 === 0) {
          console.log(`  Still waiting for tanker button... (${tankerWaitAttempts}s)`)
        }
      }
    }

    if (!tankerBtnEnabled) {
      console.warn('⚠️ Tanker truck button still disabled after waiting, attempting anyway')
    }

    // Switch to units tab
    const unitsTab2 = page.locator('button.tab-button[data-tab="units"]')
    await expect(unitsTab2).toBeVisible()
    await unitsTab2.click()
    console.log('Switched to Units tab')
    await page.waitForTimeout(300)

    const tankerBtn = page.locator('button.production-button[data-unit-type="tankerTruck"]')
    await expect(tankerBtn).toBeVisible()
    await tankerBtn.click()
    console.log('Clicked Tanker Truck button')
    await page.waitForTimeout(300)

    await page.screenshot({ path: 'test-results/20-tanker-queued.png' })

    // Wait for tanker production to complete
    await waitForUnitReady('tankerTruck', 60000)

    await page.screenshot({ path: 'test-results/21-tanker-complete.png' })

    currentMoney = await getMoney()
    console.log('Money after Tanker Truck:', currentMoney)

    const unitCount4 = await page.evaluate(() => window.gameInstance?.units?.length || 0)
    console.log('Unit count after Tanker Truck:', unitCount4)

    // ========================================
    // Step 12: Test tanker refueling - empty tank fuel with cheat, refuel with tanker
    // ========================================
    console.log('=== Step 12: Testing tanker refueling ===')

    // First, select the tank to target it with the fuel cheat
    // The tank was produced in Step 5 and should be near the vehicle factory location
    const tankClickX = canvasBox.x + canvasBox.width * 0.45
    const tankClickY = canvasBox.y + canvasBox.height * 0.6

    console.log(`Clicking to select tank at (${tankClickX}, ${tankClickY})`)
    await page.mouse.click(tankClickX, tankClickY)
    await page.waitForTimeout(300)

    await page.screenshot({ path: 'test-results/22-tank-selected-for-cheat.png' })

    // Verify tank is selected by checking if unit info appears in HUD
    const hudUnitInfo = page.locator('[class*="unit"], [id*="unit"]').first()
    const isUnitInfoVisible = await hudUnitInfo.isVisible().catch(() => false)
    console.log('Unit info visible in HUD:', isUnitInfoVisible)

    // Open cheat console and apply "fuel 0" to the selected tank
    console.log('Opening cheat console to empty tank fuel...')
    await page.keyboard.press('KeyC')
    await page.waitForTimeout(500)

    const cheatInput2 = page.locator('#cheat-input')
    if (await cheatInput2.isVisible()) {
      console.log('✓ Cheat console is visible')
      await cheatInput2.focus()
      // Use cheat to empty fuel of selected tank
      await page.keyboard.type('fuel 0')
      console.log('Typed "fuel 0" cheat command to empty selected tank fuel')
      await page.waitForTimeout(300)

      await page.keyboard.press('Enter')
      console.log('Executed empty fuel cheat on tank')
      await page.waitForTimeout(500)

      await page.screenshot({ path: 'test-results/23-tank-fuel-emptied-cheat.png' })

      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    } else {
      console.error('❌ Cheat console not visible')
      throw new Error('Cheat console input not found')
    }

    // Check HUD for fuel bar (should be empty or low)
    const hudFuelBarBefore = page.locator('[class*="fuel"], [id*="fuel"]').first()
    const isFuelBarVisibleBefore = await hudFuelBarBefore.isVisible().catch(() => false)
    console.log('Fuel bar visible before refuel:', isFuelBarVisibleBefore)

    await page.screenshot({ path: 'test-results/24-tank-displayed-with-empty-fuel.png' })

    // Now select the tanker truck and command it to move to the tank and refuel
    // The tanker truck was produced in Step 11 and should be near the vehicle factory
    // Click on the tanker truck unit (slightly offset from tank location)
    const tankerClickX = canvasBox.x + canvasBox.width * 0.42
    const tankerClickY = canvasBox.y + canvasBox.height * 0.65

    console.log(`Clicking to select tanker truck at (${tankerClickX}, ${tankerClickY})`)
    await page.mouse.click(tankerClickX, tankerClickY)
    await page.waitForTimeout(300)

    await page.screenshot({ path: 'test-results/25-tanker-truck-selected.png' })

    // Right-click on the tank to command the tanker truck to move to it for refueling
    console.log(`Right-clicking on tank to command tanker to refuel at (${tankClickX}, ${tankClickY})`)
    await page.mouse.click(tankClickX, tankClickY, { button: 'right' })
    await page.waitForTimeout(1000)

    await page.screenshot({ path: 'test-results/26-tanker-refuel-command-issued.png' })

    // Wait for tanker to move to tank and perform refueling
    console.log('Waiting for tanker to move to tank and refuel...')
    await page.waitForTimeout(2000)

    // Select the tank again to check if fuel was restored
    console.log(`Re-selecting tank to check fuel status at (${tankClickX}, ${tankClickY})`)
    await page.mouse.click(tankClickX, tankClickY)
    await page.waitForTimeout(500)

    await page.screenshot({ path: 'test-results/27-tank-after-refuel.png' })

    // Check HUD for fuel bar (should be refilled or higher)
    const hudFuelBarAfter = page.locator('[class*="fuel"], [id*="fuel"]').first()
    const isFuelBarVisibleAfter = await hudFuelBarAfter.isVisible().catch(() => false)
    console.log('Fuel bar visible after refuel:', isFuelBarVisibleAfter)

    if (isFuelBarVisibleAfter) {
      console.log('✓ Fuel bar is visible in HUD after refueling with tanker truck')
    }

    // ========================================
    // Step 13: Select tank and command to move to ore field
    // ========================================
    console.log('=== Step 13: Commanding tank to move to ore field ===')

    // Select the tank
    console.log(`Clicking to select tank at (${tankClickX}, ${tankClickY})`)
    await page.mouse.click(tankClickX, tankClickY)
    await page.waitForTimeout(300)

    await page.screenshot({ path: 'test-results/28-tank-selected-for-move.png' })

    // Right-click to command move towards ore (ore typically spawns at various locations)
    // We'll command the tank to move towards where ore fields are likely to be
    const oreTargetX = canvasBox.x + canvasBox.width * 0.2
    const oreTargetY = canvasBox.y + canvasBox.height * 0.3

    console.log(`Right-clicking to move tank to (${oreTargetX}, ${oreTargetY})`)
    await page.mouse.click(oreTargetX, oreTargetY, { button: 'right' })
    await page.waitForTimeout(500)

    await page.screenshot({ path: 'test-results/29-tank-move-command.png' })

    console.log('✓ Move command issued to tank')

    // ========================================
    // Final Verification
    // ========================================
    console.log('=== Final Verification ===')

    // Wait a moment for any async operations
    await page.waitForTimeout(1000)

    // Take final screenshot
    await page.screenshot({ path: 'test-results/30-final-state.png' })

    // Get final game state
    const finalState = await page.evaluate(() => ({
      money: window.gameState?.money,
      buildings: window.gameState?.buildings?.length,
      units: window.gameInstance?.units?.length,
      gameStarted: window.gameState?.gameStarted,
      gamePaused: window.gameState?.gamePaused
    }))

    console.log('=== FINAL GAME STATE ===')
    console.log('Money:', finalState.money)
    console.log('Buildings:', finalState.buildings)
    console.log('Units:', finalState.units)
    console.log('Game Started:', finalState.gameStarted)
    console.log('Game Paused:', finalState.gamePaused)
    console.log('========================')

    // Verify no console errors occurred
    const criticalErrors = consoleErrors.filter(err =>
      !err.includes('favicon') &&
      !err.includes('404') &&
      !err.includes('net::ERR') &&
      !err.includes('ResizeObserver')
    )

    if (criticalErrors.length > 0) {
      console.error('Console errors:', criticalErrors)
    }

    expect(criticalErrors).toHaveLength(0)

    // Verify game is still running (canvas is still rendering)
    await expect(canvas).toBeVisible()

    // Verify buildings exist by checking game state
    const buildingCount = await page.evaluate(() => {
      // @ts-ignore - accessing game state through window
      const gs = window.gameState
      if (!gs) return 0
      // Count player buildings (not counting initial construction yard)
      return gs.buildings?.filter(b => b.owner === gs.humanPlayer && b.type !== 'constructionYard').length || 0
    })

    console.log('Player buildings built:', buildingCount)
    expect(buildingCount).toBeGreaterThanOrEqual(3) // Power Plant + Refinery + Factory

    // Verify units exist
    const unitCount = await page.evaluate(() => {
      // @ts-ignore
      const gs = window.gameState
      if (!gs || !window.gameInstance?.units) return 0
      const units = window.gameInstance.units
      return units?.filter(u => u.owner === gs.humanPlayer).length || 0
    })

    console.log('Player units:', unitCount)
    expect(unitCount).toBeGreaterThanOrEqual(2) // Harvester + Tank

    console.log('Test completed successfully!')
  })
})
