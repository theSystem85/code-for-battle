import { gameState } from '../../gameState.js'
import { selectedUnits } from '../../inputHandler.js'
import {
  countPlayerBuildings, countPlayerUnits, findEnemyTarget, findPlayerBuilding,
  findPlayerUnit, getIsTouchLayout, isHumanOwner
} from './helpers.js'

const buildingStep = (id, type, title, text, baseline, drag = false) => ({
  id, title, text,
  hint: drag ? 'Drag the Ore Refinery button onto clear ground and release to place its blueprint.' : 'Use the build button, then choose a clear spot on the map. Wait for construction to finish.',
  highlightSelector: `.production-button[data-building-type="${type}"]`,
  buildType: type,
  additionalGuidance: 'Click the already-open Buildings tab to place all ready buildings; both options can be changed in Settings.',
  demo: ctx => ctx.guideBuilding(type, { drag }),
  completion: ctx => countPlayerBuildings(type) > ctx.stepState[baseline]
})

export function buildTutorialSteps() {
  return [
    {
      id: 'input-method', title: 'Choose your controls',
      text: 'How would you like to play? Choose an input method to see its controls, then continue to the original tutorial.',
      hint: 'This saves your preferred guidance. All input devices remain available.',
      interactive: true, completion: ctx => Boolean(ctx.settings.preferredInputMethod)
    },
    {
      id: 'welcome', title: 'Welcome to the Command Briefing',
      text: 'This guided tutorial will show you how to build, command units, and win. An Advanced Tutorial near the end covers chain-planning several buildings at once. Follow the green cursor and perform each action yourself. The next step begins when your task and the narration are both finished.',
      hint: 'Skip step performs the task for you and starts the next briefing immediately.',
      completion: () => true
    },
    {
      id: 'mobile-sidebar-gestures', mobileOnly: true, title: 'Master the Build Bar',
      text: { mobile: 'Swipe right from the left edge to extend the bottom build bar. Swipe left across the extended sidebar to return to the dense bar.' },
      hint: 'On any Build button, tap the upper half to add to its build stack. Tap the lower half to remove one.',
      visual: 'mobile-build-gestures', completion: () => true
    },
    {
      id: 'resources', title: 'Resources & Power',
      text: { desktop: 'Money and energy are shown at the top of the sidebar. Low power slows production, so keep it positive.', mobile: 'Money and energy are shown in the status bar. Low power slows production, so keep it positive.' },
      hint: 'Click the money bar or energy bar to continue.',
      highlightSelector: getIsTouchLayout() ? '#mobileStatusBar' : '#moneyBarContainer',
      demo: ctx => ctx.guideElement(document.getElementById(getIsTouchLayout() ? 'mobileMoneyDisplay' : 'moneyBarContainer')),
      completion: ctx => ctx.lastAction === 'money' || ctx.lastAction === 'energy'
    },
    buildingStep('build-power', 'powerPlant', 'Build a Power Plant',
      'Open the Buildings tab and build a Power Plant. Power is required for almost every structure. Click its button yourself, then click clear ground to place it.', 'startPowerPlants'),
    buildingStep('build-refinery', 'oreRefinery', 'Build an Ore Refinery',
      'Build an Ore Refinery next. Refineries process harvested ore into money. Try the alternative method: hold the build button, drag it onto the map, and release to place its blueprint directly.', 'startRefineries', true),
    buildingStep('build-vehicle-factory', 'vehicleFactory', 'Build the Weapons Factory',
      'Build the Vehicle Factory, your weapons factory. It produces tanks and all ground vehicles. Place it on clear ground and wait for construction.', 'startFactories'),
    {
      id: 'build-harvester', title: 'Build Ore Transporters',
      text: 'Build a Harvester. Every build button has two zones: the upper half adds one to the build stack; the lower half removes one. Harvesters automatically collect ore and deliver it to a refinery for money.',
      hint: 'Use the upper half to queue a Harvester and wait for it to leave the factory.',
      unitType: 'harvester', highlightSelector: '.production-button[data-unit-type="harvester"]',
      demo: ctx => ctx.guideUnitBuild('harvester'),
      completion: ctx => countPlayerUnits('harvester') > ctx.stepState.startHarvesters
    },
    {
      id: 'select-single', title: 'Select a Single Unit',
      text: { desktop: 'Click a unit to select it. Selection shows its status and enables commands.', mobile: 'Tap a unit to select it. Selection shows its status and enables commands.' },
      hint: 'Select any unit to continue.',
      demo: ctx => ctx.guideUnit(findPlayerUnit('harvester')),
      completion: () => selectedUnits.some(unit => !unit.isBuilding)
    },
    {
      id: 'select-group', title: 'Select Multiple Units',
      text: { desktop: 'Drag a selection box around multiple units. Hold Shift while dragging to add more units to your existing selection.', mobile: 'Drag a selection box around multiple units. Tap units one by one to add them.' },
      hint: 'Build another Harvester if needed, then select at least two units to continue.',
      demo: ctx => ctx.guideSelection(),
      completion: () => selectedUnits.filter(unit => !unit.isBuilding).length >= 2
    },
    {
      id: 'deselect', title: 'Deselect Units',
      text: { desktop: 'Right-click on empty ground or press Esc to clear your selection.', mobile: 'Tap with two fingers without dragging to clear your selection.' },
      hint: 'Clear the selection to continue.', demo: ctx => ctx.guideDeselect(),
      completion: () => selectedUnits.length === 0
    },
    {
      id: 'move-units', title: 'Move Units',
      text: { desktop: 'Select a unit, then left-click on the map to move it.', mobile: 'Select a unit, then tap on the map to move it.' },
      hint: 'Move any selected unit to continue.', demo: ctx => ctx.guideMove(),
      completion: ctx => ctx.hasNewMoveOrder()
    },
    {
      id: 'tank-rally', title: 'Build a Tank & Set Waypoint',
      text: { desktop: 'Queue a Tank, then select the Vehicle Factory and left-click on the map to set a rally point.', mobile: 'Queue a Tank, then tap the Vehicle Factory and tap the map to set a rally point.' },
      hint: 'Build a Tank and set a rally point to continue.', unitType: 'tank',
      demo: ctx => ctx.guideTankRally(),
      completion: ctx => {
        const rally = findPlayerBuilding('vehicleFactory')?.rallyPoint
        return countPlayerUnits('tank') > ctx.stepState.startTanks && Boolean(rally && (!ctx.stepState.startRallyPoint || rally.x !== ctx.stepState.startRallyPoint.x || rally.y !== ctx.stepState.startRallyPoint.y))
      }
    },
    {
      id: 'tank-control', additionalGuidance: 'Click the active Units tab to focus produced units from newest to oldest.', title: 'Command & Remote Control Tanks',
      text: { desktop: 'Select a tank and order it to move. Use the Arrow keys to remote control it and Space to fire.', mobile: 'Select a tank and order it to move. Use the on-screen joystick and fire controls to drive it manually.' },
      hint: 'Move a tank and use manual control to continue.', demo: ctx => ctx.guideMove('tank'),
      completion: ctx => ctx.stepState.tankMoved && (gameState.units || []).some(unit => isHumanOwner(unit.owner) && unit.type?.startsWith('tank') && unit.hasUsedRemoteControl)
    },
    {
      id: 'attack', title: 'Attack & Win the Battle',
      text: { desktop: 'Select your tank and left-click an enemy building to attack. The goal is to destroy all enemy buildings.', mobile: 'Select your tank and tap an enemy building to attack. The goal is to destroy all enemy buildings.' },
      hint: 'Order any unit to attack to continue.',
      demo: async ctx => {
        if (!await ctx.guideUnitAndWait(findPlayerUnit('tank'))) return
        const target = findEnemyTarget()
        if (target) await ctx.guideTile({ x: target.x + 1, y: target.y + 1 }, 'Click here to attack!')
      },
      completion: () => selectedUnits.some(unit => unit.target || unit.remoteFireCommandActive) || (gameState.remoteControl?.fire || 0) > 0
    },
    {
      id: 'crew-system', title: 'Crew, Hospitals, and Ambulances',
      text: 'Tanks have four crew markers: Driver, Commander, Gunner, and Loader. The marked tank has lost its crew. Build a Hospital, then build an Ambulance from the Units tab. Select the Ambulance and send it to the marked tank to restore all four crew members. The task list shows what to do next; click any task to see its guidance again.',
      hint: 'Restore every crew marker on the marked tank to continue.',
      highlightSelector: '.production-button[data-building-type="hospital"]',
      progressLabel: 'Crew recovery progress',
      progress: ctx => (Number(countPlayerBuildings('hospital') > 0) + Number(countPlayerUnits('ambulance') > 0) + Number(ctx.trackCrewRestoration())) / 3,
      completion: ctx => countPlayerBuildings('hospital') > 0 && countPlayerUnits('ambulance') > 0 && ctx.trackCrewRestoration(),
      demo: ctx => ctx.guideCrewRecovery()
    },
    {
      id: 'tech-tree', title: 'Unlocking the Tech Tree',
      text: 'Open the Tech Tree in the User Manual using the link below. It shows building requirements and the land, air, and naval units they unlock. Radar and a Vehicle Factory unlock the Shipyard. Build the Shipyard on the coast to produce your fleet. Supply Ships also need a support building.',
      hint: 'Open the Tech Tree link to continue.',
      demo: ctx => ctx.guideElement(ctx.techTreeLink),
      completion: ctx => Boolean(ctx.stepState.techTreeOpened)
    },
    {
      id: 'advanced-chain-planning', title: 'Advanced Tutorial: Chain Planning',
      text: {
        desktop: 'Queue several copies of a building, then hold Shift while dragging a ready building from the build bar onto valid ground. Keep Shift held after the first blueprint and drag across the map to preview a straight chain; release to add its valid positions to the plan.',
        mobile: 'Queue several copies of a building and select a ready one for placement. Press and hold on a valid map tile to inspect the placement overlay. Without lifting your finger, drag at least one tile to enter chain-planning and paint the route; release to add its valid positions. Releasing without dragging places one building when valid, while releasing over an invalid tile cancels placement.'
      },
      hint: 'Chain planning is deliberate: mouse uses Shift + drag; touch uses hold, then drag. A stationary touch hold never starts a chain.',
      completion: () => true
    },
    {
      id: 'settings-help', title: 'Settings, Manual & Keyboard Mappings',
      text: 'The information button opens Settings. Its Keybindings tab shows keyboard mappings and lets you change them. The book button opens the User Manual. You can restart this tutorial from Settings at any time.',
      hint: 'Open Settings, view Keybindings, and open the User Manual to finish.',
      demo: ctx => ctx.guideSettings(),
      completion: ctx => ctx.stepState.settingsOpened && ctx.stepState.keybindingsOpened && ctx.stepState.manualOpened
    }
  ]
}
