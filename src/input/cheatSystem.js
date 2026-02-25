// cheatSystem.js
import { gameState } from '../gameState.js'
import { units, factories } from '../main.js'
import { showNotification } from '../ui/notifications.js'
import { playSound } from '../sound.js'
import { productionQueue } from '../productionQueue.js'
import {
  ENABLE_ENEMY_CONTROL,
  setEnemyControlEnabled,
  TILE_SIZE,
  DIRECTIONS,
  MAX_SPAWN_SEARCH_DISTANCE,
  UNIT_PROPERTIES,
  HELIPAD_AMMO_RESERVE
} from '../config.js'
import { createUnit, updateUnitOccupancy } from '../units.js'
import { buildingData, createBuilding, placeBuilding, updatePowerSupply } from '../buildings.js'
import { checkLevelUp, initializeUnitLeveling, updateUnitSpeedModifier } from '../utils.js'
import { deployMine } from '../game/mineSystem.js'
import { getWreckById, removeWreckById } from '../game/unitWreckManager.js'

export class CheatSystem {
  constructor() {
    this.isDialogOpen = false
    this.godModeEnabled = false
    this.originalHealthValues = new Map()
    this.godModeUnits = new Set()
    this.selectedUnits = null
    this.setupStyles()
  }

  setupStyles() {
    // Inject CSS styles for the cheat dialog
    if (!document.getElementById('cheat-dialog-styles')) {
      const style = document.createElement('style')
      style.id = 'cheat-dialog-styles'
      style.textContent = `
        .cheat-dialog-overlay {
          z-index: 1600;
        }

        .cheat-dialog__body {
          gap: 16px;
          overflow-x: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .cheat-dialog__body::-webkit-scrollbar {
          width: 0;
          height: 0;
        }

        .cheat-dialog__title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          letter-spacing: 0.4px;
        }

        .cheat-dialog__subtitle {
          margin: 0;
          font-size: 13px;
          color: #9fb3c8;
        }

        .cheat-dialog__help ul {
          margin: 0;
          padding-left: 18px;
          color: #9fb3c8;
        }

        .cheat-dialog__help {
          overflow-x: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .cheat-dialog__help::-webkit-scrollbar {
          width: 0;
          height: 0;
        }

        .cheat-dialog__help li {
          margin-bottom: 6px;
        }

        .cheat-dialog__help code {
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 4px;
          border-radius: 3px;
          font-family: 'Courier New', Courier, monospace;
        }
      `
      document.head.appendChild(style)
    }
  }

  openDialog() {
    if (this.isDialogOpen) return

    this.isDialogOpen = true

    // Create dialog overlay
    const overlay = document.createElement('div')
    overlay.className = 'config-modal config-modal--open cheat-dialog-overlay'
    overlay.id = 'cheat-dialog-overlay'
    overlay.setAttribute('aria-hidden', 'false')

    // Create dialog
    const dialog = document.createElement('div')
    dialog.className = 'config-modal__dialog cheat-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')

