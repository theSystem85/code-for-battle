import { HELIPAD_FUEL_CAPACITY, HELIPAD_RELOAD_TIME, TILE_SIZE, TANKER_SUPPLY_CAPACITY, HELIPAD_AMMO_RESERVE, AMMO_TRUCK_RANGE, AMMO_RESUPPLY_TIME, AMMO_TRUCK_CARGO } from '../config.js'
import { logPerformance } from '../performanceUtils.js'
import { getBuildingIdentifier } from '../utils.js'
import { getHelipadLandingCenter, isHelipadAvailableForUnit } from '../utils/helipadUtils.js'

function clearHelipadClaimForUnit(unit, helipadId, helipads = []) {
  if (!unit) return
  if (unit.landedHelipadId) {
    const linked = helipads.find(pad => getBuildingIdentifier(pad) === unit.landedHelipadId)
    if (linked && linked.landedUnitId === unit.id) {
      linked.landedUnitId = null
    }
  }
  if (unit.landedHelipadId === helipadId) {
    unit.landedHelipadId = null
  }
}


/**
 * Check if a unit is adjacent to any tile of a building
 * @param {Object} unit - Unit with x/y (pixel coords)
 * @param {Object} building - Building with x/y (tile coords), width, height
 * @param {number} range - Range in tiles
 * @returns {boolean} True if unit is within range of any building tile
 */
function isUnitAdjacentToBuilding(unit, building, range) {
  const unitTileX = Math.floor(unit.x / TILE_SIZE)
  const unitTileY = Math.floor(unit.y / TILE_SIZE)
  const buildingWidth = building.width || 1
  const buildingHeight = building.height || 1

  // Check if unit is within range of any tile occupied by the building
  for (let bx = building.x; bx < building.x + buildingWidth; bx++) {
    for (let by = building.y; by < building.y + buildingHeight; by++) {
      const distance = Math.hypot(unitTileX - bx, unitTileY - by)
      if (distance <= range) {
        return true
      }
    }
  }
  return false
}

