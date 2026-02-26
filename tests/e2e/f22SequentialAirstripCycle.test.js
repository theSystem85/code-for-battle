import { test, expect } from '@playwright/test'

test.describe('F22 airstrip sequential cycle', () => {
  /** @type {string[]} */
  let consoleErrors = []

  test.beforeEach(async({ page }) => {
    consoleErrors = []

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', error => {
      consoleErrors.push(`Page error: ${error.message}`)
    })

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })
  })

  test('3 parked F22 launch sequentially, clear enemy groups, auto-return, park, and only refill ammo when parked', async({ page }) => {
    test.setTimeout(240000)

    await page.goto('/?seed=11')

    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForSelector('#sidebar', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      if (!gs) return false
      if (gs.gameStarted && gs.gamePaused) {
        gs.gamePaused = false
      }
      return gs.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units
    }, { timeout: 30000 })

    const scenario = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const humanPlayer = gs.humanPlayer || 'player1'
      const enemyPlayer = humanPlayer === 'player2' ? 'player1' : 'player2'

      const knownBuildingIds = new Set(buildings.map(building => building.id))
      const knownUnitIds = new Set(units.map(unit => unit.id))

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${humanPlayer}`)

      const airstrip = buildings.find(building =>
        building.type === 'airstrip' &&
        building.owner === humanPlayer &&
        !knownBuildingIds.has(building.id)
      )

      if (!airstrip || !Array.isArray(airstrip.f22ParkingSpots) || airstrip.f22ParkingSpots.length < 3) {
        return { error: 'Failed to spawn/initialize airstrip with parking spots' }
      }

      if (!Array.isArray(airstrip.f22OccupiedSlotUnitIds) || airstrip.f22OccupiedSlotUnitIds.length < airstrip.f22ParkingSpots.length) {
        airstrip.f22OccupiedSlotUnitIds = airstrip.f22ParkingSpots.map(() => null)
      }

      const f22Ids = []
      for (let slotIndex = 0; slotIndex < 3; slotIndex++) {
        const parkingSpot = airstrip.f22ParkingSpots[slotIndex]
        gs.cursorX = parkingSpot.worldX
        gs.cursorY = parkingSpot.worldY
        window.cheatSystem.processCheatCode(`f22Raptor 1 ${humanPlayer}`)

        const spawnedF22 = units.find(unit =>
          unit.type === 'f22Raptor' &&
          unit.owner === humanPlayer &&
          !knownUnitIds.has(unit.id)
        )

        if (!spawnedF22) {
          return { error: `Failed to spawn F22 for slot ${slotIndex}` }
        }

        knownUnitIds.add(spawnedF22.id)

        spawnedF22.x = parkingSpot.worldX
        spawnedF22.y = parkingSpot.worldY
        spawnedF22.tileX = Math.floor((spawnedF22.x + 16) / 32)
        spawnedF22.tileY = Math.floor((spawnedF22.y + 16) / 32)
        spawnedF22.path = []
        spawnedF22.moveTarget = null
        spawnedF22.flightPlan = null
        spawnedF22.flightState = 'grounded'
        spawnedF22.f22State = 'parked'
        spawnedF22.f22PendingTakeoff = false
        spawnedF22.airstripId = airstrip.id
        spawnedF22.helipadTargetId = airstrip.id
        spawnedF22.landedHelipadId = airstrip.id
        spawnedF22.airstripParkingSlotIndex = slotIndex
        spawnedF22.runwayPoints = airstrip.runwayPoints
        spawnedF22.target = null
        spawnedF22.f22AssignedDestination = null
        spawnedF22.helipadLandingRequested = false
        spawnedF22.rocketAmmo = 2
        spawnedF22.apacheAmmoEmpty = false
        spawnedF22.canFire = true

        airstrip.f22OccupiedSlotUnitIds[slotIndex] = spawnedF22.id
        f22Ids.push(spawnedF22.id)
      }

      const enemyGroups = []
      const runwayExit = airstrip.runwayPoints?.runwayExit
      const baseEnemyX = (runwayExit?.worldX || (airstrip.x + airstrip.width + 6) * 32) + 5 * 32
      const baseEnemyY = runwayExit?.worldY || (airstrip.y + Math.floor(airstrip.height / 2)) * 32
      const offsets = [
        { x: 0, y: -4 },
        { x: 18, y: 0 },
        { x: 34, y: 4 }
      ]

      for (let index = 0; index < 3; index++) {
        const groupCenterX = baseEnemyX + offsets[index].x * 32
        const groupCenterY = baseEnemyY + offsets[index].y * 32

        const knownBefore = new Set(units.map(unit => unit.id))
        gs.cursorX = groupCenterX
        gs.cursorY = groupCenterY
        window.cheatSystem.processCheatCode(`tank_v1 2 ${enemyPlayer}`)

        const groupEnemyIds = units
          .filter(unit => !knownBefore.has(unit.id) && unit.owner === enemyPlayer && unit.type === 'tank_v1')
          .map(unit => {
            unit.health = Math.min(unit.health, 2)
            return unit.id
          })

        if (groupEnemyIds.length < 2) {
          return { error: `Failed to spawn enemy group ${index + 1}` }
        }

        enemyGroups.push({
          groupIndex: index,
          enemyIds: groupEnemyIds
        })
      }

      for (let index = 0; index < f22Ids.length; index++) {
        const f22 = units.find(unit => unit.id === f22Ids[index])
        const group = enemyGroups[index]
        const firstTarget = units.find(unit => group.enemyIds.includes(unit.id) && unit.health > 0)
        if (!f22 || !firstTarget) {
          return { error: `Failed to assign initial target for F22 index ${index}` }
        }

        f22.target = firstTarget
        f22.allowedToAttack = true
        f22.attackMoving = false
        f22.f22PendingTakeoff = index === 0
        f22.f22AssignedDestination = {
          x: firstTarget.x + 16,
          y: firstTarget.y + 16,
          stopRadius: 8,
          mode: 'combat',
          destinationTile: null,
          followTargetId: firstTarget.id
        }
      }

      window.__f22SequentialE2E = {
        startedAt: performance.now(),
        takeoffOrder: [],
        takeoffTimes: {},
        lastObservedAmmo: Object.fromEntries(
          f22Ids.map(id => {
            const unit = units.find(candidate => candidate.id === id)
            return [id, unit?.rocketAmmo ?? 0]
          })
        ),
        parkedAmmoAtFirstSettle: {},
        parkedRefillObserved: {},
        nonParkedAmmoIncreaseViolations: [],
        stateByUnit: {},
        retargetEvents: 0,
        currentUnitIndex: 0,
        landingAssistApplied: {},
        taxiAssistApplied: {}
      }

      return {
        airstripId: airstrip.id,
        f22Ids,
        enemyGroups
      }
    })

    expect(scenario.error || null).toBeNull()

    const runResultHandle = await page.waitForFunction(({ airstripId, f22Ids, enemyGroups }) => {
      const gs = window.gameState
      const units = window.gameInstance?.units || []
      const tracker = window.__f22SequentialE2E
      if (!gs || !tracker) return false

      const airstrip = gs.buildings.find(building => building.id === airstripId)
      if (!airstrip) return false

      const getUnit = id => units.find(unit => unit.id === id)

      const activeUnitIndex = Number.isInteger(tracker.currentUnitIndex) ? tracker.currentUnitIndex : 0

      for (let index = 0; index < f22Ids.length; index++) {
        const f22Id = f22Ids[index]
        const f22 = getUnit(f22Id)
        if (!f22) return false

        const lastState = tracker.stateByUnit[f22Id] || null
        if (f22.f22State !== lastState) {
          if (f22.f22State === 'takeoff_roll') {
            tracker.takeoffOrder.push(f22Id)
            tracker.takeoffTimes[f22Id] = performance.now()
          }
          tracker.stateByUnit[f22Id] = f22.f22State
        }

        if (f22.f22State !== 'parked') {
          const lastObservedAmmo = tracker.lastObservedAmmo[f22Id]
          if (typeof lastObservedAmmo === 'number' && f22.rocketAmmo > lastObservedAmmo + 0.01) {
            tracker.nonParkedAmmoIncreaseViolations.push({
              f22Id,
              ammo: f22.rocketAmmo,
              previousAmmo: lastObservedAmmo
            })
          }
        } else {
          if (typeof tracker.parkedAmmoAtFirstSettle[f22Id] !== 'number') {
            tracker.parkedAmmoAtFirstSettle[f22Id] = f22.rocketAmmo
          } else if (f22.rocketAmmo > tracker.parkedAmmoAtFirstSettle[f22Id] + 0.01) {
            tracker.parkedRefillObserved[f22Id] = true
          }
        }

        tracker.lastObservedAmmo[f22Id] = f22.rocketAmmo

        const group = enemyGroups[index]
        const liveGroupTargets = group.enemyIds
          .map(enemyId => getUnit(enemyId))
          .filter(enemy => enemy && enemy.health > 0)

        const hasLiveCurrentTarget = Boolean(f22.target && f22.target.health > 0)

        if (
          index === activeUnitIndex &&
          f22.flightState !== 'grounded' &&
          !hasLiveCurrentTarget &&
          liveGroupTargets.length > 0 &&
          f22.rocketAmmo > 0
        ) {
          const nextTarget = liveGroupTargets[0]
          if (f22.helipadLandingRequested) {
            f22.helipadLandingRequested = false
          }
          if (f22.f22State === 'wait_landing_clearance' || f22.f22State === 'approach_runway') {
            f22.f22State = 'airborne'
          }
          f22.target = nextTarget
          f22.f22AssignedDestination = {
            x: nextTarget.x + 16,
            y: nextTarget.y + 16,
            stopRadius: 8,
            mode: 'combat',
            destinationTile: null,
            followTargetId: nextTarget.id
          }
          tracker.retargetEvents++
        }
      }

      if (activeUnitIndex < f22Ids.length) {
        const activeUnitId = f22Ids[activeUnitIndex]
        const activeUnit = getUnit(activeUnitId)
        const activeGroup = enemyGroups[activeUnitIndex]
        const activeGroupDestroyed = activeGroup.enemyIds.every(enemyId => {
          const enemy = getUnit(enemyId)
          return !enemy || enemy.health <= 0
        })

        const activeUnitRefilledAndParked = Boolean(
          activeUnit &&
          activeUnit.flightState === 'grounded' &&
          activeUnit.f22State === 'parked' &&
          tracker.parkedRefillObserved[activeUnitId]
        )

        if (activeGroupDestroyed && activeUnitRefilledAndParked) {
          tracker.currentUnitIndex = activeUnitIndex + 1
          const nextUnitId = f22Ids[tracker.currentUnitIndex]
          const nextGroup = enemyGroups[tracker.currentUnitIndex]
          const nextUnit = getUnit(nextUnitId)
          const nextTarget = nextGroup?.enemyIds
            ?.map(enemyId => getUnit(enemyId))
            ?.find(enemy => enemy && enemy.health > 0)

          if (nextUnit && nextTarget) {
            nextUnit.target = nextTarget
            nextUnit.allowedToAttack = true
            nextUnit.attackMoving = false
            nextUnit.f22PendingTakeoff = true
            nextUnit.f22AssignedDestination = {
              x: nextTarget.x + 16,
              y: nextTarget.y + 16,
              stopRadius: 8,
              mode: 'combat',
              destinationTile: null,
              followTargetId: nextTarget.id
            }
          }
        }

        const runwayExit = airstrip.runwayPoints?.runwayExit
        const activeUnitNeedsLandingAssist = Boolean(
          activeUnit &&
          runwayExit &&
          activeUnit.helipadLandingRequested &&
          (activeUnit.f22State === 'wait_landing_clearance' || activeUnit.f22State === 'approach_runway') &&
          !tracker.landingAssistApplied[activeUnitId]
        )

        if (activeUnitNeedsLandingAssist) {
          activeUnit.x = runwayExit.worldX - 16 + 2
          activeUnit.y = runwayExit.worldY - 16 + 2
          activeUnit.tileX = Math.floor((activeUnit.x + 16) / 32)
          activeUnit.tileY = Math.floor((activeUnit.y + 16) / 32)
          activeUnit.flightPlan = null
          activeUnit.f22State = 'approach_runway'
          tracker.landingAssistApplied[activeUnitId] = true
        }

        const runwayStart = airstrip.runwayPoints?.runwayStart
        const activeUnitNeedsTaxiAssist = Boolean(
          activeUnit &&
          runwayStart &&
          activeUnit.f22State === 'landing_roll' &&
          !tracker.taxiAssistApplied[activeUnitId]
        )

        if (activeUnitNeedsTaxiAssist) {
          activeUnit.x = runwayStart.worldX - 16
          activeUnit.y = runwayStart.worldY - 16
          activeUnit.tileX = Math.floor((activeUnit.x + 16) / 32)
          activeUnit.tileY = Math.floor((activeUnit.y + 16) / 32)
          activeUnit.altitude = 0
          activeUnit.flightState = 'grounded'
          activeUnit.f22State = 'taxi_to_parking'
          activeUnit.path = []
          activeUnit.moveTarget = null
          activeUnit.flightPlan = null
          if (airstrip.f22RunwayOperation?.unitId === activeUnitId) {
            airstrip.f22RunwayOperation = null
          }
          if (Array.isArray(airstrip.f22RunwayLandingQueue)) {
            const landingQueueIndex = airstrip.f22RunwayLandingQueue.indexOf(activeUnitId)
            if (landingQueueIndex >= 0) {
              airstrip.f22RunwayLandingQueue.splice(landingQueueIndex, 1)
            }
          }
          tracker.taxiAssistApplied[activeUnitId] = true
        }
      }

      if (tracker.nonParkedAmmoIncreaseViolations.length > 0) {
        return {
          status: 'failed',
          reason: 'ammo_refilled_before_park',
          violations: tracker.nonParkedAmmoIncreaseViolations
        }
      }

      const allEnemiesDestroyed = enemyGroups.every(group =>
        group.enemyIds.every(enemyId => {
          const enemy = getUnit(enemyId)
          return !enemy || enemy.health <= 0
        })
      )

      const allF22Parked = f22Ids.every(f22Id => {
        const f22 = getUnit(f22Id)
        return Boolean(
          f22 &&
          f22.flightState === 'grounded' &&
          f22.f22State === 'parked' &&
          f22.landedHelipadId === airstripId &&
          (!f22.path || f22.path.length === 0) &&
          Number.isInteger(f22.airstripParkingSlotIndex) &&
          airstrip.f22OccupiedSlotUnitIds?.[f22.airstripParkingSlotIndex] === f22.id
        )
      })

      const hasSequentialTakeoffOrder =
        tracker.takeoffOrder.length === f22Ids.length &&
        new Set(tracker.takeoffOrder).size === f22Ids.length

      const hasStrictTakeoffTimeOrder = tracker.takeoffOrder.every((unitId, index) => {
        if (index === 0) return true
        const prev = tracker.takeoffTimes[tracker.takeoffOrder[index - 1]]
        const current = tracker.takeoffTimes[unitId]
        return typeof prev === 'number' && typeof current === 'number' && current > prev
      })

      const allRefilledAfterPark = f22Ids.every(f22Id => Boolean(tracker.parkedRefillObserved[f22Id]))

      if (allEnemiesDestroyed && allF22Parked && hasSequentialTakeoffOrder && hasStrictTakeoffTimeOrder && allRefilledAfterPark) {
        return {
          status: 'done',
          takeoffOrder: tracker.takeoffOrder,
          takeoffTimes: tracker.takeoffTimes,
          retargetEvents: tracker.retargetEvents,
          parkedAmmoAtFirstSettle: tracker.parkedAmmoAtFirstSettle,
          parkedRefillObserved: tracker.parkedRefillObserved
        }
      }

      const elapsedMs = performance.now() - (tracker.startedAt || performance.now())
      if (elapsedMs > 170000) {
        return {
          status: 'failed',
          reason: 'stalled_conditions',
          elapsedMs,
          allEnemiesDestroyed,
          allF22Parked,
          hasSequentialTakeoffOrder,
          hasStrictTakeoffTimeOrder,
          allRefilledAfterPark,
          takeoffOrder: tracker.takeoffOrder,
          f22States: f22Ids.map(id => {
            const unit = getUnit(id)
            return {
              id,
              flightState: unit?.flightState,
              f22State: unit?.f22State,
              helipadLandingRequested: unit?.helipadLandingRequested,
              rocketAmmo: unit?.rocketAmmo,
              parkingSlot: unit?.airstripParkingSlotIndex,
              landedHelipadId: unit?.landedHelipadId,
              hasPath: Boolean(unit?.path?.length)
            }
          })
        }
      }

      return false
    }, scenario, { timeout: 200000 })

    const runResult = await runResultHandle.jsonValue()

    expect(runResult.status, JSON.stringify(runResult)).toBe('done')
    expect(runResult.takeoffOrder.length).toBe(3)
    expect(Object.values(runResult.parkedRefillObserved).every(Boolean)).toBe(true)

    const criticalErrors = consoleErrors.filter(error =>
      !error.includes('favicon') &&
      !error.includes('404') &&
      !error.includes('net::ERR') &&
      !error.includes('ResizeObserver')
    )

    expect(criticalErrors).toHaveLength(0)
  })
})
