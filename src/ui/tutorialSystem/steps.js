import { gameState } from '../../gameState.js'
import { getUnitCommandsHandler, selectedUnits } from '../../inputHandler.js'
import { setRemoteControlAction } from '../../input/remoteControlState.js'
import {
  countPlayerBuildings,
  countPlayerUnits,
  ensureTutorialUnits,
  findEnemyTarget,
  findNearestOreTile,
  findPlayerBuilding,
  findPlayerUnit,
  focusCameraOnUnit,
  getCanvasPointForTile,
  getIsTouchLayout,
  getPlayerCrewSnapshot,
  getUnitTile,
  isHumanOwner,
  sleep
} from './helpers.js'
import { TUTORIAL_REMOTE_SOURCE } from './constants.js'

export function buildTutorialSteps() {
  return [
    {
      id: 'welcome',
      title: 'Welcome to the Command Briefing',
      text: {
        desktop: 'This guided tutorial will show you how to build, command units, and win. Watch the demo actions, then repeat them to continue.',
        mobile: 'This guided tutorial will show you how to build, command units, and win. Watch the demo actions, then repeat them to continue.'
      },
      hint: 'You can skip any step or the full tutorial at any time.',
      completion: () => true,
      demo: async() => {
        await sleep(300)
      }
    },
    {
      id: 'mobile-sidebar-gestures',
      mobileOnly: true,
      title: 'Master the Build Bar',
      text: {
        mobile: 'Swipe right from the left edge to extend the bottom build bar. Swipe left across the extended sidebar to return to the dense bar.'
      },
      hint: 'On any Build button, tap the upper half to add to its build stack. Tap the lower half to remove one.',
      visual: 'mobile-build-gestures',
      completion: () => true,
      demo: async() => {
        await sleep(1200)
      }
    },
    {
      id: 'resources',
      title: 'Resources & Power',
      text: {
        desktop: 'Money and energy are shown at the top of the sidebar. Low power slows production, so keep it positive.',
        mobile: 'Money and energy are shown in the status bar. Low power slows production, so keep it positive.'
      },
      hint: 'Click the money bar or energy bar to continue.',
      highlightSelector: getIsTouchLayout() ? '#mobileStatusBar' : '#moneyBarContainer',
      demo: async(ctx) => {
        const moneyTarget = document.getElementById(getIsTouchLayout() ? 'mobileMoneyDisplay' : 'moneyBarContainer')
        const energyTarget = document.getElementById(getIsTouchLayout() ? 'mobileEnergyBarContainer' : 'energyBarContainer')
        await ctx.moveCursorToElement(moneyTarget)
        await sleep(350)
        await ctx.moveCursorToElement(energyTarget)
      },
      completion: (ctx) => {
        if (ctx.lastAction === 'money' || ctx.lastAction === 'energy') {
          return true
        }
        return false
      }
    },
    {
      id: 'build-power',
      title: 'Build a Power Plant',
      text: {
        desktop: 'Open the Buildings tab and queue a Power Plant. Power is required for almost every structure.',
        mobile: 'Open the Buildings tab and queue a Power Plant. Power is required for almost every structure.'
      },
      hint: 'Click the Power Plant button to continue.',
      highlightSelector: '.production-button[data-building-type="powerPlant"]',
      demo: async(ctx) => {
        await ctx.demoBuildBuilding('powerPlant')
      },
      completion: (ctx) => ctx.lastAction === 'building:powerPlant' || countPlayerBuildings('powerPlant') > ctx.stepState.startPowerPlants
    },
    {
      id: 'build-refinery',
      title: 'Build an Ore Refinery',
      text: {
        desktop: 'Queue an Ore Refinery next. Refineries process harvested ore into money.',
        mobile: 'Queue an Ore Refinery next. Refineries process harvested ore into money.'
      },
      hint: 'Click the Ore Refinery button to continue.',
      highlightSelector: '.production-button[data-building-type="oreRefinery"]',
      demo: async(ctx) => {
        await ctx.demoBuildBuilding('oreRefinery')
      },
      completion: (ctx) => ctx.lastAction === 'building:oreRefinery' || countPlayerBuildings('oreRefinery') > ctx.stepState.startRefineries
    },
    {
      id: 'build-vehicle-factory',
      title: 'Build the Weapons Factory',
      text: {
        desktop: 'Queue the Vehicle Factory (your weapons factory). It produces tanks and all ground vehicles.',
        mobile: 'Queue the Vehicle Factory (your weapons factory). It produces tanks and all ground vehicles.'
      },
      hint: 'Click the Vehicle Factory button to continue.',
      highlightSelector: '.production-button[data-building-type="vehicleFactory"]',
      demo: async(ctx) => {
        await ctx.demoBuildBuilding('vehicleFactory')
      },
      completion: (ctx) => ctx.lastAction === 'building:vehicleFactory' || countPlayerBuildings('vehicleFactory') > ctx.stepState.startFactories
    },
    {
      id: 'build-harvester',
      title: 'Build Ore Transporters',
      text: {
        desktop: 'Queue a Harvester. Harvesters automatically drive to the nearest ore field, but you can also right-click a specific ore patch to direct them.',
        mobile: 'Queue a Harvester. Harvesters automatically drive to the nearest ore field, but you can also tap a specific ore patch to direct them.'
      },
      hint: 'Click the Harvester button to continue.',
      highlightSelector: '.production-button[data-unit-type="harvester"]',
      demo: async(ctx) => {
        await ctx.demoBuildUnit('harvester')
        const harvester = findPlayerUnit('harvester')
        const unitCommands = getUnitCommandsHandler()
        if (harvester && unitCommands) {
          await ctx.demoSelectUnit(harvester)
          const tile = getUnitTile(harvester)
          const oreTile = tile ? findNearestOreTile(tile) : null
          if (oreTile) {
            unitCommands.handleMovementCommand([harvester], oreTile.x * 32, oreTile.y * 32, gameState.mapGrid)
          }
        }
      },
      completion: (ctx) => ctx.lastAction === 'unit:harvester' || countPlayerUnits('harvester') > ctx.stepState.startHarvesters
    },
    {
      id: 'select-single',
      title: 'Select a Single Unit',
      text: {
        desktop: 'Click a unit to select it. Selection shows its status and enables commands.',
        mobile: 'Tap a unit to select it. Selection shows its status and enables commands.'
      },
      hint: 'Select any unit to continue.',
      demo: async(ctx) => {
        ensureTutorialUnits(1)
        const unit = (gameState.units || []).find(u => isHumanOwner(u.owner))
        if (unit) {
          await ctx.demoSelectUnit(unit)
        }
      },
      completion: () => selectedUnits.length > 0
    },
    {
      id: 'select-group',
      title: 'Select Multiple Units',
      text: {
        desktop: 'Drag a selection box to grab multiple units at once. You can also shift-click to add units.',
        mobile: 'Drag a selection box to grab multiple units at once. You can also tap units one-by-one to add them.'
      },
      hint: 'Select at least two units to continue.',
      demo: async(ctx) => {
        ensureTutorialUnits(2)
        const units = (gameState.units || []).filter(u => isHumanOwner(u.owner)).slice(0, 2)
        await ctx.demoSelectGroup(units)
      },
      completion: () => selectedUnits.length >= 2
    },
    {
      id: 'deselect',
      title: 'Deselect Units',
      text: {
        desktop: 'Right-click on empty ground or press Esc to clear your selection.',
        mobile: 'Tap on empty ground to clear your selection.'
      },
      hint: 'Clear the selection to continue.',
      demo: async(ctx) => {
        await ctx.demoDeselect()
      },
      completion: () => selectedUnits.length === 0
    },
    {
      id: 'move-units',
      title: 'Move Units',
      text: {
        desktop: 'Select a unit, then left-click on the map to move it.',
        mobile: 'Select a unit, then tap on the map to move it.'
      },
      hint: 'Move any selected unit to continue.',
      demo: async(ctx) => {
        ensureTutorialUnits(1)
        const unit = (gameState.units || []).find(u => isHumanOwner(u.owner))
        const unitCommands = getUnitCommandsHandler()
        if (unit && unitCommands) {
          await ctx.demoSelectUnit(unit)
          const tile = getUnitTile(unit)
          if (tile) {
            const target = { x: tile.x + 3, y: tile.y + 2 }
            unitCommands.handleMovementCommand([unit], target.x * 32, target.y * 32, gameState.mapGrid)
            await ctx.clickCanvasTile(target)
          }
        }
      },
      completion: (ctx) => {
        return selectedUnits.some(unit => {
          const previous = ctx.stepState.moveTargets.get(unit.id)
          const current = unit.moveTarget
          if (!current) return false
          if (!previous) return true
          return current.x !== previous.x || current.y !== previous.y
        })
      }
    },
    {
      id: 'tank-rally',
      title: 'Build a Tank & Set Waypoint',
      text: {
        desktop: 'Queue a Tank, then select the Vehicle Factory and left-click on the map to set a rally point.',
        mobile: 'Queue a Tank, then tap the Vehicle Factory and tap the map to set a rally point.'
      },
      hint: 'Queue a Tank or set a rally point to continue.',
      demo: async(ctx) => {
        const factory = findPlayerBuilding('vehicleFactory')
        if (factory) {
          await ctx.clickCanvasTile({ x: factory.x + 1, y: factory.y + 1 })
          await ctx.clickCanvasTile({ x: factory.x + 4, y: factory.y + 1 })
        }
        await ctx.demoBuildUnit('tank')
      },
      completion: (ctx) => {
        const factory = findPlayerBuilding('vehicleFactory')
        const rallyPoint = factory?.rallyPoint
        const rallyChanged = rallyPoint && (!ctx.stepState.startRallyPoint || rallyPoint.x !== ctx.stepState.startRallyPoint.x || rallyPoint.y !== ctx.stepState.startRallyPoint.y)
        return ctx.lastAction === 'unit:tank' || rallyChanged || countPlayerUnits('tank') > ctx.stepState.startTanks
      }
    },
    {
      id: 'tank-control',
      title: 'Command & Remote Control Tanks',
      text: {
        desktop: 'When the tank finishes, left-click to move it, or hold the arrow keys (and Space to fire) for remote control driving.',
        mobile: 'When the tank finishes, tap to move it, or use the on-screen joystick to drive it manually.'
      },
      hint: 'Move a tank and use manual control to continue.',
      demo: async(ctx) => {
        ensureTutorialUnits(1, 'tank')
        const tank = findPlayerUnit('tank')
        const unitCommands = getUnitCommandsHandler()
        if (tank && unitCommands) {
          await ctx.demoSelectUnit(tank)
          const tile = getUnitTile(tank)
          if (tile) {
            const target = { x: tile.x + 4, y: tile.y + 1 }
            unitCommands.handleMovementCommand([tank], target.x * 32, target.y * 32, gameState.mapGrid)
            await ctx.clickCanvasTile(target)
          }
          setRemoteControlAction('forward', TUTORIAL_REMOTE_SOURCE, true)
          await sleep(600)
          setRemoteControlAction('forward', TUTORIAL_REMOTE_SOURCE, false)
          ctx.stepState.remoteControlDone = true
        }
      },
      completion: (ctx) => {
        const units = (gameState.units || []).filter(unit => isHumanOwner(unit.owner))
        return ctx.stepState.remoteControlDone || units.some(unit => unit.hasUsedRemoteControl)
      }
    },
    {
      id: 'attack',
      title: 'Attack & Win the Battle',
      text: {
        desktop: 'Select your tank and right-click an enemy building to attack. The goal is to destroy all enemy buildings.',
        mobile: 'Select your tank and tap an enemy building to attack. The goal is to destroy all enemy buildings.'
      },
      hint: 'Order any unit to attack to continue.',
      demo: async(ctx) => {
        const tank = findPlayerUnit('tank')
        const target = findEnemyTarget()
        const unitCommands = getUnitCommandsHandler()
        if (tank && target && unitCommands) {
          await ctx.demoSelectUnit(tank)
          unitCommands.handleAttackCommand([tank], target, gameState.mapGrid)
        }
      },
      completion: () => selectedUnits.some(unit => unit.target)
        || selectedUnits.some(unit => unit.remoteFireCommandActive)
        || (gameState.remoteControl?.fire || 0) > 0
    },
    {
      id: 'crew-system',
      title: 'Crew, Hospitals, and Ambulances',
      text: {
        desktop: 'Each tank has a four-person crew with HUD markers: D (Driver, blue) moves the tank, C (Commander, green) enables player control, G (Gunner, red) rotates the turret, and L (Loader, orange) lets the tank fire. When all crew are gone, the markers disappear. Build a Hospital from the Buildings tab and an Ambulance from the Units tab. Hospitals restore missing crew when tanks park on the three tiles below the hospital (cost per medic). Ambulances are selected and sent to a unit with missing crew to refill it in the field.',
        mobile: 'Each tank has a four-person crew with HUD markers: D (Driver, blue) moves the tank, C (Commander, green) enables player control, G (Gunner, red) rotates the turret, and L (Loader, orange) lets the tank fire. When all crew are gone, the markers disappear. Build a Hospital from the Buildings tab and an Ambulance from the Units tab. Hospitals restore missing crew when tanks park on the three tiles below the hospital (cost per medic). Ambulances are selected and sent to a unit with missing crew to refill it in the field.'
      },
      hint: 'Restore every crew marker on the empty tank to continue.',
      highlightSelector: '.production-button[data-building-type="hospital"]',
      progressLabel: 'Crew recovery progress',
      progress: (ctx) => {
        const hospitalBuilt = countPlayerBuildings('hospital') > 0 || ctx.lastAction === 'building:hospital'
        const ambulanceBuilt = countPlayerUnits('ambulance') > 0 || ctx.lastAction === 'unit:ambulance'
        const crewRestored = ctx.trackCrewRestoration()
        if (crewRestored) return 1
        if (ambulanceBuilt) return 2 / 3
        if (hospitalBuilt) return 1 / 3
        return 0
      },
      completion: (ctx) => {
        const hospitalBuilt = countPlayerBuildings('hospital') > 0 || ctx.lastAction === 'building:hospital'
        const ambulanceBuilt = countPlayerUnits('ambulance') > 0 || ctx.lastAction === 'unit:ambulance'
        const crewRestored = ctx.trackCrewRestoration()
        return hospitalBuilt && ambulanceBuilt && crewRestored
      },
      demo: async(ctx) => {
        ensureTutorialUnits(1, 'tank')
        const tank = findPlayerUnit('tank')
        if (tank?.crew) {
          ctx.stepState.crewTankId = tank.id
          focusCameraOnUnit(tank)
          const tankTile = getUnitTile(tank)
          if (tankTile) {
            const point = getCanvasPointForTile(tankTile.x, tankTile.y)
            if (point) {
              ctx.moveCursorToPoint(point)
              await sleep(200)
            }
            await ctx.clickCanvasTile(tankTile)
          } else {
            await ctx.demoSelectUnit(tank)
          }
          await sleep(350)
          if (window.cheatSystem?.processCheatCode) {
            const roles = ['driver', 'commander', 'gunner', 'loader']
            roles.forEach(role => {
              if (tank.crew?.[role]) {
                window.cheatSystem.processCheatCode(role)
              }
            })
          }
          ctx.stepState.crewSnapshot = getPlayerCrewSnapshot()
          await sleep(600)
        }

        const buildingTab = document.querySelector('.tab-button[data-tab="buildings"]')
        if (buildingTab) {
          await ctx.clickElement(buildingTab)
        }
        const hospitalButton = document.querySelector('.production-button[data-building-type="hospital"]')
        await ctx.moveCursorToElement(hospitalButton)
        await sleep(300)

        const unitTab = document.querySelector('.tab-button[data-tab="units"]')
        if (unitTab) {
          await ctx.clickElement(unitTab)
        }
        const ambulanceButton = document.querySelector('.production-button[data-unit-type="ambulance"]')
        await ctx.moveCursorToElement(ambulanceButton)
      }
    },
    {
      id: 'tech-tree',
      title: 'Unlocking the Tech Tree',
      text: {
        desktop: 'New buildings unlock more tech: Power Plants keep everything online, Refineries enable Harvesters, Vehicle Factories unlock tanks. Gas Stations unlock Tankers for refueling. Hospitals unlock Ambulances that carry crew and restore medics. Ammunition Factories unlock Ammunition Trucks; ammo levels show as orange bars above units and in their HUD. Workshops unlock Recovery Tanks to tow wrecks and repair vehicles.',
        mobile: 'New buildings unlock more tech: Power Plants keep everything online, Refineries enable Harvesters, Vehicle Factories unlock tanks. Gas Stations unlock Tankers for refueling. Hospitals unlock Ambulances that carry crew and restore medics. Ammunition Factories unlock Ammunition Trucks; ammo levels show as orange bars above units. Workshops unlock Recovery Tanks to tow wrecks and repair vehicles.'
      },
      hint: 'That concludes the tutorial. You can restart it from Settings anytime.',
      completion: () => true,
      demo: async() => {
        await sleep(350)
      }
    }
  ]
}
