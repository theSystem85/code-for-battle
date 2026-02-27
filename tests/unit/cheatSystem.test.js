import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import '../setup.js'

const units = []
const factories = []

const gameState = {
  gamePaused: false,
  cheatDialogOpen: false,
  humanPlayer: 'player1',
  money: 100,
  totalMoneyEarned: 0,
  factories: [],
  buildings: [],
  units: [],
  mapGrid: [],
  occupancyMap: [],
  cursorX: 0,
  cursorY: 0,
  selectionActive: false,
  selectionStart: { x: 0, y: 0 },
  selectionEnd: { x: 0, y: 0 },
  selectedWreckId: null
}

vi.mock('../../src/gameState.js', () => ({
  gameState
}))

vi.mock('../../src/main.js', () => ({
  units,
  factories
}))

const showNotification = vi.fn()
const playSound = vi.fn()

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification
}))

vi.mock('../../src/sound.js', () => ({
  playSound
}))

const productionQueue = {
  tryResumeProduction: vi.fn()
}

vi.mock('../../src/productionQueue.js', () => ({
  productionQueue
}))

const setEnemyControlEnabled = vi.fn()

vi.mock('../../src/config.js', () => ({
  ENABLE_ENEMY_CONTROL: false,
  setEnemyControlEnabled,
  TILE_SIZE: 10,
  DIRECTIONS: [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ],
  MAX_SPAWN_SEARCH_DISTANCE: 2,
  UNIT_PROPERTIES: {
    tank_v1: {},
    apache: {},
    recoveryTank: {},
    ammunitionTruck: {}
  },
  HELIPAD_AMMO_RESERVE: 200,
  CHEAT_CONSOLE_HISTORY_LIMIT: 10
}))

const createUnit = vi.fn()
const updateUnitOccupancy = vi.fn()

vi.mock('../../src/units.js', () => ({
  createUnit,
  updateUnitOccupancy
}))

const updatePowerSupply = vi.fn()
const createBuilding = vi.fn()
const placeBuilding = vi.fn()
const buildingData = {
  helipad: { width: 3, height: 3 },
  powerPlant: { width: 2, height: 2 }
}

vi.mock('../../src/buildings.js', () => ({
  updatePowerSupply,
  createBuilding,
  placeBuilding,
  buildingData
}))

const updateUnitSpeedModifier = vi.fn()
const initializeUnitLeveling = vi.fn((unit) => {
  unit.level = unit.level ?? 0
  unit.experience = unit.experience ?? 0
})
const checkLevelUp = vi.fn()

vi.mock('../../src/utils.js', () => ({
  updateUnitSpeedModifier,
  initializeUnitLeveling,
  checkLevelUp
}))

const deployMine = vi.fn()

vi.mock('../../src/game/mineSystem.js', () => ({
  deployMine
}))

const getWreckById = vi.fn()
const removeWreckById = vi.fn()

vi.mock('../../src/game/unitWreckManager.js', () => ({
  getWreckById,
  removeWreckById
}))

const resetDom = () => {
  document.body.innerHTML = ''
  const style = document.getElementById('cheat-dialog-styles')
  if (style) {
    style.remove()
  }
  const overlay = document.getElementById('cheat-dialog-overlay')
  if (overlay) {
    overlay.remove()
  }
}

const createGrid = (width, height, overrides = {}) => {
  const grid = []
  for (let y = 0; y < height; y++) {
    const row = []
    for (let x = 0; x < width; x++) {
      row.push({
        type: 'land',
        seedCrystal: false,
        building: null,
        ...overrides
      })
    }
    grid.push(row)
  }
  return grid
}

let CheatSystem

beforeEach(async() => {
  vi.clearAllMocks()
  units.length = 0
  factories.length = 0
  gameState.money = 100
  gameState.totalMoneyEarned = 0
  gameState.humanPlayer = 'player1'
  gameState.factories = []
  gameState.buildings = []
  gameState.units = []
  gameState.mapGrid = createGrid(5, 5)
  gameState.occupancyMap = []
  gameState.cursorX = 0
  gameState.cursorY = 0
  gameState.selectedWreckId = null
  gameState.selectionActive = false
  gameState.selectionStart = { x: 0, y: 0 }
  gameState.selectionEnd = { x: 0, y: 0 }
  createBuilding.mockReset()
  placeBuilding.mockReset()
  resetDom()

  ;({ CheatSystem } = await import('../../src/input/cheatSystem.js'))
})

afterEach(() => {
  resetDom()
})

