import { gameState } from '../../gameState.js'
import { productionQueue } from '../../productionQueue.js'
import { getUnitCommandsHandler, selectedUnits } from '../../inputHandler.js'
import { buildingData } from '../../buildings.js'
import { unitCosts } from '../../units.js'
import {
  countPlayerBuildings, countPlayerUnits, findBuildLocation,
  findEnemyTarget, findPlayerBuilding, findPlayerUnit, focusCameraOnPoint, focusCameraOnUnit,
  getCanvasPointForTile, getUnitTile, isHumanOwner, sleep
} from './helpers.js'

const roles = ['driver', 'commander', 'gunner', 'loader']
const productionButton = (kind, type) => document.querySelector(`.production-button[data-${kind}-type="${type}"]`)

export const tutorialGuidance = {
  replayGuidance(show) {
    this.stepGeneration += 1
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame)
    this.showUI()
    this.awaitCompletion(this.steps[this.stepIndex])
    Promise.resolve(show()).catch(error => console.warn('Tutorial guidance unavailable', error))
  },

  grantTutorialFunds() {
    if (!this.active || this.fundsHelp?.hidden) return
    gameState.money += 20000
    productionQueue.tryResumeProduction?.()
    this.updateStepExtras(this.steps[this.stepIndex])
  },

  clearGuidance() {
    if (this.card) {
      Object.assign(this.card.style, this.position)
      this.card.style.maxHeight = ''
      this.card.style.overflowY = ''
    }
    this.cursor?.removeAttribute('data-instruction')
    this.cursor?.classList.remove('tutorial-cursor--drag')
    this.crewMarker?.remove()
    this.crewMarker = null
  },

  async waitFor(predicate, generation = this.stepGeneration) {
    while (this.active && generation === this.stepGeneration) {
      if (predicate()) return true
      await sleep(100)
    }
    return false
  },

  async guideElement(element, instruction = 'Click here!') {
    const generation = this.stepGeneration
    if (!element || !this.active) return
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    if (element.classList.contains('production-button')) {
      const rect = element.getBoundingClientRect()
      this.moveCursorToPoint({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 4 })
      await sleep(1167)
    } else await this.moveCursorToElement(element)
    if (this.active && generation === this.stepGeneration) this.cursor?.setAttribute('data-instruction', instruction)
  },

  async guideTile(tile, instruction = 'Click here!') {
    const generation = this.stepGeneration
    let point = tile && getCanvasPointForTile(tile.x, tile.y)
    if (!point) return
    const bounds = document.getElementById('gameCanvas')?.getBoundingClientRect()
    if (bounds && (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom)) {
      focusCameraOnPoint({ x: tile.x * 32 + 16, y: tile.y * 32 + 16 })
      await sleep(1167)
      if (!this.active || generation !== this.stepGeneration) return
      point = getCanvasPointForTile(tile.x, tile.y)
    }
    // Keep the demonstrated map action clickable instead of placing the card
    // over it. This is a temporary position, not a saved player preference.
    const card = this.card?.getBoundingClientRect()
    if (card && bounds && point.x >= card.left - 24 && point.x <= card.right + 24 && point.y >= card.top - 24 && point.y <= card.bottom + 24) {
      let height = card.height
      if (height > (bounds.bottom - bounds.top) / 2) {
        this.card.style.maxHeight = '30vh'
        this.card.style.overflowY = 'auto'
        height = Math.min(height, window.innerHeight * 0.3)
      }
      Object.assign(this.card.style, {
        left: `${Math.max(bounds.left + 20, bounds.right - card.width - 20)}px`,
        top: `${point.y < (bounds.top + bounds.bottom) / 2 ? bounds.bottom - height - 20 : bounds.top + 20}px`,
        bottom: 'auto', right: 'auto'
      })
    }
    this.moveCursorToPoint(point)
    await sleep(1167)
    if (this.active && generation === this.stepGeneration) this.cursor?.setAttribute('data-instruction', instruction)
  },

  async guideTab(kind) {
    const generation = this.stepGeneration
    const tab = document.querySelector(`.tab-button[data-tab="${kind}"]`)
    const panel = document.getElementById(`${kind}TabContent`)
    // A hidden button cannot be pointed at. Ask the player to open its tab.
    if (tab && !tab.classList.contains('active')) {
      await this.guideElement(tab)
      return this.waitFor(() => tab.classList.contains('active') || (panel && !panel.hidden && panel.offsetParent), generation)
    }
    return this.active && generation === this.stepGeneration
  },

  async guideBuilding(type, { drag = false } = {}) {
    const generation = this.stepGeneration
    if (!await this.guideTab('buildings')) return
    const button = productionButton('building', type)
    const start = countPlayerBuildings(type)
    await this.guideElement(button, drag ? 'Hold here, then drag to the map!' : 'Click here!')
    if (generation !== this.stepGeneration) return
    if (drag) {
      // The overlay illustrates a drag, without dispatching pointer events.
      this.cursor?.classList.add('tutorial-cursor--drag')
      await sleep(1167)
      if (generation !== this.stepGeneration) return
      await this.guideTile(findBuildLocation(type), 'Release here to place the blueprint!')
      this.cursor?.classList.remove('tutorial-cursor--drag')
      return
    }
    if (!await this.waitFor(() => this.lastAction === `building:${type}` || gameState.currentBuildingType === type || countPlayerBuildings(type) > start, generation)) return
    if (countPlayerBuildings(type) > start) return
    // Buildings can be blueprinted before production, or placed after ready.
    if (!gameState.buildingPlacementMode) {
      if (!await this.waitFor(() => gameState.currentBuildingType === type || button?.classList.contains('ready-for-placement') || countPlayerBuildings(type) > start, generation)) return
      if (countPlayerBuildings(type) > start) return
      if (!gameState.buildingPlacementMode) {
        await this.guideElement(button)
        if (!await this.waitFor(() => gameState.buildingPlacementMode || countPlayerBuildings(type) > start, generation)) return
      }
    }
    if (countPlayerBuildings(type) === start) await this.guideTile(findBuildLocation(type))
  },

  async guideUnitBuild(type) {
    if (!await this.guideTab('units')) return
    const button = productionButton('unit', type)
    if (!button) return
    // Queueing lives in the upper half; the center can hit the remove zone.
    const rect = button.getBoundingClientRect()
    this.moveCursorToPoint({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 4 })
    const generation = this.stepGeneration
    await sleep(1167)
    if (this.active && generation === this.stepGeneration) this.cursor?.setAttribute('data-instruction', 'Click here to add one!')
  },

  async guideUnit(unit, instruction = 'Click here!') {
    if (!unit) return
    focusCameraOnUnit(unit)
    const generation = this.stepGeneration
    await sleep(1167)
    if (generation !== this.stepGeneration) return
    await this.guideTile(getUnitTile(unit), instruction)
  },

  async guideUnitAndWait(unit) {
    if (!unit) return false
    const generation = this.stepGeneration
    await this.guideUnit(unit)
    return this.waitFor(() => selectedUnits.includes(unit), generation)
  },

  async guideSelection() {
    const generation = this.stepGeneration
    if ((gameState.units || []).filter(unit => isHumanOwner(unit.owner) && unit.health > 0).length < 2) {
      await this.guideUnitBuild('harvester')
      if (!await this.waitFor(() => (gameState.units || []).filter(unit => isHumanOwner(unit.owner) && unit.health > 0).length >= 2, generation)) return
    }
    const units = (gameState.units || []).filter(unit => isHumanOwner(unit.owner) && unit.health > 0).slice(0, 2)
    focusCameraOnUnit(units[0])
    await sleep(1167)
    if (generation !== this.stepGeneration) return
    const tiles = units.map(getUnitTile)
    await this.guideTile({ x: Math.min(...tiles.map(t => t.x)) - 1, y: Math.min(...tiles.map(t => t.y)) - 1 }, 'Hold and drag; Shift adds units!')
    if (generation !== this.stepGeneration) return
    await sleep(1167)
    if (generation !== this.stepGeneration) return
    await this.guideTile({ x: Math.max(...tiles.map(t => t.x)) + 1, y: Math.max(...tiles.map(t => t.y)) + 1 }, 'Release here!')
  },

  guideDeselect() {
    return this.guideTile(findBuildLocation('powerPlant'), 'Press Esc or secondary click to deselect!')
  },

  async guideMove(type = 'harvester') {
    const unit = findPlayerUnit(type)
    const generation = this.stepGeneration
    if (!await this.guideUnitAndWait(unit)) return
    if (generation !== this.stepGeneration) return
    const tile = getUnitTile(unit)
    await this.guideTile({ x: tile.x + 3, y: tile.y + 2 }, 'Click here to move!')
  },

  hasNewMoveOrder(type) {
    return selectedUnits.some(unit => {
      if (unit.isBuilding || (type && !unit.type?.startsWith(type))) return false
      const previous = this.stepState.moveTargets?.get(unit.id)
      const current = unit.moveTarget
      return current && (!previous || current.x !== previous.x || current.y !== previous.y)
    })
  },

  async guideTankRally() {
    const generation = this.stepGeneration
    await this.guideUnitBuild('tank')
    if (!await this.waitFor(() => this.lastAction === 'unit:tank' || countPlayerUnits('tank') > this.stepState.startTanks, generation)) return
    const factory = findPlayerBuilding('vehicleFactory')
    if (!factory) return
    await this.guideTile({ x: factory.x + 1, y: factory.y + 1 }, 'Click the factory!')
    if (!await this.waitFor(() => selectedUnits.includes(factory), generation)) return
    await this.guideTile({ x: factory.x + 4, y: factory.y + 1 }, 'Click here to set the rally point!')
  },

  prepareCrewTank() {
    if (this.stepState.crewPrepared) return
    const tank = (gameState.units || []).find(unit => isHumanOwner(unit.owner) && unit.health > 0 && unit.type?.startsWith('tank') && roles.every(role => role in (unit.crew || {})))
    if (!tank || !window.cheatSystem?.processCheatCode) return
    this.stepState.crewTankId = tank.id
    for (const role of roles) {
      if (tank.crew[role]) window.cheatSystem.processCheatCode(role, { targetUnits: [tank], silent: true })
    }
    this.stepState.crewPrepared = roles.every(role => tank.crew[role] === false)
  },

  async guideCrewRecovery() {
    this.prepareCrewTank()
    const generation = this.stepGeneration
    if (!this.stepState.crewPrepared) {
      await this.guideUnitBuild('tank')
      if (!await this.waitFor(() => { this.prepareCrewTank(); return this.stepState.crewPrepared }, generation)) return
    }
    if (countPlayerBuildings('hospital') === 0) {
      await this.guideBuilding('hospital')
      if (!await this.waitFor(() => countPlayerBuildings('hospital') > 0, generation)) return
    }
    this.clearHighlight()
    const ambulanceButton = productionButton('unit', 'ambulance')
    if (ambulanceButton) {
      if (!ambulanceButton.querySelector('.production-ready-glow')) {
        const glow = document.createElement('span')
        glow.className = 'production-ready-glow'
        glow.setAttribute('aria-hidden', 'true')
        ambulanceButton.append(glow)
      }
      ambulanceButton.classList.add('tutorial-highlight'); this.highlighted = ambulanceButton }
    if (countPlayerUnits('ambulance') === 0) {
      await this.guideUnitBuild('ambulance')
      if (!await this.waitFor(() => countPlayerUnits('ambulance') > 0, generation)) return
    }
    await this.guideRestoreCrew()
  },

  async guideRestoreCrew() {
    const generation = this.stepGeneration
    if (!await this.guideUnitAndWait(findPlayerUnit('ambulance'))) return
    if (generation !== this.stepGeneration) return
    const tank = (gameState.units || []).find(unit => unit.id === this.stepState.crewTankId)
    await this.guideUnit(tank, 'Click the marked tank to restore its crew!')
  },

  updateCrewMarker() {
    const tank = (gameState.units || []).find(unit => unit.id === this.stepState.crewTankId)
    if (!tank || tank.health <= 0 || this.trackCrewRestoration()) {
      this.crewMarker?.remove()
      this.crewMarker = null
      // A destroyed lesson target is replaced by another player-built tank.
      if (this.stepState.crewPrepared && (!tank || tank.health <= 0)) { this.stepState.crewPrepared = false; this.prepareCrewTank() }
      return
    }
    if (!this.crewMarker) {
      this.crewMarker = document.createElement('div')
      this.crewMarker.className = 'tutorial-crew-marker'
      this.crewMarker.textContent = '▼ Restore crew'
      document.body.append(this.crewMarker)
    }
    const point = getCanvasPointForTile(getUnitTile(tank).x, getUnitTile(tank).y)
    if (point) {
      this.crewMarker.style.left = `${point.x}px`
      this.crewMarker.style.top = `${point.y - 32}px`
      const bounds = document.getElementById('gameCanvas')?.getBoundingClientRect()
      this.crewMarker.hidden = this.minimized || (bounds && (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom))
    }
  },

  renderStepExtras(step) {
    this.stepTodos.hidden = step.id !== 'crew-system'
    this.techTreeLink.hidden = step.id !== 'tech-tree'
    this.updateStepExtras(step)
  },

  updateStepExtras(step) {
    if (!this.fundsHelp) return
    const buildCost = step.buildType ? buildingData[step.buildType]?.cost : step.unitType ? unitCosts[step.unitType] : step.id === 'crew-system' ? (countPlayerBuildings('hospital') ? unitCosts.ambulance : buildingData.hospital?.cost) : 0
    const pendingCost = productionQueue.currentBuilding?.cost || productionQueue.currentUnit?.cost || 0
    this.fundsHelp.hidden = !(gameState.money < Math.max(buildCost || 0, pendingCost, 1))
    if (step.id === 'crew-system') {
      const done = [countPlayerBuildings('hospital') > 0, countPlayerUnits('ambulance') > 0, this.trackCrewRestoration()]
      this.stepTodos.querySelectorAll('button').forEach((button, index) => {
        button.setAttribute('aria-label', `${done[index] ? 'Completed' : 'To do'}: ${button.textContent.replace(/^[✓○] /, '')}`)
        button.textContent = `${done[index] ? '✓' : '○'} ${button.textContent.replace(/^[✓○] /, '')}`
      })
    }
  },

  async guideSettings() {
    const generation = this.stepGeneration
    if (!await this.waitFor(() => document.getElementById('userDocsModal')?.getAttribute('aria-hidden') !== 'false', generation)) return
    await this.guideElement(document.getElementById('helpBtn'))
    if (!await this.waitFor(() => this.stepState.settingsOpened, generation)) return
    await this.guideElement(document.querySelector('[data-config-tab="keybindings"]'))
    if (!await this.waitFor(() => this.stepState.keybindingsOpened, generation)) return
    // The player closes the modal before following the book button.
    if (!await this.waitFor(() => document.getElementById('configSettingsModal')?.getAttribute('aria-hidden') === 'true', generation)) return
    await this.guideElement(document.getElementById('userDocsBtn'))
  },

  async ensureSkippedUnits(count, type = 'harvester') {
    const missing = Math.max(0, count - countPlayerUnits(type))
    for (let index = 0; index < missing; index++) await this.demoBuildUnit(type)
  },

  async fulfillSkippedStep(step) {
    // All automatic game actions are contained in this explicit skip path.
    if (step.buildType) await this.demoBuildBuilding(step.buildType)
    if (step.unitType) await this.demoBuildUnit(step.unitType)
    const commands = getUnitCommandsHandler()
    if (step.id === 'select-single' || step.id === 'select-group') {
      await this.ensureSkippedUnits(step.id === 'select-group' ? 2 : 1)
      const units = (gameState.units || []).filter(unit => isHumanOwner(unit.owner)).slice(0, step.id === 'select-group' ? 2 : 1)
      selectedUnits.forEach(unit => { unit.selected = false })
      selectedUnits.splice(0, selectedUnits.length, ...units)
      units.forEach(unit => { unit.selected = true })
    }
    if (step.id === 'deselect') {
      selectedUnits.forEach(unit => { unit.selected = false })
      selectedUnits.length = 0
    }
    if (['move-units', 'tank-control', 'attack'].includes(step.id)) {
      await this.ensureSkippedUnits(1, step.id === 'move-units' ? 'harvester' : 'tank')
      const unit = findPlayerUnit(step.id === 'move-units' ? 'harvester' : 'tank')
      if (unit && commands) {
        const tile = getUnitTile(unit)
        if (step.id === 'attack') {
          const target = findEnemyTarget()
          if (target) commands.handleAttackCommand([unit], target, gameState.mapGrid)
        } else commands.handleMovementCommand([unit], (tile.x + 3) * 32, (tile.y + 2) * 32, gameState.mapGrid)
        if (step.id === 'tank-control') unit.hasUsedRemoteControl = true
      }
    }
    if (step.id === 'tank-rally') {
      const factory = findPlayerBuilding('vehicleFactory')
      if (factory) factory.rallyPoint = { x: (factory.x + 4) * 32, y: (factory.y + 1) * 32 }
    }
    if (step.id === 'crew-system') {
      if (!countPlayerBuildings('hospital')) await this.demoBuildBuilding('hospital')
      if (!countPlayerUnits('ambulance')) await this.demoBuildUnit('ambulance')
      const tank = (gameState.units || []).find(unit => unit.id === this.stepState.crewTankId)
      if (tank?.crew) for (const role of roles) tank.crew[role] = true
    }
    if (step.id === 'tech-tree') window.openUserDocs?.('tech-tree')
  }
}