    dialog.innerHTML = `
      <div class="config-modal__header">
        <div class="config-modal__title-group">
          <h2 class="cheat-dialog__title">🎮 Cheat Console</h2>
          <p class="cheat-dialog__subtitle">Enter a command and press execute to apply it.</p>
        </div>
        <button class="config-modal__close" id="cheat-close" aria-label="Close cheat console">×</button>
      </div>
      <div class="config-modal__body cheat-dialog__body">
        <div class="config-modal__field">
          <label for="cheat-input">Cheat code</label>
          <input
            type="text"
            class="cheat-input"
            id="cheat-input"
            placeholder="Enter cheat code..."
            autocomplete="off"
            spellcheck="false"
          >
        </div>
        <div class="config-modal__actions cheat-dialog__actions">
          <button class="config-modal__button config-modal__button--primary" id="cheat-submit" type="button">Execute</button>
          <button class="config-modal__button" id="cheat-close-secondary" type="button">Close</button>
        </div>
        <div class="config-modal__section cheat-dialog__help">
          <h3 class="config-modal__section-title">Available Cheat Codes</h3>
          <ul>
            <li><code>godmode on</code> / <code>godmode off</code> - Toggle invincibility for all units</li>
            <li><code>give [amount]</code> or <code>give [party] [amount]</code> - Add money (e.g., <code>give 10000</code>, <code>give red 5000</code>)</li>
            <li><code>money [amount]</code> - Set money to specific amount</li>
            <li><code>hp [amount]</code> or <code>hp [amount]%</code> - Set HP of selected unit(s)</li>
            <li><code>status</code> - Show current cheat status</li>
            <li><code>fuel [amount|percent%]</code> - Set fuel level of selected unit</li>
            <li><code>medics [amount]</code> - Set medic count of selected ambulance(s)</li>
            <li><code>ammo [value|percent%|+/-value|+/-percent%]</code> - Set or adjust ammo for selected units/buildings with ammo bars</li>
            <li><code>ammo load [amount|percent%]</code> - Set ammo cargo of selected ammunition trucks or ammo reserves of selected helipads and airstrips</li>
            <li><code>xp [amount]</code> / <code>xp +[amount]</code> / <code>xp -[amount]</code> - Set or adjust XP for selected combat units</li>
            <li><code>partyme [party]</code> - Switch your player party (reassigns your forces)</li>
            <li><code>party [color|player]</code> - Change party of selected unit(s)</li>
            <li><code>kill</code> - Destroy all selected units or buildings</li>
            <li><code>recover [party]</code> - Recover the selected wreck for a party (defaults to player)</li>
            <li><code>enemycontrol on</code> / <code>enemycontrol off</code> - Toggle enemy unit control</li>
            <li><code>driver</code> / <code>commander</code> / <code>loader</code> / <code>gunner</code> - Toggle crew for selected unit</li>
            <li title="Supported unit types: harvester, tank_v1, tank-v2, tank-v3, rocketTank, recoveryTank, ambulance, tankerTruck, ammunitionTruck, apache, howitzer, mineLayer, mineSweeper, f22Raptor"><code>[type] [amount] [party]</code> - Spawn units around the cursor. Defaults to the player's party</li>
            <li title="Supported building types include airstrip, helipad, powerPlant, oreRefinery, vehicleFactory, vehicleWorkshop, radarStation, hospital, gasStation, turret variants, and walls"><code>build [type] [party]</code> - Spawn a building near the cursor. Defaults to the player's party</li>
            <li><code>mine [party]</code> - Deploy a mine at the cursor for the specified party (defaults to player)</li>
            <li><code>mines [WxH][gG] [party]</code> or <code>WxHgG</code> - Drop a minefield pattern (e.g., <code>mines 2x3g1</code>, <code>3x1</code> for a continuous row) with optional gaps</li>
          </ul>
        </div>
      </div>
    `

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)
    document.body.classList.add('config-modal-open')

    // Focus input field
    const input = document.getElementById('cheat-input')
    input.focus()

    // Add event listeners
    this.setupDialogEventListeners(overlay, input)

    // Prevent game inputs while dialog is open
    this.pauseGameInput(true)
  }

  setupDialogEventListeners(overlay, input) {
    const submitBtn = document.getElementById('cheat-submit')
    const closeButtons = [
      document.getElementById('cheat-close'),
      document.getElementById('cheat-close-secondary')
    ].filter(Boolean)

    // Submit cheat code
    const submitCheat = () => {
      const code = input.value.trim()
      if (code) {
        this.processCheatCode(code)
        input.value = ''
      }
    }

    // Close dialog
    const closeDialog = () => {
      this.closeDialog()
    }

    // Event listeners
    submitBtn.addEventListener('click', submitCheat)
    closeButtons.forEach(button => {
      button.addEventListener('click', closeDialog)
    })

    // Enter key to submit
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submitCheat()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeDialog()
      }
    })

    // Click overlay to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog()
      }
    })
  }

  closeDialog() {
    if (!this.isDialogOpen) return

    const overlay = document.getElementById('cheat-dialog-overlay')
    if (overlay) {
      overlay.remove()
    }

    this.isDialogOpen = false
    document.body.classList.remove('config-modal-open')
    this.pauseGameInput(false)
  }

  pauseGameInput(paused) {
    // Store the original paused state and set our own
    if (paused) {
      this.originalPauseState = gameState.gamePaused
      gameState.cheatDialogOpen = true
    } else {
      gameState.cheatDialogOpen = false
    }
  }

  processCheatCode(code) {
    const normalizedCode = code.toLowerCase().trim()

    const mineFieldArgs = this.parseMineFieldCommand(normalizedCode)
    if (mineFieldArgs) {
      this.deployMineFieldPattern(mineFieldArgs)
      return
    }

    try {
      // God mode commands
      if (normalizedCode === 'godmode on' || normalizedCode === 'god on' || normalizedCode === 'invincible on') {
        this.enableGodMode()
      } else if (normalizedCode === 'godmode off' || normalizedCode === 'god off' || normalizedCode === 'invincible off') {
        this.disableGodMode()
      }
      // Building spawn command
      else if (normalizedCode.startsWith('build ')) {
        const buildingSpawn = this.parseBuildingSpawnCommand(code)
        if (!buildingSpawn) {
          this.showError('Invalid build command. Use: build [type] [party]')
          return
        }
        this.spawnBuildingAtCursor(buildingSpawn.buildingType, buildingSpawn.owner)
      }
      // Money commands
      else if (normalizedCode.startsWith('give ')) {
        const args = normalizedCode.substring(5).trim()
        if (!args) {
          this.showError('Invalid amount. Use: give [number] or give [party] [number]')
          return
        }

        const tokens = args.split(/\s+/)
        let owner = gameState.humanPlayer
        let amountTokens = tokens

        const potentialOwner = this.resolvePartyAlias(tokens[0])
        if (potentialOwner) {
          owner = potentialOwner
          amountTokens = tokens.slice(1)
        }

        const amountStr = amountTokens.join(' ')
        const amount = this.parseAmount(amountStr)

        if (amount !== null && amountTokens.length > 0) {
          const success = this.addMoney(amount, owner)
          if (!success) {
            this.showError('Unable to find the specified party for give command')
          }
        } else {
          this.showError('Invalid amount. Use: give [number] or give [party] [number]')
        }
      } else if (normalizedCode.startsWith('money ')) {
        const amount = this.parseAmount(normalizedCode.substring(6))
        if (amount !== null) {
          this.setMoney(amount)
        } else {
          this.showError('Invalid amount. Use: money [number]')
        }
      } else if (normalizedCode.startsWith('hp ')) {
        let raw = normalizedCode.substring(3).trim()
        let isPercent = false
        if (raw.endsWith('%')) {
          isPercent = true
          raw = raw.slice(0, -1)
        }
        const amount = this.parseAmount(raw)
        if (amount !== null) {
          this.setSelectedUnitsHP(amount, isPercent)
        } else {
          this.showError('Invalid amount. Use: hp [number] or hp [number]%')
        }
      } else if (normalizedCode.startsWith('fuel ')) {
        const parsed = this.parseFuelValue(code.substring(5))
        if (parsed) {
          this.setFuel(parsed)
        } else {
          this.showError('Invalid amount. Use: fuel [number] or fuel [percent%]')
        }
      } else if (normalizedCode.startsWith('medics ')) {
        const amount = this.parseAmount(normalizedCode.substring(7))
        if (amount !== null) {
          this.setSelectedAmbulanceMedics(amount)
        } else {
          this.showError('Invalid amount. Use: medics [number]')
        }
      } else if (normalizedCode.startsWith('ammo ')) {
        const ammoInput = normalizedCode.substring(5).trim()
        if (ammoInput.startsWith('load ')) {
          // Handle "ammo load [amount]" for ammo trucks
          const loadInput = ammoInput.substring(5).trim()
          const parsed = this.parseAmmoValue(loadInput)
          if (parsed) {
            this.setAmmoTruckLoad(parsed)
          } else {
            this.showError('Invalid amount. Use: ammo load [number], [percent%], +[number], -[number], +[percent%], or -[percent%]')
          }
        } else {
          // Handle "ammo [amount]" for selected units
          const parsed = this.parseAmmoValue(ammoInput)
          if (parsed) {
            this.setSelectedUnitsAmmo(parsed)
          } else {
            this.showError('Invalid amount. Use: ammo [number], [percent%], +[number], -[number], +[percent%], or -[percent%]')
          }
        }
      } else if (normalizedCode.startsWith('xp ')) {
        const parsed = this.parseExperienceValue(code.substring(3))
        if (parsed) {
          this.setSelectedUnitsExperience(parsed)
        } else {
          this.showError('Invalid amount. Use: xp [number], xp +[number], or xp -[number]')
        }
      } else if (normalizedCode === 'kill') {
        this.killSelectedTargets()
      } else if (normalizedCode.startsWith('recover')) {
        const tokens = normalizedCode.split(/\s+/).filter(Boolean)
        let owner = gameState.humanPlayer
        if (tokens.length > 1) {
          if (tokens.length > 2) {
            this.showError('Invalid recover command. Use: recover [party]')
            return
          }
          const resolvedOwner = this.resolvePartyAlias(tokens[1])
          if (!resolvedOwner) {
            this.showError('Unknown party. Use: red, green, blue, or yellow')
            return
          }
          owner = resolvedOwner
        }
        this.recoverSelectedWreck(owner)
      } else if (normalizedCode.split(/\s+/)[0] === 'mine') {
        const tokens = normalizedCode.split(/\s+/)
        let owner = gameState.humanPlayer
        if (tokens.length >= 2 && tokens[1]) {
          const resolvedOwner = this.resolvePartyAlias(tokens[1])
          if (!resolvedOwner) {
            this.showError('Unknown party. Use: red, green, blue, or yellow')
            return
          }
          owner = resolvedOwner
        }
        this.placeMineAtCursor(owner)
      } else {
        const spawn = this.parseSpawnCommand(code)
        if (spawn) {
          this.spawnUnitsAroundCursor(spawn.unitType, spawn.count, spawn.owner)
        } else if (normalizedCode.startsWith('partyme ')) {
          const target = normalizedCode.substring(8).trim()
          const owner = this.resolvePartyAlias(target)
          if (owner) {
            this.setPlayerParty(owner)
          } else {
            this.showError('Invalid party. Use: partyme [green|red|blue|yellow|player1|player2|player3|player4]')
          }
        } else if (normalizedCode.startsWith('party ')) {
          const target = normalizedCode.substring(6).trim()
          const owner = this.resolvePartyAlias(target)
          if (owner) {
            this.setSelectedParty(owner)
          } else {
            this.showError('Invalid party. Use: party [green|red|blue|yellow|player1|player2|player3|player4]')
          }
        } else if (normalizedCode === 'enemycontrol on') {
          this.enableEnemyControl()
        } else if (normalizedCode === 'enemycontrol off') {
          this.disableEnemyControl()
        } else if (['driver', 'commander', 'loader', 'gunner'].includes(normalizedCode)) {
          this.toggleCrewMember(normalizedCode)
        } else if (normalizedCode === 'status') {
          this.showStatus()
        } else {
          this.showError(`Unknown cheat code: "${code}"`)
        }
      }
    } catch (error) {
      console.error('Cheat system error:', error)
      this.showError('Error processing cheat code')
    }
  }

  parseAmount(amountStr) {
    const cleaned = amountStr.replace(/[,$]/g, '').trim()
    const amount = parseInt(cleaned, 10)
    return isNaN(amount) ? null : Math.max(0, amount)
  }

  parseFuelValue(input) {
    if (!input) return null
    const trimmed = input.trim()
    if (trimmed.endsWith('%')) {
      const percent = parseFloat(trimmed.slice(0, -1))
      if (isNaN(percent)) return null
      return { value: percent / 100, isPercent: true, display: `${percent}%` }
    }
    const amount = this.parseAmount(trimmed)
    if (amount === null) return null
    return { value: amount, isPercent: false, display: `${amount}` }
  }

  parseAmmoValue(input) {
    if (!input) return null
    const trimmed = input.trim()
    if (!trimmed) return null

    const prefix = trimmed[0]
    const isRelative = prefix === '+' || prefix === '-'
    const numericPart = isRelative ? trimmed.slice(1).trim() : trimmed
    if (!numericPart) return null

    const sign = prefix === '-' ? -1 : 1
    if (numericPart.endsWith('%')) {
      const percent = parseFloat(numericPart.slice(0, -1))
      if (isNaN(percent)) return null
      const displayPrefix = isRelative ? prefix : ''
      return { value: (percent / 100) * sign, isPercent: true, isRelative, display: `${displayPrefix}${percent}%` }
    }

    const amount = parseInt(numericPart.replace(/[,$]/g, ''), 10)
    if (isNaN(amount)) return null

    const signedAmount = amount * sign
    const displayPrefix = isRelative ? prefix : ''
    return { value: signedAmount, isPercent: false, isRelative, display: `${displayPrefix}${amount}` }
  }

  parseExperienceValue(input) {
    if (!input) return null
    const trimmed = input.trim()
    if (!trimmed) return null

    const prefix = trimmed[0]
    if (prefix === '+' || prefix === '-') {
      const amount = this.parseAmount(trimmed.slice(1))
      if (amount === null) return null
      const sign = prefix === '-' ? -1 : 1
      return {
        value: amount * sign,
        isRelative: true,
        display: `${prefix}${amount}`
      }
    }

    const amount = this.parseAmount(trimmed)
    if (amount === null) return null
    return { value: amount, isRelative: false, display: `${amount}` }
  }

  parseSpawnCommand(input) {
    if (!input) return null
    const tokens = input.trim().split(/\s+/)
    if (tokens.length === 0) return null
    const rawType = tokens[0]

    // Create a case-insensitive map of allowed unit types on first use
    if (!this.unitTypeMap) {
      this.unitTypeMap = Object.keys(UNIT_PROPERTIES).reduce((acc, key) => {
        acc[key.toLowerCase()] = key
        return acc
      }, {})
    }

    const unitType = this.unitTypeMap[rawType.toLowerCase()]
    if (!unitType) return null

    let count = 1
    let owner = gameState.humanPlayer
    if (tokens.length >= 2) {
      const maybeNum = parseInt(tokens[1], 10)
      if (!isNaN(maybeNum)) {
        count = Math.max(1, maybeNum)
        if (tokens.length >= 3) {
          owner = this.resolvePartyAlias(tokens[2]) || owner
        }
      } else {
        owner = this.resolvePartyAlias(tokens[1]) || owner
      }
    }
    return { unitType, count, owner }
  }

  parseBuildingSpawnCommand(input) {
    if (!input) return null
    const tokens = input.trim().split(/\s+/)
    if (tokens.length < 2 || tokens[0].toLowerCase() !== 'build') {
      return null
    }

    if (!this.buildingTypeMap) {
      this.buildingTypeMap = Object.keys(buildingData).reduce((acc, key) => {
        acc[key.toLowerCase()] = key
        return acc
      }, {})
    }

    const buildingType = this.buildingTypeMap[tokens[1].toLowerCase()]
    if (!buildingType) {
      return null
    }

    let owner = gameState.humanPlayer
    if (tokens.length >= 3) {
      owner = this.resolvePartyAlias(tokens[2]) || owner
    }

    return { buildingType, owner }
  }

  resolvePartyAlias(alias) {
    if (!alias) return null
    const map = {
      player1: 'player1',
      player2: 'player2',
      player3: 'player3',
      player4: 'player4',
      green: 'player1',
      red: 'player2',
      blue: 'player3',
      yellow: 'player4',
      player: 'player1',
      enemy: 'player2'
    }
    return map[alias.toLowerCase()] || null
  }

  getPartyDisplayName(owner) {
    const displayNames = {
      player1: 'Green (Player 1)',
      player2: 'Red (Player 2)',
      player3: 'Blue (Player 3)',
      player4: 'Yellow (Player 4)',
      player: 'Green (Player 1)',
      enemy: 'Red (Player 2)'
    }
    return displayNames[owner] || owner
  }

  isValidSpawnPosition(x, y) {
    const mapGrid = gameState.mapGrid
    if (
      x < 0 ||
      y < 0 ||
      y >= mapGrid.length ||
      x >= mapGrid[0].length
    ) {
      return false
    }

    const tile = mapGrid[y][x]
    if (tile.type !== 'land' && tile.type !== 'street') return false
    if (tile.seedCrystal) return false

    const occupied = units.some(
      u => Math.floor(u.x / TILE_SIZE) === x && Math.floor(u.y / TILE_SIZE) === y
    )
    return !occupied
  }

  findSpawnPositionNear(x, y) {
    if (this.isValidSpawnPosition(x, y)) return { x, y }

    for (let distance = 1; distance <= 5; distance++) {
      for (const dir of DIRECTIONS) {
        const nx = x + dir.x * distance
        const ny = y + dir.y * distance
        if (this.isValidSpawnPosition(nx, ny)) return { x: nx, y: ny }
      }
    }

    for (let distance = 6; distance <= MAX_SPAWN_SEARCH_DISTANCE; distance++) {
      for (let dx = -distance; dx <= distance; dx++) {
        for (let dy = -distance; dy <= distance; dy++) {
          if (Math.abs(dx) < distance && Math.abs(dy) < distance) continue
          const nx = x + dx
          const ny = y + dy
          if (this.isValidSpawnPosition(nx, ny)) return { x: nx, y: ny }
        }
      }
    }
    return null
  }

  spawnUnitsAroundCursor(unitType, count, owner) {
    const baseX = Math.floor(gameState.cursorX / TILE_SIZE)
    const baseY = Math.floor(gameState.cursorY / TILE_SIZE)

    let spawned = 0
    const spawnedRecoveryTanks = []

    for (let i = 0; i < count; i++) {
      const pos = this.findSpawnPositionNear(baseX, baseY)
      if (!pos) break
      const newUnit = createUnit({ id: owner }, unitType, pos.x, pos.y)
      units.push(newUnit)

      // Update the occupancy map for the newly spawned unit
      // Avoid double incrementing the spawn tile by letting
      // updateUnitOccupancy handle the addition.
      updateUnitOccupancy(newUnit, -1, -1, gameState.occupancyMap)
      this.updateNewUnit(newUnit)

      // Special initialization for recovery tanks
      if (unitType === 'recoveryTank' && owner !== gameState.humanPlayer) {
        newUnit.lastRecoveryCommandTime = 0
        newUnit.freshlySpawned = true
        newUnit.holdInFactory = false
        newUnit.spawnedInFactory = false
        spawnedRecoveryTanks.push(newUnit)
      }

      spawned++
    }

    if (spawned > 0) {
      showNotification(
        `🚀 Spawned ${spawned} ${unitType}${spawned > 1 ? 's' : ''} for ${owner}`,
        3000
      )

      // Trigger immediate assignment for enemy recovery tanks
      if (spawnedRecoveryTanks.length > 0) {
        // Dynamically import and call the recovery tank management
        import('../ai/enemyStrategies.js').then(module => {
          const { manageAIRecoveryTanks } = module
          const now = performance?.now ? performance.now() : Date.now()

          // Multiple attempts to ensure assignment
          setTimeout(() => manageAIRecoveryTanks(units, gameState, gameState.mapGrid, now), 50)
          setTimeout(() => manageAIRecoveryTanks(units, gameState, gameState.mapGrid, now), 200)
          setTimeout(() => manageAIRecoveryTanks(units, gameState, gameState.mapGrid, now), 500)

          window.logger(`✓ Triggered immediate recovery tank assignment for ${spawnedRecoveryTanks.length} cheat-spawned tanks`)
        }).catch(err => {
          console.error('Failed to load recovery tank management:', err)
        })
      }
    } else {
      this.showError('No valid spawn position found')
    }
  }

  isValidBuildingSpawnPosition(type, tileX, tileY) {
    const mapGrid = gameState.mapGrid
    const occupancyMap = gameState.occupancyMap
    const data = buildingData[type]

    if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !data) {
      return false
    }

    const width = data.width
    const height = data.height
    const mapHeight = mapGrid.length
    const mapWidth = mapGrid[0]?.length || 0

    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX + width > mapWidth ||
      tileY + height > mapHeight
    ) {
      return false
    }

    for (let y = tileY; y < tileY + height; y++) {
      for (let x = tileX; x < tileX + width; x++) {
        const tile = mapGrid[y]?.[x]
        if (!tile) return false
        if (tile.type !== 'land' && tile.type !== 'street') return false
        if (tile.seedCrystal || tile.building) return false

        if (occupancyMap?.[y]?.[x] > 0) return false

        const occupiedByUnit = units.some(unit =>
          Math.floor(unit.x / TILE_SIZE) === x && Math.floor(unit.y / TILE_SIZE) === y
        )
        if (occupiedByUnit) return false
      }
    }

    return true
  }

  findBuildingSpawnPositionNear(type, baseX, baseY) {
    if (this.isValidBuildingSpawnPosition(type, baseX, baseY)) {
      return { x: baseX, y: baseY }
    }

    for (let distance = 1; distance <= MAX_SPAWN_SEARCH_DISTANCE; distance++) {
      for (let dx = -distance; dx <= distance; dx++) {
        for (let dy = -distance; dy <= distance; dy++) {
          if (Math.abs(dx) < distance && Math.abs(dy) < distance) continue
          const candidateX = baseX + dx
          const candidateY = baseY + dy
          if (this.isValidBuildingSpawnPosition(type, candidateX, candidateY)) {
            return { x: candidateX, y: candidateY }
          }
        }
      }
    }

    return null
  }

  spawnBuildingAtCursor(type, owner) {
    const baseX = Math.floor(gameState.cursorX / TILE_SIZE)
    const baseY = Math.floor(gameState.cursorY / TILE_SIZE)
    const position = this.findBuildingSpawnPositionNear(type, baseX, baseY)

    if (!position) {
      this.showError(`No valid spawn position found for building type ${type}`)
      return
    }

    const building = createBuilding(type, position.x, position.y)
    if (!building) {
      this.showError(`Unknown building type: ${type}`)
      return
    }

    building.owner = owner || gameState.humanPlayer
    building.health = building.maxHealth
    building.constructionFinished = true
    building.constructionStartTime = 0

    placeBuilding(building, gameState.mapGrid, gameState.occupancyMap, { recordTransition: false })

    if (!Array.isArray(gameState.buildings)) {
      gameState.buildings = []
    }
    gameState.buildings.push(building)

    updatePowerSupply(gameState.buildings, gameState)
    showNotification(
      `🏗️ Spawned ${type} for ${this.getPartyDisplayName(building.owner)}`,
      3000
    )
    playSound('confirmed', 0.5)
  }

  placeMineAtCursor(owner) {
    const tileX = Math.floor(gameState.cursorX / TILE_SIZE)
    const tileY = Math.floor(gameState.cursorY / TILE_SIZE)
    const targetOwner = owner || gameState.humanPlayer
    const result = this.tryDeployMineAt(tileX, tileY, targetOwner)

    if (!result.success) {
      this.showError(result.reason || 'Cannot place a mine here')
      return
    }

    showNotification(`💣 Mine deployed for ${this.getPartyDisplayName(targetOwner)}`, 3000)
    playSound('confirmed', 0.5)
  }

  deployMineFieldPattern({ width, height, gap, owner }) {
    const baseX = Math.floor(gameState.cursorX / TILE_SIZE)
    const baseY = Math.floor(gameState.cursorY / TILE_SIZE)
    let placed = 0
    let skipped = 0
    const skipReasons = new Set()
    const patternOwner = owner || gameState.humanPlayer

    for (let row = 0; row < height; row++) {
      const targetY = baseY + row * (1 + gap)
      for (let col = 0; col < width; col++) {
        const targetX = baseX + col * (1 + gap)
        const result = this.tryDeployMineAt(targetX, targetY, patternOwner)
        if (result.success) {
          placed++
        } else {
          skipped++
          if (result.reason) {
            skipReasons.add(result.reason)
          }
        }
      }
    }

    const ownerLabel = this.getPartyDisplayName(patternOwner)
    if (placed > 0) {
      let message = `💣 Deployed ${placed} mine${placed === 1 ? '' : 's'} for ${ownerLabel}`
      if (skipped > 0) {
        message += ` (+${skipped} skipped` +
          (skipReasons.size > 0 ? `: ${[...skipReasons].join(', ')}` : '') +
          ')'
      }
      showNotification(message, 4000)
      playSound('confirmed', 0.5)
    } else {
      const reason = skipReasons.values().next().value || 'No valid tiles available'
      this.showError(`No mines placed (${reason})`)
    }
  }

  parseMineFieldCommand(input) {
    const tokens = input.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return null

    let patternToken = tokens[0]
    if (patternToken === 'mines') {
      tokens.shift()
      if (tokens.length === 0) return null
      patternToken = tokens.shift()
    } else {
      tokens.shift()
    }

    const pattern = this.parseMineFieldPattern(patternToken)
    if (!pattern) return null

    const ownerAlias = tokens.length > 0 ? tokens[0] : null
    const owner = this.resolvePartyAlias(ownerAlias) || gameState.humanPlayer

    return { ...pattern, owner }
  }

  parseMineFieldPattern(token) {
    if (!token) return null
    const match = token.match(/^(\d+)x(\d+)(?:g(\d+))?$/)
    if (!match) return null
    const width = Math.max(1, parseInt(match[1], 10))
    const height = Math.max(1, parseInt(match[2], 10))
    const gap = match[3] ? Math.max(0, parseInt(match[3], 10)) : 0
    return { width, height, gap }
  }

  tryDeployMineAt(tileX, tileY, owner) {
    const mapGrid = gameState.mapGrid
    if (!Array.isArray(mapGrid) || mapGrid.length === 0) {
      return { success: false, reason: 'Map is not ready for mine placement' }
    }

    const mapWidth = mapGrid[0].length
    const mapHeight = mapGrid.length
    if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) {
      return { success: false, reason: 'Cursor is outside playable terrain' }
    }

    const tile = mapGrid[tileY][tileX]
    if (!tile || tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal || tile.building) {
      return { success: false, reason: 'Cannot place a mine on this tile' }
    }

    const mine = deployMine(tileX, tileY, owner)
    if (!mine) {
      return { success: false, reason: 'A mine already exists on this tile' }
    }

    return { success: true, mine }
  }

  enableGodMode() {
    if (this.godModeEnabled) {
      showNotification('🛡️ God mode is already enabled', 3000)
      return
    }

    this.godModeEnabled = true
    this.originalHealthValues.clear()
    this.godModeUnits.clear()

    // Store original health values and set all units to invincible
    units.forEach(unit => {
      if (unit.owner === gameState.humanPlayer) {
        this.originalHealthValues.set(unit.id, {
          health: unit.health,
          maxHealth: unit.maxHealth
        })

        this.godModeUnits.add(unit.id)

        // Set to maximum health and make effectively invincible
        unit.health = unit.maxHealth
        unit.isInvincible = true
      }
    })

    showNotification('🛡️ God mode ENABLED - All player units are now invincible!', 4000)
  }

  disableGodMode() {
    if (!this.godModeEnabled) {
      showNotification('🛡️ God mode is already disabled', 3000)
      return
    }

    this.godModeEnabled = false

    // Restore original health values
    units.forEach(unit => {
      if (unit.owner === gameState.humanPlayer) {
        const originalValues = this.originalHealthValues.get(unit.id)
        if (originalValues) {
          unit.health = Math.min(originalValues.health, unit.maxHealth)
        }
        unit.isInvincible = false
      }
    })

    this.originalHealthValues.clear()
    this.godModeUnits.clear()
    showNotification('🛡️ God mode DISABLED - Units are now vulnerable', 4000)
  }

  addMoney(amount, owner = gameState.humanPlayer) {
    if (!owner || owner === gameState.humanPlayer) {
      gameState.money += amount
      gameState.totalMoneyEarned += amount

      showNotification(`💰 Added $${amount.toLocaleString()} (Total: $${gameState.money.toLocaleString()})`, 3000)
      playSound('deposit', 0.8)
      if (productionQueue && typeof productionQueue.tryResumeProduction === 'function') {
        productionQueue.tryResumeProduction()
      }
      return true
    }

    const targetFactory = Array.isArray(gameState.factories)
      ? gameState.factories.find(factory => (factory.owner || factory.id) === owner)
      : null

    if (targetFactory && typeof targetFactory.budget === 'number') {
      targetFactory.budget += amount

      showNotification(
        `💰 Added $${amount.toLocaleString()} to ${this.getPartyDisplayName(owner)} ` +
        `(Total: $${Math.round(targetFactory.budget).toLocaleString()})`,
        3000
      )
      playSound('deposit', 0.8)
      return true
    }

    return false
  }

  setMoney(amount) {
    gameState.money = amount

    showNotification(`💰 Money set to $${amount.toLocaleString()}`, 3000)
    playSound('deposit', 0.8)
    if (productionQueue && typeof productionQueue.tryResumeProduction === 'function') {
      productionQueue.tryResumeProduction()
    }
  }

  setFuel(parsed) {
    const { value, isPercent, display } = parsed

    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    this.selectedUnits.forEach(unit => {
      if (typeof unit.maxGas === 'number') {
        const target = isPercent ? unit.maxGas * value : value
        const clamped = Math.max(0, Math.min(target, unit.maxGas))
        unit.gas = clamped
        if (clamped > 0) unit.outOfGasPlayed = false
      }
    })

    showNotification(`⛽ Fuel set to ${display} for ${this.selectedUnits.length} unit${this.selectedUnits.length > 1 ? 's' : ''}`,
      3000)
    playSound('confirmed', 0.5)
  }

  setSelectedAmbulanceMedics(amount) {
    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    let appliedCount = 0
    this.selectedUnits.forEach(unit => {
      if (unit.type === 'ambulance' && typeof unit.maxMedics === 'number') {
        const clamped = Math.min(Math.max(amount, 0), unit.maxMedics)
        unit.medics = clamped
        appliedCount++
      }
    })

    if (appliedCount > 0) {
      showNotification(`🚑 Medics set to ${amount} for ${appliedCount} ambulance${appliedCount > 1 ? 's' : ''}`, 3000)
      playSound('confirmed', 0.5)
    } else {
      this.showError('No ambulances selected')
    }
  }

  setSelectedUnitsAmmo(parsed) {
    const { value, isPercent, isRelative = false, display } = parsed

    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    let appliedCount = 0
    this.selectedUnits.forEach(unit => {
      if (unit.type === 'apache' && typeof unit.maxRocketAmmo === 'number') {
        const currentAmmo = typeof unit.rocketAmmo === 'number' ? unit.rocketAmmo : unit.maxRocketAmmo
        const deltaOrTarget = isPercent ? unit.maxRocketAmmo * value : value
        const target = isRelative ? currentAmmo + deltaOrTarget : deltaOrTarget
        const clamped = Math.max(0, Math.min(target, unit.maxRocketAmmo))
        unit.rocketAmmo = clamped
        if (typeof unit.maxAmmunition === 'number') {
          unit.ammunition = clamped
        }
        unit.apacheAmmoEmpty = clamped === 0
        unit.canFire = clamped > 0
        if (clamped > 0) {
          unit.noAmmoNotificationShown = false
        }
        appliedCount++
      } else if (typeof unit.maxAmmunition === 'number') {
        const currentAmmo = typeof unit.ammunition === 'number' ? unit.ammunition : unit.maxAmmunition
        const deltaOrTarget = isPercent ? unit.maxAmmunition * value : value
        const target = isRelative ? currentAmmo + deltaOrTarget : deltaOrTarget
        const clamped = Math.max(0, Math.min(target, unit.maxAmmunition))
        unit.ammunition = clamped
        if (clamped > 0) unit.noAmmoNotificationShown = false // Reset notification flag
        appliedCount++
      } else if (typeof unit.maxAmmo === 'number') {
        const currentAmmo = typeof unit.ammo === 'number' ? unit.ammo : unit.maxAmmo
        const deltaOrTarget = isPercent ? unit.maxAmmo * value : value
        const target = isRelative ? currentAmmo + deltaOrTarget : deltaOrTarget
        const clamped = Math.max(0, Math.min(target, unit.maxAmmo))
        unit.ammo = clamped
        appliedCount++
      }
    })

    if (appliedCount > 0) {
      const verb = isRelative ? 'adjusted by' : 'set to'
      showNotification(`🔫 Ammo ${verb} ${display} for ${appliedCount} item${appliedCount > 1 ? 's' : ''}`, 3000)
      playSound('confirmed', 0.5)
    } else {
      this.showError('No selected units or buildings with ammunition found')
    }
  }

  setAmmoTruckLoad(parsed) {
    const { value, isPercent, isRelative, display } = parsed

    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    let appliedCount = 0
    this.selectedUnits.forEach(unit => {
      if (unit.type === 'ammunitionTruck') {
        // Ensure maxAmmoCargo is set (safety check)
        if (typeof unit.maxAmmoCargo !== 'number') {
          unit.maxAmmoCargo = 500 // Default AMMO_TRUCK_CARGO value
        }

        const currentLoad = typeof unit.ammoCargo === 'number' ? unit.ammoCargo : 0
        const deltaOrTarget = isPercent ? unit.maxAmmoCargo * value : value
        const target = isRelative ? currentLoad + deltaOrTarget : deltaOrTarget
        const clamped = Math.max(0, Math.min(target, unit.maxAmmoCargo))
        unit.ammoCargo = clamped
        appliedCount++
      } else if (unit.type === 'helipad' || unit.type === 'airstrip') {
        // Handle helipad/airstrip ammo reserves
        if (typeof unit.maxAmmo !== 'number') {
          unit.maxAmmo = HELIPAD_AMMO_RESERVE
        }

        const currentAmmo = typeof unit.ammo === 'number' ? unit.ammo : unit.maxAmmo
        const deltaOrTarget = isPercent ? unit.maxAmmo * value : value
        const target = isRelative ? currentAmmo + deltaOrTarget : deltaOrTarget
        const clamped = Math.max(0, Math.min(target, unit.maxAmmo))
        unit.ammo = clamped
        appliedCount++
      }
    })

    if (appliedCount > 0) {
      const verb = isRelative ? 'adjusted by' : 'set to'
      showNotification(`🚛 Ammo load ${verb} ${display} for ${appliedCount} item${appliedCount > 1 ? 's' : ''}`, 3000)
      playSound('confirmed', 0.5)
    } else {
      this.showError('No ammunition trucks, helipads, or airstrips selected')
    }
  }

  setSelectedUnitsExperience(parsed) {
    const { value, isRelative, display } = parsed

    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    let appliedCount = 0
    this.selectedUnits.forEach(unit => {
      if (!unit || unit.type === 'harvester') return

      initializeUnitLeveling(unit)

      const nextExperience = isRelative
        ? Math.max(0, (unit.experience || 0) + value)
        : Math.max(0, value)

      unit.experience = nextExperience
      checkLevelUp(unit)
      appliedCount++
    })

    if (appliedCount > 0) {
      showNotification(`⭐ XP ${isRelative ? 'adjusted by' : 'set to'} ${display} for ${appliedCount} unit${appliedCount > 1 ? 's' : ''}`, 3000)
      playSound('confirmed', 0.5)
    } else {
      this.showError('No combat units selected')
    }
  }

  enableEnemyControl() {
    if (ENABLE_ENEMY_CONTROL) {
      showNotification('Enemy control already enabled', 3000)
      return
    }
    setEnemyControlEnabled(true)
    showNotification('Enemy control ENABLED', 3000)
  }

  disableEnemyControl() {
    if (!ENABLE_ENEMY_CONTROL) {
      showNotification('Enemy control already disabled', 3000)
      return
    }
    setEnemyControlEnabled(false)
    showNotification('Enemy control DISABLED', 3000)
  }

  showStatus() {
    const statusLines = [
      `💰 Money: $${gameState.money.toLocaleString()}`,
      `🛡️ God Mode: ${this.godModeEnabled ? 'ENABLED' : 'DISABLED'}`,
      `👥 Player Units: ${units.filter(u => u.owner === gameState.humanPlayer).length}`,
      `🤖 AI Units: ${units.filter(u => u.owner !== gameState.humanPlayer).length}`,
      `🏭 Player Buildings: ${gameState.buildings.filter(b => b.owner === gameState.humanPlayer).length}`,
      `🎮 Enemy Control: ${ENABLE_ENEMY_CONTROL ? 'ENABLED' : 'DISABLED'}`
    ]

    showNotification(statusLines.join('\n'), 5000)
  }

  setSelectedUnitsRef(selectedUnits) {
    this.selectedUnits = selectedUnits
  }

  setSelectedUnitsHP(amount, isPercent = false) {
    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    let appliedCount = 0
    this.selectedUnits.forEach(unit => {
      if (!unit || unit.maxHealth === undefined) return
      let newHp = amount
      if (isPercent) {
        newHp = Math.round(unit.maxHealth * (amount / 100))
      }
      const clamped = Math.min(Math.max(newHp, 0), unit.maxHealth)
      unit.health = clamped
      updateUnitSpeedModifier(unit)
      appliedCount++
    })

    if (appliedCount > 0) {
      const label = isPercent ? `${amount}%` : `${amount}`
      showNotification(`❤ Set HP to ${label} for ${appliedCount} unit(s)`, 3000)
    }
  }

  setSelectedParty(owner) {
    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    let changed = 0
    this.selectedUnits.forEach(unit => {
      if (!unit || unit.owner === undefined) return
      unit.owner = owner
      // Update god mode tracking when ownership changes
      if (this.godModeEnabled && unit.id) {
        if (owner === gameState.humanPlayer) {
          this.godModeUnits.add(unit.id)
        } else {
          this.godModeUnits.delete(unit.id)
        }
      }
      changed++
    })

    if (changed > 0) {
      if (Array.isArray(gameState.buildings) && gameState.buildings.length > 0) {
        updatePowerSupply(gameState.buildings, gameState)
      }
      showNotification(`🎨 Changed party to ${owner} for ${changed} item(s)`, 3000)
    }
  }

  setPlayerParty(owner) {
    const previousOwner = gameState.humanPlayer
    gameState.humanPlayer = owner

    const updateOwner = (entity) => {
      if (entity && typeof entity.owner !== 'undefined') {
        entity.owner = owner
      }
      if (entity && typeof entity.id !== 'undefined' && entity.id === previousOwner) {
        entity.id = owner
      }
    }

    if (Array.isArray(gameState.units)) {
      gameState.units.forEach(updateOwner)
    }
    units.forEach(updateOwner)

    if (Array.isArray(gameState.buildings)) {
      gameState.buildings.forEach(updateOwner)
    }
    factories.forEach(updateOwner)

    updatePowerSupply(gameState.buildings, gameState)
    showNotification(`🛡️ Switched player party to ${owner}`, 3200)
  }

  killSelectedTargets() {
    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    const targets = [...this.selectedUnits]
    let destroyedUnits = 0
    let destroyedBuildings = 0

    targets.forEach(target => {
      if (!target || typeof target.health !== 'number') return

      const alreadyDestroyed = target.health <= 0 || target.destroyed === true
      if (alreadyDestroyed) return

      if (target.isBuilding) {
        destroyedBuildings++
      } else {
        destroyedUnits++
      }

      target.health = 0
      target.destroyed = true
      if (target.selected) {
        target.selected = false
      }
    })

    const totalDestroyed = destroyedUnits + destroyedBuildings
    if (totalDestroyed === 0) {
      this.showError('No valid targets selected')
      return
    }

    this.selectedUnits.length = 0

    if (gameState) {
      gameState.selectionActive = false
      gameState.selectionStart = { x: 0, y: 0 }
      gameState.selectionEnd = { x: 0, y: 0 }
    }

    const parts = []
    if (destroyedUnits > 0) {
      parts.push(`${destroyedUnits} unit${destroyedUnits === 1 ? '' : 's'}`)
    }
    if (destroyedBuildings > 0) {
      parts.push(`${destroyedBuildings} building${destroyedBuildings === 1 ? '' : 's'}`)
    }

    showNotification(`💥 Destroyed ${parts.join(' and ')}`, 4000)
    playSound('explosion', 0.7)
  }

  recoverSelectedWreck(owner = gameState.humanPlayer) {
    if (!gameState.selectedWreckId) {
      this.showError('No wreck selected')
      return
    }

    const wreck = getWreckById(gameState, gameState.selectedWreckId)
    if (!wreck) {
      this.showError('Selected wreck not found')
      return
    }

    if (wreck.isBeingRestored || wreck.isBeingRecycled) {
      this.showError('Selected wreck is already being processed')
      return
    }

    const clearRecoveryTankState = (tankId) => {
      if (!tankId) return
      const tank = units.find(unit => unit.id === tankId)
      if (!tank) return
      if (tank.towedWreck && tank.towedWreck.id === wreck.id) {
        tank.towedWreck = null
      }
      if (tank.recoveryTask && tank.recoveryTask.wreckId === wreck.id) {
        tank.recoveryTask = null
        tank.recoveryProgress = 0
      }
    }

    clearRecoveryTankState(wreck.towedBy)
    clearRecoveryTankState(wreck.assignedTankId)

    const spawnTileX = Math.floor((wreck.x + TILE_SIZE / 2) / TILE_SIZE)
    const spawnTileY = Math.floor((wreck.y + TILE_SIZE / 2) / TILE_SIZE)
    const restored = createUnit(
      { owner },
      wreck.unitType,
      spawnTileX,
      spawnTileY,
      {
        worldPosition: { x: wreck.x, y: wreck.y },
        buildDuration: wreck.buildDuration
      }
    )
    restored.isRestoredFromWreck = true

    restored.health = restored.maxHealth
    restored.direction = wreck.direction || restored.direction
    if (restored.turretDirection !== undefined) {
      restored.turretDirection = wreck.turretDirection || restored.direction
    }

    units.push(restored)

    updateUnitOccupancy(restored, -1, -1, gameState.occupancyMap)
    this.updateNewUnit(restored)

    removeWreckById(gameState, wreck.id)

    showNotification(`🛠️ Recovered ${wreck.unitType} for ${this.getPartyDisplayName(owner)}`, 3500)
    playSound('repairFinished', 0.7)
  }

  showError(message) {
    showNotification(`❌ ${message}`, 3000)
    playSound('error', 0.5)
  }

  // Hook into unit damage to prevent damage when god mode is enabled
  preventDamage(target, damage) {
    if (!this.godModeEnabled) return damage

    // Handle units
    if (target.owner === gameState.humanPlayer && target.id && this.godModeUnits.has(target.id)) {
      return 0 // Prevent all damage to player units
    }

    // Handle buildings (buildings have owner but different structure)
    if (target.owner === gameState.humanPlayer && target.type && !target.id) {
      return 0 // Prevent all damage to player buildings
    }

    // Handle factories (factories use id as human player ID)
    if (target.id === gameState.humanPlayer) {
      return 0 // Prevent all damage to player factory
    }

    return damage // Allow normal damage
  }

  // Update god mode for new units
  updateNewUnit(unit) {
    if (this.godModeEnabled && unit.owner === gameState.humanPlayer) {
      unit.isInvincible = true
      this.godModeUnits.add(unit.id)
      this.originalHealthValues.set(unit.id, {
        health: unit.health,
        maxHealth: unit.maxHealth
      })
    }
  }

  // Clean up dead units from tracking
  cleanupDestroyedUnit(unitId) {
    this.originalHealthValues.delete(unitId)
    this.godModeUnits.delete(unitId)
  }

  /**
   * Remove a unit from god mode tracking when it's destroyed
   * @param {string} unitId - The ID of the unit to remove
   */
  removeUnitFromTracking(unitId) {
    this.godModeUnits.delete(unitId)
    this.originalHealthValues.delete(unitId)
  }

  /**
   * Check if god mode is currently active
   * @returns {boolean} True if god mode is active
   */
  isGodModeActive() {
    return this.godModeEnabled
  }

  /**
   * Add a unit to god mode protection
   * @param {Object} unit - The unit to add to god mode
   */
  addUnitToGodMode(unit) {
    if (this.godModeEnabled && unit.id) {
      this.godModeUnits.add(unit.id)
      // Store original health if not already stored
      if (!this.originalHealthValues.has(unit.id)) {
        this.originalHealthValues.set(unit.id, {
          health: unit.health,
          maxHealth: unit.maxHealth
        })
      }
      unit.isInvincible = true
    }
  }

  toggleCrewMember(role) {
    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showError('No unit selected')
      return
    }

    this.selectedUnits.forEach(unit => {
      if (unit.crew && typeof unit.crew === 'object' && role in unit.crew) {
        unit.crew[role] = !unit.crew[role]

        if (!unit.crew[role] && unit.owner === gameState.humanPlayer) {
          playSound('our' + role.charAt(0).toUpperCase() + role.slice(1) + 'IsOut')
        }

        const state = unit.crew[role] ? 'restored' : 'removed'
        showNotification(`${role} ${state}`, 2000)
      }
    })
  }
}