describe('CheatSystem', () => {
  it('restores cheat command history with ArrowUp and ArrowDown', () => {
    const system = new CheatSystem()
    system.commandHistory = ['give 1000', 'status', 'godmode on']
    system.openDialog()

    const input = document.getElementById('cheat-input')
    input.value = 'partial'

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(input.value).toBe('godmode on')

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(input.value).toBe('status')

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(input.value).toBe('godmode on')

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(input.value).toBe('partial')
  })

  it('stores only the configured maximum number of cheat commands in history', () => {
    const system = new CheatSystem()

    for (let i = 1; i <= 20; i++) {
      system.addCommandToHistory(`cmd-${i}`)
    }

    expect(system.commandHistory).toHaveLength(10)
    expect(system.commandHistory[0]).toBe('cmd-11')
    expect(system.commandHistory[9]).toBe('cmd-20')

    const saved = JSON.parse(localStorage.getItem('rts-cheat-console-history'))
    expect(saved).toEqual(system.commandHistory)
  })

  it('injects cheat dialog styles once', () => {
    const system = new CheatSystem()
    const style = document.getElementById('cheat-dialog-styles')
    expect(style).toBeTruthy()
    const second = new CheatSystem()
    expect(document.querySelectorAll('#cheat-dialog-styles')).toHaveLength(1)
    second.closeDialog()
    system.closeDialog()
  })

  it('opens and closes the dialog while pausing input', () => {
    const system = new CheatSystem()

    system.openDialog()

    expect(system.isDialogOpen).toBe(true)
    expect(gameState.cheatDialogOpen).toBe(true)
    expect(document.getElementById('cheat-dialog-overlay')).toBeTruthy()

    system.closeDialog()

    expect(system.isDialogOpen).toBe(false)
    expect(gameState.cheatDialogOpen).toBe(false)
    expect(document.getElementById('cheat-dialog-overlay')).toBeNull()
  })

  it('parses numeric amounts from formatted inputs', () => {
    const system = new CheatSystem()

    expect(system.parseAmount('1,200')).toBe(1200)
    expect(system.parseAmount('-5')).toBe(0)
    expect(system.parseAmount('abc')).toBeNull()
  })

  it('parses fuel and ammo values with percent support', () => {
    const system = new CheatSystem()

    expect(system.parseFuelValue('50%')).toEqual({ value: 0.5, isPercent: true, display: '50%' })
    expect(system.parseFuelValue('90')).toEqual({ value: 90, isPercent: false, display: '90' })
    expect(system.parseAmmoValue('25%')).toEqual({ value: 0.25, isPercent: true, isRelative: false, display: '25%' })

    expect(system.parseAmmoValue('40')).toEqual({ value: 40, isPercent: false, isRelative: false, display: '40' })
    expect(system.parseAmmoValue('+10')).toEqual({ value: 10, isPercent: false, isRelative: true, display: '+10' })
    expect(system.parseAmmoValue('-15%')).toEqual({ value: -0.15, isPercent: true, isRelative: true, display: '-15%' })
  })

  it('parses spawn commands with unit type, count, and party', () => {
    const system = new CheatSystem()
    const spawn = system.parseSpawnCommand('tank_v1 3 red')

    expect(spawn).toEqual({
      unitType: 'tank_v1',
      count: 3,
      owner: 'player2'
    })
  })

  it('parses build commands with building type and party', () => {
    const system = new CheatSystem()
    const parsed = system.parseBuildingSpawnCommand('build helipad red')

    expect(parsed).toEqual({
      buildingType: 'helipad',
      owner: 'player2'
    })
  })

  it('finds valid spawn positions around occupied tiles', () => {
    const system = new CheatSystem()
    gameState.mapGrid = createGrid(3, 3)
    gameState.cursorX = 10
    gameState.cursorY = 10
    units.push({ x: 10, y: 10 })

    const position = system.findSpawnPositionNear(1, 1)

    expect(position).toEqual({ x: 2, y: 1 })
  })

  it('spawns units near the cursor and updates occupancy', () => {
    const system = new CheatSystem()
    gameState.mapGrid = createGrid(4, 4)
    gameState.cursorX = 10
    gameState.cursorY = 10

    createUnit.mockImplementation((owner, type, x, y) => ({
      id: `${type}-${x}-${y}`,
      owner: owner.id,
      type,
      x: x * 10,
      y: y * 10,
      health: 50,
      maxHealth: 100
    }))

    system.spawnUnitsAroundCursor('tank_v1', 2, 'player1')

    expect(units).toHaveLength(2)
    expect(updateUnitOccupancy).toHaveBeenCalledTimes(2)
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Spawned 2 tank_v1s'), 3000)
  })

  it('spawns buildings near cursor via build cheat command', () => {
    const system = new CheatSystem()
    gameState.mapGrid = createGrid(10, 10)
    gameState.occupancyMap = Array.from({ length: 10 }, () => Array(10).fill(0))
    gameState.buildings = []
    gameState.cursorX = 20
    gameState.cursorY = 20

    createBuilding.mockImplementation((type, x, y) => ({
      id: `${type}-${x}-${y}`,
      type,
      x,
      y,
      width: 3,
      height: 3,
      health: 100,
      maxHealth: 100
    }))

    system.processCheatCode('build helipad red')

    expect(createBuilding).toHaveBeenCalledWith('helipad', 2, 2)
    expect(placeBuilding).toHaveBeenCalledTimes(1)
    expect(gameState.buildings).toHaveLength(1)
    expect(gameState.buildings[0].owner).toBe('player2')
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Spawned helipad'), 3000)
  })

  it('deploys mine patterns and reports skipped tiles', () => {
    const system = new CheatSystem()
    const mineSpy = vi.spyOn(system, 'tryDeployMineAt')
      .mockReturnValueOnce({ success: true })
      .mockReturnValueOnce({ success: false, reason: 'Blocked tile' })

    system.deployMineFieldPattern({ width: 2, height: 1, gap: 0, owner: 'player1' })

    expect(mineSpy).toHaveBeenCalledTimes(2)
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('skipped'), 4000)
    expect(playSound).toHaveBeenCalledWith('confirmed', 0.5)
  })

  it('enables and disables god mode for player units', () => {
    units.push({ id: 'u1', owner: 'player1', health: 25, maxHealth: 100 })
    const system = new CheatSystem()

    system.enableGodMode()
    expect(system.isGodModeActive()).toBe(true)
    expect(units[0].isInvincible).toBe(true)
    expect(units[0].health).toBe(100)

    system.disableGodMode()
    expect(system.isGodModeActive()).toBe(false)
    expect(units[0].isInvincible).toBe(false)
  })

  it('adds money to a specific AI factory budget', () => {
    const system = new CheatSystem()
    gameState.factories = [{ id: 'player2', owner: 'player2', budget: 50 }]

    const result = system.addMoney(75, 'player2')

    expect(result).toBe(true)
    expect(gameState.factories[0].budget).toBe(125)
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Added $75'),
      3000
    )
  })

  it('sets ammo values for apache units', () => {
    const system = new CheatSystem()
    const apache = {
      type: 'apache',
      maxAmmunition: 10,
      ammunition: 0,
      maxRocketAmmo: 10,
      rocketAmmo: 0,
      apacheAmmoEmpty: true,
      canFire: false
    }
    system.setSelectedUnitsRef([apache])

    system.setSelectedUnitsAmmo({ value: 0.5, isPercent: true, display: '50%' })

    expect(apache.rocketAmmo).toBe(5)
    expect(apache.ammunition).toBe(5)
    expect(apache.apacheAmmoEmpty).toBe(false)
    expect(apache.canFire).toBe(true)
  })

  it('sets ammo truck load for helipads', () => {
    const system = new CheatSystem()
    const helipad = { type: 'helipad', ammo: 0 }
    system.setSelectedUnitsRef([helipad])

    system.setAmmoTruckLoad({ value: 0.25, isPercent: true, display: '25%' })

    expect(helipad.maxAmmo).toBe(200)
    expect(helipad.ammo).toBe(50)
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Ammo load set'),
      3000
    )
  })

  it('parses xp values for absolute and relative updates', () => {
    const system = new CheatSystem()

    expect(system.parseExperienceValue('120')).toEqual({ value: 120, isRelative: false, display: '120' })
    expect(system.parseExperienceValue('+75')).toEqual({ value: 75, isRelative: true, display: '+75' })
    expect(system.parseExperienceValue('-40')).toEqual({ value: -40, isRelative: true, display: '-40' })
  })

  it('sets selected unit xp with absolute and relative values', () => {
    const system = new CheatSystem()
    const combatUnit = { type: 'tank_v1', experience: 10, level: 0 }
    const harvester = { type: 'harvester', experience: 10, level: 0 }
    system.setSelectedUnitsRef([combatUnit, harvester])

    system.setSelectedUnitsExperience({ value: 50, isRelative: false, display: '50' })
    system.setSelectedUnitsExperience({ value: 20, isRelative: true, display: '+20' })

    expect(combatUnit.experience).toBe(70)
    expect(harvester.experience).toBe(10)
    expect(initializeUnitLeveling).toHaveBeenCalledWith(combatUnit)
    expect(checkLevelUp).toHaveBeenCalledTimes(2)
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('XP set to 50 for 1 unit'), 3000)
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('XP adjusted by +20 for 1 unit'), 3000)
  })

  it('prevents damage to player units when god mode is enabled', () => {
    const system = new CheatSystem()
    const unit = { id: 'u1', owner: 'player1', health: 50, maxHealth: 100 }
    units.push(unit)

    system.enableGodMode()

    expect(system.preventDamage(unit, 25)).toBe(0)
    expect(system.preventDamage({ owner: 'player2' }, 25)).toBe(25)
  })

  it('parses minefield commands with owner aliases', () => {
    const system = new CheatSystem()

    expect(system.parseMineFieldPattern('2x3g1')).toEqual({ width: 2, height: 3, gap: 1 })
    expect(system.parseMineFieldCommand('mines 2x3g1 red')).toEqual({
      width: 2,
      height: 3,
      gap: 1,
      owner: 'player2'
    })
  })

  it('prevents mine placement on invalid tiles', () => {
    const system = new CheatSystem()
    gameState.mapGrid = []
    expect(system.tryDeployMineAt(0, 0, 'player1')).toEqual({
      success: false,
      reason: 'Map is not ready for mine placement'
    })

    gameState.mapGrid = createGrid(1, 1, { type: 'water' })
    expect(system.tryDeployMineAt(0, 0, 'player1')).toEqual({
      success: false,
      reason: 'Cannot place a mine on this tile'
    })
  })

  it('deploys mines through the mine system', () => {
    const system = new CheatSystem()
    gameState.mapGrid = createGrid(2, 2)
    deployMine.mockReturnValue({ id: 'mine-1' })

    expect(system.tryDeployMineAt(1, 1, 'player1')).toEqual({
      success: true,
      mine: { id: 'mine-1' }
    })
  })

  it('toggles god mode and restores original health', () => {
    const system = new CheatSystem()
    units.push(
      { id: 'u1', owner: 'player1', health: 50, maxHealth: 100 },
      { id: 'u2', owner: 'player2', health: 30, maxHealth: 80 }
    )

    system.enableGodMode()

    expect(units[0].health).toBe(100)
    expect(units[0].isInvincible).toBe(true)
    expect(units[1].isInvincible).toBeUndefined()

    units[0].health = 10

    system.disableGodMode()

    expect(units[0].health).toBe(50)
    expect(units[0].isInvincible).toBe(false)
  })

  it('prevents damage to player units during god mode', () => {
    const system = new CheatSystem()
    system.godModeEnabled = true
    system.godModeUnits.add('u1')

    expect(system.preventDamage({ owner: 'player1', id: 'u1' }, 25)).toBe(0)
    expect(system.preventDamage({ owner: 'player2', id: 'u2' }, 25)).toBe(25)
  })

  it('adds money to player wallet and resumes production', () => {
    const system = new CheatSystem()

    expect(system.addMoney(500)).toBe(true)
    expect(gameState.money).toBe(600)
    expect(gameState.totalMoneyEarned).toBe(500)
    expect(productionQueue.tryResumeProduction).toHaveBeenCalled()
  })

  it('adds money to AI factory budgets', () => {
    const system = new CheatSystem()
    gameState.factories = [{ owner: 'player2', budget: 100 }]

    expect(system.addMoney(250, 'player2')).toBe(true)
    expect(gameState.factories[0].budget).toBe(350)
  })

  it('sets player money directly and resumes production', () => {
    const system = new CheatSystem()

    system.setMoney(900)

    expect(gameState.money).toBe(900)
    expect(productionQueue.tryResumeProduction).toHaveBeenCalled()
  })

  it('updates selected unit fuel levels', () => {
    const system = new CheatSystem()
    const unit = { maxGas: 100, gas: 10 }
    system.setSelectedUnitsRef([unit])

    system.setFuel({ value: 0.5, isPercent: true, display: '50%' })

    expect(unit.gas).toBe(50)
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Fuel set to 50%'), 3000)
  })

  it('updates selected ambulance medic counts', () => {
    const system = new CheatSystem()
    const ambulance = { type: 'ambulance', maxMedics: 4, medics: 1 }
    system.setSelectedUnitsRef([ambulance])

    system.setSelectedAmbulanceMedics(3)

    expect(ambulance.medics).toBe(3)
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Medics set to 3'), 3000)
  })

  it('sets ammo on units and ammo-bar buildings with absolute and relative values', () => {
    const system = new CheatSystem()
    const tank = { maxAmmunition: 10, ammunition: 0 }
    const apache = { type: 'apache', maxRocketAmmo: 8, rocketAmmo: 0 }
    const turret = { type: 'rocketTurret', maxAmmo: 20, ammo: 5 }
    system.setSelectedUnitsRef([tank, apache, turret])

    system.setSelectedUnitsAmmo({ value: 1, isPercent: false, isRelative: false, display: '1' })
    system.setSelectedUnitsAmmo({ value: 0.25, isPercent: true, isRelative: true, display: '+25%' })

    expect(tank.ammunition).toBe(3.5)
    expect(apache.rocketAmmo).toBe(3)
    expect(apache.canFire).toBe(true)
    expect(turret.ammo).toBe(6)
  })

  it('sets ammo truck cargo and helipad reserves with absolute and relative values', () => {
    const system = new CheatSystem()
    const truck = { type: 'ammunitionTruck', maxAmmoCargo: 200, ammoCargo: 0 }
    const helipad = { type: 'helipad', maxAmmo: 300, ammo: 0 }
    system.setSelectedUnitsRef([truck, helipad])

    system.setAmmoTruckLoad({ value: 0.5, isPercent: true, isRelative: false, display: '50%' })
    system.setAmmoTruckLoad({ value: -25, isPercent: false, isRelative: true, display: '-25' })

    expect(truck.ammoCargo).toBe(75)
    expect(helipad.ammo).toBe(125)
  })

  it('sets selected unit health by percent and updates speed', () => {
    const system = new CheatSystem()
    const unit = { maxHealth: 100, health: 100 }
    system.setSelectedUnitsRef([unit])

    system.setSelectedUnitsHP(25, true)

    expect(unit.health).toBe(25)
    expect(updateUnitSpeedModifier).toHaveBeenCalledWith(unit)
  })

  it('changes selected unit parties and updates power', () => {
    const system = new CheatSystem()
    const unit = { owner: 'player1' }
    system.setSelectedUnitsRef([unit])
    gameState.buildings = [{ owner: 'player1' }]

    system.setSelectedParty('player2')

    expect(unit.owner).toBe('player2')
    expect(updatePowerSupply).toHaveBeenCalledWith(gameState.buildings, gameState)
  })

  it('switches the player party across units, buildings, and factories', () => {
    const system = new CheatSystem()
    gameState.units = [{ owner: 'player1', id: 'u1' }]
    units.push({ owner: 'player1', id: 'u2' })
    gameState.buildings = [{ owner: 'player1' }]
    factories.push({ owner: 'player1', id: 'player1' })

    system.setPlayerParty('player3')

    expect(gameState.humanPlayer).toBe('player3')
    expect(gameState.units[0].owner).toBe('player3')
    expect(units[0].owner).toBe('player3')
    expect(gameState.buildings[0].owner).toBe('player3')
    expect(factories[0].owner).toBe('player3')
    expect(factories[0].id).toBe('player3')
  })

  it('destroys selected units and buildings', () => {
    const system = new CheatSystem()
    const unit = { health: 10, destroyed: false, selected: true, isBuilding: false }
    const building = { health: 25, destroyed: false, selected: true, isBuilding: true }
    system.setSelectedUnitsRef([unit, building])

    system.killSelectedTargets()

    expect(unit.health).toBe(0)
    expect(building.health).toBe(0)
    expect(system.selectedUnits).toHaveLength(0)
    expect(gameState.selectionActive).toBe(false)
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Destroyed 1 unit and 1 building'), 4000)
  })

  it('recovers selected wrecks into restored units', () => {
    const system = new CheatSystem()
    const wreck = {
      id: 'wreck-1',
      unitType: 'tank_v1',
      x: 15,
      y: 25,
      buildDuration: 120,
      direction: 2,
      turretDirection: 1
    }
    gameState.selectedWreckId = wreck.id
    getWreckById.mockReturnValue(wreck)
    createUnit.mockReturnValue({ id: 'restored', maxHealth: 100, health: 10, direction: 0 })

    system.recoverSelectedWreck('player1')

    expect(createUnit).toHaveBeenCalledWith(
      { owner: 'player1' },
      'tank_v1',
      2,
      3,
      expect.objectContaining({ buildDuration: 120 })
    )
    expect(removeWreckById).toHaveBeenCalledWith(gameState, 'wreck-1')
    expect(units).toHaveLength(1)
  })

  it('toggles crew members and alerts on removal', () => {
    const system = new CheatSystem()
    const unit = { owner: 'player1', crew: { driver: true } }
    system.setSelectedUnitsRef([unit])

    system.toggleCrewMember('driver')

    expect(unit.crew.driver).toBe(false)
    expect(playSound).toHaveBeenCalledWith('ourDriverIsOut')
    expect(showNotification).toHaveBeenCalledWith('driver removed', 2000)
  })
})