export const updateHelipadLogic = logPerformance(function(units, buildings, _gameState, delta) {
  if (!Array.isArray(buildings) || buildings.length === 0) return

  const helipads = buildings.filter(b => (b.type === 'helipad' || b.type === 'airstrip') && b.health > 0)
  if (helipads.length === 0) return

  helipads.forEach(helipad => {
    const helipadId = getBuildingIdentifier(helipad)
    if (typeof helipad.maxFuel !== 'number' || helipad.maxFuel <= 0) {
      helipad.maxFuel = HELIPAD_FUEL_CAPACITY
    }

    if (typeof helipad.fuel !== 'number') {
      helipad.fuel = helipad.maxFuel
    }

    if (typeof helipad.maxAmmo !== 'number' || helipad.maxAmmo <= 0 || helipad.maxAmmo > HELIPAD_AMMO_RESERVE) {
      helipad.maxAmmo = HELIPAD_AMMO_RESERVE
    }

    if (typeof helipad.ammo !== 'number') {
      helipad.ammo = helipad.maxAmmo
    } else if (helipad.ammo > helipad.maxAmmo) {
      helipad.ammo = helipad.maxAmmo
    }

    const capacity = helipad.maxFuel
    if (capacity <= 0) return

    const reloadTime = typeof helipad.fuelReloadTime === 'number' && helipad.fuelReloadTime > 0
      ? helipad.fuelReloadTime
      : HELIPAD_RELOAD_TIME

    if (helipad.fuel < capacity) {
      const effectiveReloadTime = Math.max(reloadTime, 1)
      const rate = capacity / effectiveReloadTime
      helipad.fuel = Math.min(capacity, helipad.fuel + rate * delta)
    }

    helipad.needsFuel = helipad.fuel < capacity * 0.25

    // Get helipad center coordinates for ammo logic
    const landingCenter = getHelipadLandingCenter(helipad)
    if (!landingCenter) {
      return
    }
    const helipadCenterX = landingCenter.x
    const helipadCenterY = landingCenter.y

    // Ammo reloading logic - only when ammo trucks are nearby
    const ammoCapacity = helipad.maxAmmo

    if (helipad.ammo < ammoCapacity) {
      // Check for nearby ammo trucks
      const ammoTrucks = units.filter(u => u.type === 'ammunitionTruck' && u.health > 0 && typeof u.ammoCargo === 'number' && u.ammoCargo > 0)
      let ammoRefilled = false

      ammoTrucks.forEach(ammoTruck => {
        // Check if truck is adjacent to any tile of the helipad
        const isAdjacent = isUnitAdjacentToBuilding(ammoTruck, helipad, AMMO_TRUCK_RANGE)
        if (isAdjacent && helipad.ammo < ammoCapacity) {
          const refillRate = Math.max(1, ammoTruck.maxAmmoCargo || AMMO_TRUCK_CARGO) / AMMO_RESUPPLY_TIME
          const transfer = Math.min(refillRate * delta, ammoCapacity - helipad.ammo, ammoTruck.ammoCargo)
          if (transfer > 0) {
            helipad.ammo = Math.min(ammoCapacity, helipad.ammo + transfer)
            ammoTruck.ammoCargo = Math.max(0, ammoTruck.ammoCargo - transfer)
            ammoRefilled = true
          }
        }
      })

      // If no ammo trucks nearby and ammo is below capacity, do not refill automatically
      if (!ammoRefilled) {
        // Ammo stays at current level until ammo truck arrives
      }
    }

    helipad.needsAmmo = helipad.ammo < ammoCapacity * 0.25

    if (Array.isArray(units)) {

      const apacheUnits = units.filter(u => u.type === 'apache' && u.health > 0)
      const f22Units = units.filter(u => u.type === 'f22Raptor' && u.health > 0)
      if (helipad.type === 'helipad') {
        if (helipad.landedUnitId) {
          const occupant = apacheUnits.find(u => u.id === helipad.landedUnitId)
          if (!occupant || occupant.landedHelipadId !== helipadId || occupant.flightState !== 'grounded') {
            helipad.landedUnitId = null
          }
        }
        apacheUnits.forEach(heli => {
          const heliCenterX = heli.x + TILE_SIZE / 2
          const heliCenterY = heli.y + TILE_SIZE / 2
          const distance = Math.hypot(heliCenterX - helipadCenterX, heliCenterY - helipadCenterY)
          const landingRadius = TILE_SIZE * 1.45

          if (heli.flightState !== 'grounded' && heli.landedHelipadId === helipadId) {
            heli.landedHelipadId = null
          }
          if (heli.flightState !== 'grounded' && helipad.landedUnitId === heli.id) {
            helipad.landedUnitId = null
          }

          const landingCommanded = heli.helipadLandingRequested && (!heli.helipadTargetId || heli.helipadTargetId === helipadId)
          const landingLinked = heli.landedHelipadId === helipadId || helipad.landedUnitId === heli.id
          const landingRequested = landingCommanded || landingLinked

          if (distance <= landingRadius) {
            if (landingRequested) {
              if (!isHelipadAvailableForUnit(helipad, units, heli.id)) {
                return
              }

              const landingX = helipadCenterX - TILE_SIZE / 2
              const landingY = helipadCenterY - TILE_SIZE / 2

              // Only update position and flight state if not already grounded and stable
              const isAlreadyGroundedHere = heli.flightState === 'grounded' &&
                                          heli.landedHelipadId === helipadId &&
                                          Math.abs(heli.x - landingX) < 1 &&
                                          Math.abs(heli.y - landingY) < 1

              if (!isAlreadyGroundedHere) {
                heli.x = landingX
                heli.y = landingY
                heli.tileX = Math.floor(heli.x / TILE_SIZE)
                heli.tileY = Math.floor(heli.y / TILE_SIZE)
              }

              // Clear movement commands when grounded
              // This prevents the helicopter from jittering as the movement system
              // won't interpret these as commands to take off
              if (heli.flightState === 'grounded') {
                heli.moveTarget = null
                heli.path = []
                heli.flightPlan = null
              } else {
              // Only set these when actively landing
                heli.moveTarget = { x: heli.tileX, y: heli.tileY }
                heli.path = []
                heli.flightPlan = {
                  x: helipadCenterX,
                  y: helipadCenterY,
                  stopRadius: Math.max(6, TILE_SIZE * 0.2),
                  mode: 'helipad',
                  followTargetId: null,
                  destinationTile: { x: heli.tileX, y: heli.tileY }
                }
              }

              if (heli.flightState !== 'grounded') {
                heli.autoHoldAltitude = false
                heli.manualFlightState = 'land'
              }
              heli.manualFlightHoverRequested = false

              heli.helipadTargetId = helipadId
              heli.landedHelipadId = helipadId
              helipad.landedUnitId = heli.id

              if (typeof heli.maxRocketAmmo === 'number' && heli.rocketAmmo < heli.maxRocketAmmo) {
                if (helipad.ammo > 0) {
                  const ammoNeeded = heli.maxRocketAmmo - heli.rocketAmmo
                  const ammoRefillTime = 10000
                  const ammoRefillRate = heli.maxRocketAmmo / ammoRefillTime
                  const ammoToTransfer = Math.min(ammoRefillRate * delta, ammoNeeded, helipad.ammo)
                  if (ammoToTransfer > 0) {
                    heli.rocketAmmo += ammoToTransfer
                    helipad.ammo -= ammoToTransfer
                  }
                  if (heli.rocketAmmo > 0) {
                    heli.apacheAmmoEmpty = false
                  }
                }
              }

              if (typeof heli.maxGas === 'number' && heli.gas < heli.maxGas && helipad.fuel > 0) {
                const refuelRate = heli.maxGas / 4000
                const transfer = Math.min(refuelRate * delta, heli.maxGas - heli.gas, helipad.fuel)
                if (transfer > 0) {
                  heli.gas = Math.min(heli.maxGas, heli.gas + transfer)
                  helipad.fuel = Math.max(0, helipad.fuel - transfer)
                  heli.refuelingAtHelipad = true
                } else {
                  heli.refuelingAtHelipad = false
                }
              } else {
                heli.refuelingAtHelipad = false
              }

              const hasAmmoCapacity = typeof heli.maxRocketAmmo === 'number' && heli.maxRocketAmmo > 0
              const ammoFull = !hasAmmoCapacity || heli.rocketAmmo >= heli.maxRocketAmmo
              const hasStoredAttackTarget = Boolean(heli.autoHelipadReturnAttackTargetId)
              const shouldAutoTakeoff = heli.autoHelipadReturnActive && ammoFull && hasStoredAttackTarget

              if (shouldAutoTakeoff) {
                heli.helipadLandingRequested = false
                heli.autoHoldAltitude = true
                heli.manualFlightState = 'takeoff'
                heli.canFire = true
                heli.autoHelipadReturnActive = false
                heli.autoHelipadReturnTargetId = null
                helipad.landedUnitId = null
                heli.landedHelipadId = null
              } else {
                if (heli.autoHelipadReturnActive) {
                  heli.canFire = false
                  if (!hasStoredAttackTarget) {
                    heli.autoHelipadReturnActive = false
                    heli.autoHelipadReturnTargetId = null
                  }
                } else {
                  heli.canFire = ammoFull && heli.flightState === 'grounded'
                  heli.autoHelipadReturnTargetId = null
                }
              }
              heli.autoHelipadRetryAt = 0
              heli.noHelipadNotificationTime = 0
            }
          } else {
            if (heli.refuelingAtHelipad) {
              heli.refuelingAtHelipad = false
            }
            if (heli.landedHelipadId === helipadId) {
              clearHelipadClaimForUnit(heli, helipadId, helipads)
            }
            if (helipad.landedUnitId === heli.id) {
              helipad.landedUnitId = null
            }
          }
        })
      } // end if helipad.type === 'helipad'

      // Handle F22 Raptor units landing/refueling at Airstrip
      if (helipad.type === 'airstrip') {
        if (helipad.landedUnitId) {
          const occupant = f22Units.find(u => u.id === helipad.landedUnitId)
          if (!occupant || occupant.landedHelipadId !== helipadId || occupant.flightState !== 'grounded') {
            helipad.landedUnitId = null
          }
        }
        f22Units.forEach(jet => {
          const jetCenterX = jet.x + TILE_SIZE / 2
          const jetCenterY = jet.y + TILE_SIZE / 2
          const distance = Math.hypot(jetCenterX - helipadCenterX, jetCenterY - helipadCenterY)
          // Airstrip is large (12x6) so use a wider landing radius
          const landingRadius = TILE_SIZE * 3

          if (jet.flightState !== 'grounded' && jet.landedHelipadId === helipadId) {
            jet.landedHelipadId = null
          }
          if (jet.flightState !== 'grounded' && helipad.landedUnitId === jet.id) {
            helipad.landedUnitId = null
          }

          const landingCommanded = jet.helipadLandingRequested && (!jet.helipadTargetId || jet.helipadTargetId === helipadId)
          const landingLinked = jet.landedHelipadId === helipadId || helipad.landedUnitId === jet.id
          const landingRequested = landingCommanded || landingLinked

          if (distance <= landingRadius) {
            if (landingRequested) {
              const landingX = helipadCenterX - TILE_SIZE / 2
              const landingY = helipadCenterY - TILE_SIZE / 2

              const isAlreadyGroundedHere = jet.flightState === 'grounded' &&
                jet.landedHelipadId === helipadId &&
                Math.abs(jet.x - landingX) < 2 &&
                Math.abs(jet.y - landingY) < 2

              if (!isAlreadyGroundedHere) {
                jet.x = landingX
                jet.y = landingY
                jet.tileX = Math.floor(jet.x / TILE_SIZE)
                jet.tileY = Math.floor(jet.y / TILE_SIZE)
              }

              if (jet.flightState === 'grounded') {
                jet.moveTarget = null
                jet.path = []
                jet.flightPlan = null
              } else {
                jet.moveTarget = { x: jet.tileX, y: jet.tileY }
                jet.path = []
                jet.flightPlan = {
                  x: helipadCenterX,
                  y: helipadCenterY,
                  stopRadius: Math.max(6, TILE_SIZE * 0.5),
                  mode: 'helipad',
                  followTargetId: null,
                  destinationTile: { x: jet.tileX, y: jet.tileY }
                }
              }

              if (jet.flightState !== 'grounded') {
                jet.autoHoldAltitude = false
                jet.manualFlightState = 'land'
              }

              jet.helipadTargetId = helipadId
              jet.landedHelipadId = helipadId
              helipad.landedUnitId = jet.id

              if (typeof jet.maxRocketAmmo === 'number' && jet.rocketAmmo < jet.maxRocketAmmo) {
                if (helipad.ammo > 0) {
                  const ammoNeeded = jet.maxRocketAmmo - jet.rocketAmmo
                  const ammoRefillTime = 8000
                  const ammoRefillRate = jet.maxRocketAmmo / ammoRefillTime
                  const ammoToTransfer = Math.min(ammoRefillRate * delta, ammoNeeded, helipad.ammo)
                  if (ammoToTransfer > 0) {
                    jet.rocketAmmo += ammoToTransfer
                    helipad.ammo -= ammoToTransfer
                  }
                  if (jet.rocketAmmo > 0) {
                    jet.apacheAmmoEmpty = false
                  }
                }
              }

              if (typeof jet.maxGas === 'number' && jet.gas < jet.maxGas && helipad.fuel > 0) {
                const refuelRate = jet.maxGas / 3500
                const transfer = Math.min(refuelRate * delta, jet.maxGas - jet.gas, helipad.fuel)
                if (transfer > 0) {
                  jet.gas = Math.min(jet.maxGas, jet.gas + transfer)
                  helipad.fuel = Math.max(0, helipad.fuel - transfer)
                  jet.refuelingAtHelipad = true
                } else {
                  jet.refuelingAtHelipad = false
                }
              } else {
                jet.refuelingAtHelipad = false
              }

              const hasAmmoCapacity = typeof jet.maxRocketAmmo === 'number' && jet.maxRocketAmmo > 0
              const ammoFull = !hasAmmoCapacity || jet.rocketAmmo >= jet.maxRocketAmmo
              jet.canFire = ammoFull && jet.flightState === 'grounded'
            }
          } else {
            if (jet.refuelingAtHelipad) {
              jet.refuelingAtHelipad = false
            }
            if (jet.landedHelipadId === helipadId) {
              clearHelipadClaimForUnit(jet, helipadId, helipads)
            }
            if (helipad.landedUnitId === jet.id) {
              helipad.landedUnitId = null
            }
          }
        })
      } // end if helipad.type === 'airstrip'

      const tankers = units.filter(u => u.type === 'tankerTruck' && u.health > 0 && typeof u.supplyGas === 'number' && u.supplyGas > 0)
      tankers.forEach(tanker => {
        const tankerCenterX = tanker.x + TILE_SIZE / 2
        const tankerCenterY = tanker.y + TILE_SIZE / 2
        const distance = Math.hypot(tankerCenterX - helipadCenterX, tankerCenterY - helipadCenterY)
        if (distance <= TILE_SIZE * 2 && helipad.fuel < capacity) {
          const refillRate = Math.max(1, tanker.maxSupplyGas || TANKER_SUPPLY_CAPACITY) / 6000
          const transfer = Math.min(refillRate * delta, capacity - helipad.fuel, tanker.supplyGas)
          if (transfer > 0) {
            helipad.fuel = Math.min(capacity, helipad.fuel + transfer)
            tanker.supplyGas = Math.max(0, tanker.supplyGas - transfer)
          }
        }
      })
    }
  })
})
