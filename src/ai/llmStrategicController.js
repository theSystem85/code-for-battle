import { exportGameTickInput } from '../ai-api/exporter.js'
import { applyGameTickOutput } from '../ai-api/applier.js'
import { getLlmSettings, updateLlmSettings, getProviderSettings } from './llmSettings.js'
import { fetchCostMap, getModelCostInfo, requestLlmCompletion, QuotaExceededError, AuthenticationError, ApiParameterError } from './llmProviders.js'
import { recordLlmUsage } from './llmUsage.js'
import { showNotification } from '../ui/notifications.js'
import { isHost } from '../network/gameCommandSync.js'
import { gameState } from '../gameState.js'
import { TILE_SIZE, UNIT_COSTS, UNIT_PROPERTIES, BULLET_DAMAGES, UNIT_AMMO_CAPACITY, UNIT_GAS_PROPERTIES, TANK_FIRE_RANGE, HOWITZER_FIRE_RANGE, HOWITZER_MIN_RANGE, HOWITZER_FIREPOWER, HOWITZER_FIRE_COOLDOWN, PARTY_COLORS } from '../config.js'
import { buildingData } from '../data/buildingData.js'
import protocolSchema from '../ai-api/protocol.schema.json'

function buildUnitCatalog() {
  const catalog = []
  const allTypes = ['tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'harvester', 'ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank', 'howitzer', 'apache', 'mineLayer', 'mineSweeper', 'f22Raptor']
  for (const type of allTypes) {
    const props = UNIT_PROPERTIES[type] || {}
    const cost = UNIT_COSTS[type] || 0
    const ammo = UNIT_AMMO_CAPACITY[type] || null
    const gas = UNIT_GAS_PROPERTIES[type] || {}
    const dmg = BULLET_DAMAGES[type.replace('-', '_').replace('tank_v1', 'tank_v1').replace('tank-v2', 'tank_v2').replace('tank-v3', 'tank_v3')] || null
    const entry = {
      type,
      cost,
      hp: props.health || props.maxHealth || 0,
      speed: props.speed || 0,
      armor: props.armor || 0
    }
    if (ammo) entry.ammo = ammo
    if (dmg) entry.damage = dmg
    if (gas.tankSize) entry.fuelCapacity = gas.tankSize
    // Weapon / range info
    if (type === 'howitzer') {
      entry.weapon = 'artillery'
      entry.fireRange = HOWITZER_FIRE_RANGE
      entry.minRange = HOWITZER_MIN_RANGE
      entry.firepower = HOWITZER_FIREPOWER
      entry.fireCooldownMs = HOWITZER_FIRE_COOLDOWN
    } else if (type === 'rocketTank') {
      entry.weapon = 'rocket'
      entry.fireRange = TANK_FIRE_RANGE
    } else if (type === 'apache') {
      entry.weapon = 'machinegun'
      entry.fireRange = TANK_FIRE_RANGE
      entry.spawnsFrom = 'helipad'
    } else if (type === 'f22Raptor') {
      entry.weapon = 'missile'
      entry.fireRange = TANK_FIRE_RANGE * 1.5
      entry.spawnsFrom = 'airstrip'
      entry.radarInvisible = true
    } else if (['tank_v1', 'tank-v2', 'tank-v3'].includes(type)) {
      entry.weapon = 'cannon'
      entry.fireRange = TANK_FIRE_RANGE
    }
    // Spawn location
    if (type !== 'apache' && type !== 'f22Raptor') entry.spawnsFrom = 'vehicleFactory'
    // Special roles
    if (type === 'harvester') entry.role = 'economic: harvests ore and delivers to refinery'
    if (type === 'ambulance') entry.role = 'support: heals nearby friendly units'
    if (type === 'tankerTruck') entry.role = 'support: refuels nearby units'
    if (type === 'ammunitionTruck') entry.role = 'support: resupplies ammo to nearby units'
    if (type === 'recoveryTank') entry.role = 'support: tows damaged units to workshop for repair'
    if (type === 'mineLayer') entry.role = 'utility: deploys anti-vehicle mines'
    if (type === 'mineSweeper') entry.role = 'utility: clears enemy mines'
    catalog.push(entry)
  }
  return catalog
}

function buildBuildingCatalog() {
  const catalog = []
  for (const [type, data] of Object.entries(buildingData)) {
    if (type.startsWith('concreteWall')) continue // skip wall variants
    const entry = {
      type,
      displayName: data.displayName || type,
      cost: data.cost || 0,
      power: data.power || 0,
      hp: data.health || 0,
      size: `${data.width}x${data.height}`
    }
    if (data.armor) entry.armor = data.armor
    if (data.fireRange) {
      entry.weapon = data.projectileType || 'bullet'
      entry.fireRange = data.fireRange
      entry.damage = data.damage || 0
      entry.fireCooldownMs = data.fireCooldown || 0
      if (data.burstCount) entry.burst = `${data.burstCount} shots/${data.burstDelay}ms`
      if (data.minFireRange) entry.minRange = data.minFireRange
    }
    if (data.requiresRadar) entry.requires = 'radarStation'
    if (data.requiresVehicleFactory) entry.requires = 'vehicleFactory'
    catalog.push(entry)
  }
  // Add concrete wall once
  const wall = buildingData.concreteWall
  if (wall) {
    catalog.push({ type: 'concreteWall', displayName: 'Concrete Wall', cost: wall.cost, power: 0, hp: wall.health, size: '1x1' })
  }
  return catalog
}

const UNIT_CATALOG_TEXT = JSON.stringify(buildUnitCatalog(), null, 0)
const BUILDING_CATALOG_TEXT = JSON.stringify(buildBuildingCatalog(), null, 0)

const STRATEGIC_BOOTSTRAP_PROMPT = `You are the strategic commander for the enemy AI in a real-time strategy game.
Your job: plan economy, production, expansion, and attacks to defeat the human player. Keep actions practical, achievable, and within budget.

GAME OVERVIEW
- Tile-based RTS with base building, unit production, and combat.
- You control one enemy player. The human player is the opponent.
- Buildings unlock tech and produce units. Units can move, attack, and guard.
- You can place buildings on valid tiles, queue units at the right factory, and issue unit commands.
- The engine executes only explicit actions you output.
- BUILDING PLACEMENT RULE (CRITICAL): New buildings MUST be placed within 3 tiles (Chebyshev distance) of an existing building you own. Buildings placed far from your base WILL BE REJECTED. Always expand outward from your construction yard, placing each new building adjacent to or near your existing structures.
- Each unit and building has an "owner" field identifying which player controls it.
- Your units will still auto-attack enemies within their fire range even between your ticks, but you should issue explicit commands for strategic movements and coordinated attacks.
- Consider retreating damaged units to regroup before launching full-scale attacks. A well-coordinated strike with sufficient firepower is better than trickling units into enemy defenses.
- You only see the battlefield where your own units and buildings provide vision. Data in the snapshot is limited to what is visible to you (fog of war).

ECONOMY & MONEY SUPPLY (CRITICAL!)
- Money is the ONLY resource. You start with a limited budget that WILL run out if you don't establish income.
- Income comes from harvesters mining ore and delivering it to an ore refinery. Without at least 1 refinery AND 1 harvester, you have ZERO income.
- ALWAYS prioritize building a power plant first, then an ore refinery, then a vehicle factory, then produce a harvester. This is the minimum viable economy.
- Only after you have a working economy (harvester actively mining) should you invest in military.
- Monitor your money closely. If money is below 2000 and you have no harvester or refinery, you are in an economic emergency — sell non-essential buildings to fund recovery.
- A tank rush without economy will fail once your starting money runs out.

TECH TREE (CRITICAL — FOLLOW THIS ORDER!)
- You start with only: constructionYard, oreRefinery, powerPlant, vehicleFactory, vehicleWorkshop, radarStation, hospital, helipad, gasStation, turretGunV1, concreteWall
- To unlock additional buildings and units, you MUST build prerequisite structures first:
  Building prerequisites:
  - ammunitionFactory: requires vehicleFactory
  - turretGunV2, turretGunV3, rocketTurret, teslaCoil, artilleryTurret: requires radarStation
  Unit prerequisites:
  - tank (tank_v1): requires vehicleFactory
  - harvester: requires vehicleFactory + oreRefinery
  - tankerTruck: requires vehicleFactory + gasStation
  - ammunitionTruck: requires vehicleFactory + ammunitionFactory
  - ambulance: requires hospital
  - recoveryTank, mineSweeper: requires vehicleFactory + vehicleWorkshop
  - mineLayer: requires vehicleFactory + vehicleWorkshop + ammunitionFactory
  - tank-v2: requires radarStation
  - tank-v3: requires 2x vehicleFactory
  - rocketTank: requires rocketTurret
  - howitzer: requires radarStation + vehicleFactory
  - apache: requires helipad (helipad requires radarStation)
- Buildings and units you try to build without having the prerequisites WILL BE REJECTED.
- The engine enforces construction times — buildings take time to finish construction, just like the human player.

SELL & REPAIR BUILDINGS
- You can sell buildings you own to recover 70% of their cost. Use action type "sell_building" with a buildingId.
- You can repair damaged buildings. Use action type "repair_building" with a buildingId. Repair costs ~30% of damage value.
- Sell unneeded or redundant buildings when you need emergency funds.
- Repair critical buildings (refineries, factories) when they're damaged.

UNIT CATALOG (all producible units with stats):
${UNIT_CATALOG_TEXT}

BUILDING CATALOG (all constructable buildings with stats):
${BUILDING_CATALOG_TEXT}

IMPORTANT OWNERSHIP: Every unit and building in the snapshot has an "owner" field. YOUR units/buildings have owner === your playerId. The HUMAN PLAYER's entities have a different owner. Always check the owner field to distinguish friend from foe.

INPUT FORMAT (you will receive this once per tick in a user message as JSON):
{
  "summary": "short rolling summary of recent ticks",
  "input": GameTickInput
}

GameTickInput key fields:
- protocolVersion: string (must match in output)
- tick: number
- playerId: string (your controlled player)
- snapshot.resources.money: available budget
- snapshot.units: array of units with id, type, owner, health, position, status (ammo/fuel)
- snapshot.buildings: array of buildings with id, type, owner, health, tilePosition
- snapshot.buildQueues: production queues (current plan in progress)
- snapshot.llmQueue: YOUR current production queue with status tracking:
  - buildings: array of {buildingType, status} where status is "queued"|"building"|"completed"|"failed"
  - units: array of {unitType, status} where status is "queued"|"building"|"completed"|"failed"
  IMPORTANT: Check snapshot.llmQueue BEFORE issuing build_place or build_queue actions.
  Do NOT re-issue commands for items already in the queue (queued/building/completed).
  Only add NEW items that are not already tracked.
- transitions.events: recent changes since last tick
- constraints: maxActionsPerTick, allowQueuedCommands, maxQueuedCommands

OUTPUT FORMAT (return ONLY JSON, no markdown) - GameTickOutput:
{
  "protocolVersion": "<same as input>",
  "tick": <same as input>,
  "actions": [
    {
      "actionId": "unique-string",
      "type": "build_place",
      "buildingType": "constructionYard|powerPlant|oreRefinery|vehicleFactory|...",
      "tilePosition": { "x": 0, "y": 0, "space": "tile" },
      "rallyPoint": null
    },
    {
      "actionId": "unique-string",
      "type": "build_queue",
      "unitType": "tank_v1|tank-v2|...",
      "count": 1,
      "factoryId": null,
      "rallyPoint": null
    },
    {
      "actionId": "unique-string",
      "type": "unit_command",
      "unitIds": ["unit-id"],
      "command": "move|attack|stop|hold|guard|patrol",
      "targetPos": { "x": 0, "y": 0, "space": "world|tile" },
      "targetId": null
    },
    {
      "actionId": "unique-string",
      "type": "set_rally",
      "buildingId": "building-id",
      "rallyPoint": { "x": 0, "y": 0, "space": "world|tile" }
    },
    {
      "actionId": "unique-string",
      "type": "sell_building",
      "buildingId": "building-id"
    },
    {
      "actionId": "unique-string",
      "type": "repair_building",
      "buildingId": "building-id"
    },
    { "actionId": "unique-string", "type": "cancel" },
    {
      "actionId": "unique-string",
      "type": "ability",
      "unitId": "unit-id",
      "abilityId": "ability-key",
      "targetPos": null,
      "targetId": null
    }
  ],
  "notes": "optional short taunt or plan summary for the player",
  "intent": "short label of your current plan",
  "confidence": 0.5
}

Always include intent, confidence (0.0-1.0), and notes fields even if the value is minimal.

TACTICAL GUIDELINES
- Build power plants FIRST to ensure your base has enough energy.
- Build an ore refinery and a harvester IMMEDIATELY for income. Without income you will lose.
- Build a vehicle factory before queueing land units (all land units spawn from vehicle factory).
- Build a helipad (requires radar) before queueing apaches.
- BUILDING PLACEMENT: Look at your existing buildings in the snapshot (especially your constructionYard) and place new buildings within 1-2 tiles of them. Use coordinates close to your existing structures. If your constructionYard is at (x, y), place the next building at (x+3, y) or (x, y+3) etc. NEVER place buildings at random positions on the map.
- Defend your base with turrets to slow rushes.
- Amass a critical mass of combat units (at least 5-8 tanks) before attacking. Sending 1-2 tanks into an enemy base with turrets is wasteful — they will die instantly.
- AVOID ENEMY BASE DEFENSES: Do NOT send units into range of enemy turrets, tesla coils, or artillery unless you have overwhelming force (2-3x the defensive firepower). Scout the enemy base perimeter first, then attack from the weakest side.
- Keep your attack force OUT OF turret range until you have enough units to rush through. Use the "move" command to stage units just outside turret range, then "attack" to rush in together.
- If your attack force takes heavy losses from enemy defenses, RETREAT (move them back) and rebuild before trying again.
- Use the "move" command to position units, then "attack" to engage specific targets.
- Protect your harvesters — they are your economy.
- When issuing "attack" commands, always provide BOTH targetPos AND targetId for the specific enemy unit or building you want destroyed. Units with just a move target will walk but not fire!

RULES
- Return valid JSON only. No markdown, no extra text.
- Respect constraints.maxActionsPerTick and available money.
- Use unique actionId values.
- Prefer "tile" positions for building placement.
- If unsure, return an empty actions array.

You will receive this full context only once. Future prompts include only the latest game state + transitions; continue the same session and follow these rules.

IMPORTANT: Respond to THIS message with your first set of strategic actions NOW. Analyze the game state below. Your economy build order should start immediately: build a power plant, then an ore refinery, then a vehicle factory, then queue a harvester. Do not wait for a second prompt to start issuing commands.`

const STRATEGIC_FOLLOWUP_PROMPT = `You are the same enemy strategic AI continuing the current match.
Return ONLY valid JSON matching GameTickOutput. No markdown or extra text.
Follow the rules and schema from the initial brief.
Always include intent, confidence (0-1), and notes fields.`

const DEFAULT_COMMENTARY_PROMPT = `You are a mean RTS opponent commentating on the battle while actively controlling one AI party.
Your controlled side is input.playerId in the provided game snapshot. Treat that side as "my" side in commentary.
Before commenting on any event, identify ownership using each unit/building owner field:
- If owner === input.playerId, it is YOUR side.
- If owner !== input.playerId, it is an opposing side (usually the human player, but may include other parties).
Never confuse sides: do not describe your own losses as the player's losses, and do not claim enemy losses as your own.
When multiple non-self parties exist, refer to them as specific opposing parties based on owner id.
Taunt the player about notable events: units destroyed, buildings lost, economy problems, or your upcoming attacks.
Only comment when something interesting happened (battles, kills, expansions, milestones).
If nothing notable occurred since your last comment, respond with exactly: {"skip":true}
NEVER repeat the same taunt or observation twice. Vary your vocabulary, tone, and targets.
Keep it under 30 words. Be creative, menacing, and entertaining.`


const PROTOCOL_SCHEMA_TEXT = JSON.stringify(protocolSchema)

function getAiPlayers(state) {
  const humanPlayer = state.humanPlayer || 'player1'
  const playerCount = state.playerCount || 2
  const allPlayers = ['player1', 'player2', 'player3', 'player4'].slice(0, playerCount)

  if (!Array.isArray(state.partyStates) || state.partyStates.length === 0) {
    return allPlayers.filter(playerId => playerId !== humanPlayer)
  }

  return allPlayers.filter(playerId => {
    if (playerId === humanPlayer) return false
    const partyState = state.partyStates.find(p => p.partyId === playerId)
    if (!partyState) return true
    if (partyState.aiActive === false) return false
    if (partyState.llmControlled === false) return false
    return true
  })
}

function ensureStrategicState(state) {
  if (!state.llmStrategic) {
    state.llmStrategic = {
      lastTickAt: 0,
      lastTickFrame: 0,
      pending: false,
      lastSummary: '',
      plansByPlayer: {},
      summariesByPlayer: {},
      bootstrappedByPlayer: {},
      responseIdsByPlayer: {}
    }
  }
  return state.llmStrategic
}

function ensureCommentaryState(state) {
  if (!state.llmCommentary) {
    state.llmCommentary = {
      lastTickAt: 0,
      pending: false,
      responseId: null,
      recentComments: []
    }
  }
  return state.llmCommentary
}

function summarizeInput(input, previousSummary) {
  const resources = input.snapshot?.resources || {}
  const snapshotUnits = Array.isArray(input.snapshot?.units) ? input.snapshot.units : []
  const snapshotBuildings = Array.isArray(input.snapshot?.buildings) ? input.snapshot.buildings : []
  const unitCount = snapshotUnits.length
  const buildingCount = snapshotBuildings.length
  const transitions = Array.isArray(input.transitions?.events) ? input.transitions.events : []
  const recentEvents = transitions.slice(-6).map(evt => evt.type).join(', ')

  // Count units/buildings per owner
  const myUnits = snapshotUnits.filter(u => u.owner === input.playerId).length
  const enemyUnits = unitCount - myUnits
  const myBuildings = snapshotBuildings.filter(b => b.owner === input.playerId).length
  const enemyBuildings = buildingCount - myBuildings

  const summaryParts = [
    `Tick ${input.tick}`,
    `Money ${Math.round(resources.money || 0)}`,
    `MyUnits ${myUnits} EnemyUnits ${enemyUnits}`,
    `MyBuildings ${myBuildings} EnemyBuildings ${enemyBuildings}`
  ]
  if (recentEvents) {
    summaryParts.push(`Recent: ${recentEvents}`)
  }
  const summary = summaryParts.join(' | ')
  if (!previousSummary) return summary
  return `${previousSummary}\n${summary}`.split('\n').slice(-6).join('\n')
}

function extractJsonBlock(text) {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return text.slice(start, end + 1)
}

function parseOutput(text) {
  if (text && typeof text === 'object') {
    return text
  }
  const jsonText = extractJsonBlock(text)
  if (!jsonText) return null
  try {
    return JSON.parse(jsonText)
  } catch (err) {
    window.logger.warn('[LLM] Failed to parse JSON output:', err)
    return null
  }
}

function applyUsageCost(providerId, model, usage, costMap) {
  if (!usage) return
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0
  const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens)
  const costInfo = getModelCostInfo(providerId, model, costMap)
  let costUsd = 0
  if (costInfo) {
    const divisor = costInfo.unit === 'per_1k' ? 1000 : 1000000
    const inputCost = (inputTokens / divisor) * (costInfo.input || 0)
    const outputCost = (outputTokens / divisor) * (costInfo.output || 0)
    costUsd = inputCost + outputCost
  }
  recordLlmUsage({
    provider: providerId,
    model,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
    costUsd
  })
}

function buildStrategicMessages({ input, summary, includeBootstrap }) {
  const messages = []
  if (includeBootstrap) {
    messages.push({ role: 'system', content: STRATEGIC_BOOTSTRAP_PROMPT })
    messages.push({ role: 'system', content: `PROTOCOL_JSON_SCHEMA:\n${PROTOCOL_SCHEMA_TEXT}` })
  }
  messages.push({
    role: 'user',
    content: JSON.stringify({
      summary,
      input
    })
  })
  return messages
}

function hasInterestingEvents(transitions) {
  if (!Array.isArray(transitions) || transitions.length === 0) return false
  const interestingTypes = new Set([
    'unit_destroyed', 'building_destroyed', 'unit_created', 'building_placed',
    'attack_started', 'building_captured', 'unit_promoted', 'milestone',
    'harvester_destroyed', 'construction_started'
  ])
  return transitions.some(evt => interestingTypes.has(evt.type))
}

function buildCommentaryMessages(input, summary, recentComments = []) {
  const avoidRepeat = recentComments.length > 0
    ? `\nRecent comments you already made (DO NOT repeat these): ${recentComments.slice(-5).join(' | ')}` : ''
  return [
    {
      role: 'user',
      content: JSON.stringify({
        summary,
        transitions: input.transitions?.events?.slice(-8) || [],
        instruction: `Comment on recent events.${avoidRepeat}\nIf nothing interesting happened, respond with exactly: {"skip":true}`
      })
    }
  ]
}

function computeAiVisibleTiles(state, playerId) {
  const stateUnits = state.units || []
  const allBuildings = [...(state.buildings || []), ...(state.factories || [])]
  const mapWidth = state.mapTilesX || 100
  const mapHeight = state.mapTilesY || 100
  const visible = new Set()

  const markCircle = (cx, cy, range) => {
    const r = Math.ceil(range)
    const rSq = (range + 0.5) * (range + 0.5)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= rSq) {
          const tx = Math.floor(cx) + dx
          const ty = Math.floor(cy) + dy
          if (tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
            visible.add(ty * mapWidth + tx)
          }
        }
      }
    }
  }

  for (const unit of stateUnits) {
    if (unit.owner !== playerId) continue
    const cx = (unit.x + TILE_SIZE / 2) / TILE_SIZE
    const cy = (unit.y + TILE_SIZE / 2) / TILE_SIZE
    let range = TANK_FIRE_RANGE
    if (unit.type === 'harvester') range = 5
    else if (unit.type === 'ambulance' || unit.type === 'tankerTruck') range = 2
    else if (unit.type === 'rocketTank') range = TANK_FIRE_RANGE * 1.5
    else if (unit.type === 'howitzer') range = 18
    markCircle(cx, cy, range)
  }

  for (const b of allBuildings) {
    if (b.owner !== playerId) continue
    const cx = b.x + (b.width || 1) / 2
    const cy = b.y + (b.height || 1) / 2
    const bData = buildingData[b.type]
    const range = bData?.fireRange || Math.max(4, Math.ceil(Math.max(b.width || 1, b.height || 1) / 2) + 4)
    markCircle(cx, cy, range)
  }

  return { visible, mapWidth }
}

function isTileVisible(visData, tileX, tileY) {
  return visData.visible.has(tileY * visData.mapWidth + tileX)
}

function filterInputByFogOfWar(input, state, playerId) {
  if (!state.shadowOfWarEnabled) return input
  const vis = computeAiVisibleTiles(state, playerId)
  const filtered = { ...input, snapshot: { ...input.snapshot } }
  // Keep own units, filter enemy units by visibility
  filtered.snapshot.units = (input.snapshot.units || []).filter(u => {
    if (u.owner === playerId) return true
    const tx = u.tilePosition?.x ?? Math.floor(u.position.x / TILE_SIZE)
    const ty = u.tilePosition?.y ?? Math.floor(u.position.y / TILE_SIZE)
    return isTileVisible(vis, tx, ty)
  })
  // Keep own buildings, filter enemy buildings by visibility
  filtered.snapshot.buildings = (input.snapshot.buildings || []).filter(b => {
    if (b.owner === playerId) return true
    const tx = b.tilePosition?.x ?? b.x
    const ty = b.tilePosition?.y ?? b.y
    return isTileVisible(vis, tx, ty)
  })
  return filtered
}

function applyLlmLocks(units, unitIds, now, lockMs) {
  unitIds.forEach(id => {
    const unit = units.find(entry => entry.id === id)
    if (unit) {
      unit.llmOrderLockUntil = now + lockMs
    }
  })
}

function updatePlanCache(state, playerId, output) {
  const plan = {
    updatedAt: state.gameTime || performance.now(),
    actions: output.actions || [],
    notes: output.notes || ''
  }
  state.llmStrategic.plansByPlayer[playerId] = plan
}

function disableLlmAI(type = 'both') {
  const updates = {}
  if (type === 'strategic' || type === 'both') {
    updates.strategic = { enabled: false }
  }
  if (type === 'commentary' || type === 'both') {
    updates.commentary = { enabled: false }
  }
  updateLlmSettings(updates)
}

async function runStrategicTickForPlayer(playerId, state, settings, now) {
  const strategicState = ensureStrategicState(state)
  const factories = state.factories || []
  const enemyFactory = factories.find(factory => factory.id === playerId)
  const budget = enemyFactory?.budget ?? 0

  const viewState = {
    ...state,
    money: budget,
    humanPlayer: state.humanPlayer
  }

  const lastTickFrame = state.llmStrategic.lastTickFrame || 0
  const rawInput = exportGameTickInput(viewState, lastTickFrame, {
    playerId,
    verbosity: settings.strategic.verbosity,
    maxActionsPerTick: settings.strategic.maxActions
  })

  // Apply fog-of-war: only show entities visible to this AI player
  const input = filterInputByFogOfWar(rawInput, state, playerId)

  const previousSummary = strategicState.summariesByPlayer[playerId] || ''
  const summary = summarizeInput(input, previousSummary)
  strategicState.summariesByPlayer[playerId] = summary
  strategicState.lastSummary = summary

  const providerId = settings.strategic.provider
  const model = settings.providers?.[providerId]?.model
  const providerSettings = getProviderSettings(providerId)
  const hasApiKey = providerSettings?.apiKey && providerSettings.apiKey.trim().length > 0

  if (!providerId || !model) {
    showNotification('LLM strategic AI needs a provider and model selected.')
    return
  }

  // Skip call if provider requires an API key and none is configured
  if (providerId !== 'ollama' && !hasApiKey) {
    return
  }

  const costMap = await fetchCostMap()
  const hasBootstrapped = Boolean(strategicState.bootstrappedByPlayer[playerId])
  const previousResponseId = strategicState.responseIdsByPlayer[playerId] || null
  const messages = buildStrategicMessages({
    input,
    summary,
    includeBootstrap: !hasBootstrapped
  })
  // Schema for the OpenAI Responses API with strict: true.
  // Rules from https://platform.openai.com/docs/guides/structured-outputs#supported-schemas:
  //  - Use anyOf (NOT oneOf) for discriminated unions
  //  - All properties must be in required
  //  - additionalProperties: false on every object
  //  - Nullable objects use anyOf: [{type:'object',...},{type:'null'}]
  //  - Nullable scalars use type: ['string','null'] etc.

  const NULLABLE_POSITION = {
    anyOf: [
      {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          space: { type: 'string', enum: ['world', 'tile'] }
        },
        required: ['x', 'y', 'space'],
        additionalProperties: false
      },
      { type: 'null' }
    ]
  }

  const TILE_POSITION = {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      space: { type: 'string', enum: ['tile'] }
    },
    required: ['x', 'y', 'space'],
    additionalProperties: false
  }

  const POSITION = {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      space: { type: 'string', enum: ['world', 'tile'] }
    },
    required: ['x', 'y', 'space'],
    additionalProperties: false
  }

  const SIMPLE_GAME_TICK_SCHEMA = {
    type: 'object',
    properties: {
      protocolVersion: { type: 'string' },
      tick: { type: 'number' },
      intent: { type: 'string' },
      confidence: { type: 'number' },
      notes: { type: 'string' },
      actions: {
        type: 'array',
        items: {
          anyOf: [
            {
              type: 'object',
              properties: {
                actionId: { type: 'string' },
                type: { type: 'string', enum: ['build_place'] },
                buildingType: {
                  type: 'string',
                  enum: [
                    'constructionYard', 'powerPlant', 'oreRefinery', 'vehicleFactory',
                    'vehicleWorkshop', 'radarStation', 'hospital', 'helipad', 'gasStation',
                    'ammunitionFactory', 'turretGunV1', 'turretGunV2', 'turretGunV3',
                    'rocketTurret', 'teslaCoil', 'artilleryTurret', 'concreteWall'
                  ]
                },
                tilePosition: TILE_POSITION,
                rallyPoint: NULLABLE_POSITION
              },
              required: ['actionId', 'type', 'buildingType', 'tilePosition', 'rallyPoint'],
              additionalProperties: false
            },
            {
              type: 'object',
              properties: {
                actionId: { type: 'string' },
                type: { type: 'string', enum: ['build_queue'] },
                unitType: {
                  type: 'string',
                  enum: [
                    'tank', 'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'harvester',
                    'ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank',
                    'howitzer', 'apache', 'mineLayer', 'mineSweeper'
                  ]
                },
                count: { type: 'number' },
                factoryId: { type: ['string', 'null'] },
                rallyPoint: NULLABLE_POSITION
              },
              required: ['actionId', 'type', 'unitType', 'count', 'factoryId', 'rallyPoint'],
              additionalProperties: false
            },
            {
              type: 'object',
              properties: {
                actionId: { type: 'string' },
                type: { type: 'string', enum: ['unit_command'] },
                unitIds: { type: 'array', items: { type: 'string' } },
                command: { type: 'string', enum: ['move', 'attack', 'stop', 'hold', 'guard', 'patrol'] },
                targetPos: NULLABLE_POSITION,
                targetId: { type: ['string', 'null'] }
              },
              required: ['actionId', 'type', 'unitIds', 'command', 'targetPos', 'targetId'],
              additionalProperties: false
            },
            {
              type: 'object',
              properties: {
                actionId: { type: 'string' },
                type: { type: 'string', enum: ['set_rally'] },
                buildingId: { type: 'string' },
                rallyPoint: POSITION
              },
              required: ['actionId', 'type', 'buildingId', 'rallyPoint'],
              additionalProperties: false
            },
            {
              type: 'object',
              properties: {
                actionId: { type: 'string' },
                type: { type: 'string', enum: ['cancel'] }
              },
              required: ['actionId', 'type'],
              additionalProperties: false
            },
            {
              type: 'object',
              properties: {
                actionId: { type: 'string' },
                type: { type: 'string', enum: ['ability'] },
                unitId: { type: 'string' },
                abilityId: { type: 'string' },
                targetPos: NULLABLE_POSITION,
                targetId: { type: ['string', 'null'] }
              },
              required: ['actionId', 'type', 'unitId', 'abilityId', 'targetPos', 'targetId'],
              additionalProperties: false
            },
            {
              type: 'object',
              properties: {
                actionId: { type: 'string' },
                type: { type: 'string', enum: ['sell_building'] },
                buildingId: { type: 'string' }
              },
              required: ['actionId', 'type', 'buildingId'],
              additionalProperties: false
            },
            {
              type: 'object',
              properties: {
                actionId: { type: 'string' },
                type: { type: 'string', enum: ['repair_building'] },
                buildingId: { type: 'string' }
              },
              required: ['actionId', 'type', 'buildingId'],
              additionalProperties: false
            }
          ]
        }
      }
    },
    required: ['protocolVersion', 'tick', 'intent', 'confidence', 'notes', 'actions'],
    additionalProperties: false
  }

  const responseFormat = {
    type: 'json_schema',
    name: 'GameTickOutput',
    schema: SIMPLE_GAME_TICK_SCHEMA,
    strict: true
  }
  const instructionPrompt = hasBootstrapped ? STRATEGIC_FOLLOWUP_PROMPT : STRATEGIC_BOOTSTRAP_PROMPT
  const systemForRequest = providerId === 'openai' ? null : instructionPrompt

  try {
    const response = await requestLlmCompletion(providerId, {
      model,
      system: systemForRequest,
      messages,
      responseFormat,
      previousResponseId,
      instructions: instructionPrompt
    })

    applyUsageCost(providerId, model, response.usage, costMap)

    const parsed = parseOutput(response.text)
    if (!parsed) {
      showNotification('LLM strategic response was not valid JSON.')
      return
    }

    const result = applyGameTickOutput(state, parsed, {
      playerId,
      money: budget,
      onMoneyChange: (nextBudget) => {
        if (enemyFactory) {
          enemyFactory.budget = nextBudget
        }
      }
    })

    if (result.rejected.length > 0) {
      window.logger.warn('[LLM] Rejected actions:', JSON.stringify(result.rejected))
    }
    if (result.accepted.length > 0) {
      window.logger.info('[LLM] Accepted actions:', result.accepted.map(a => `${a.type}:${a.actionId}`).join(', '))
    }

    const acceptedCommands = result.accepted.filter(action => action.type === 'unit_command')
    acceptedCommands.forEach(action => {
      applyLlmLocks(state.units || [], action.unitIds || [], now, settings.strategic.tickSeconds * 1000)
    })

    updatePlanCache(state, playerId, parsed)
    if (!hasBootstrapped) {
      strategicState.bootstrappedByPlayer[playerId] = true
    }
    if (response.responseId) {
      strategicState.responseIdsByPlayer[playerId] = response.responseId
    }

    if (parsed.notes) {
      const llmColor = PARTY_COLORS[playerId] || '#FF0000'
      showNotification(parsed.notes, 4000, { llmPlayerId: playerId, llmColor })
    }
  } catch (err) {
    // Only show error messages if API key is configured
    if (!hasApiKey) {
      window.logger.warn('[LLM] Strategic AI error (no API key configured):', err.message)
      return
    }

    if (err instanceof QuotaExceededError) {
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
      showNotification(
        `${providerName} API quota exceeded. LLM Strategic AI disabled, falling back to local AI only.`,
        6000
      )
      window.logger.warn(`[LLM] ${providerName} quota exceeded:`, err.message)
      disableLlmAI('strategic')
    } else if (err instanceof AuthenticationError) {
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
      showNotification(
        `${providerName} authentication failed: ${err.message}. LLM Strategic AI disabled.`,
        6000
      )
      window.logger.warn(`[LLM] ${providerName} authentication error:`, err.message)
      disableLlmAI('strategic')
    } else if (err instanceof ApiParameterError) {
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
      showNotification(
        `${providerName} API error: ${err.message}`,
        6000
      )
      window.logger.warn(`[LLM] ${providerName} API parameter error:`, err.message)
      disableLlmAI('strategic')
    } else {
      throw err
    }
  }
}

async function runCommentaryTick(state, settings, _now) {
  const commentaryState = ensureCommentaryState(state)
  const providerId = settings.commentary.provider
  const model = settings.providers?.[providerId]?.model
  const providerSettings = getProviderSettings(providerId)
  const hasApiKey = providerSettings?.apiKey && providerSettings.apiKey.trim().length > 0

  if (!providerId || !model) {
    showNotification('LLM commentary needs a provider and model selected.')
    return
  }

  // Skip call if provider requires an API key and none is configured
  if (providerId !== 'ollama' && !hasApiKey) {
    return
  }

  const input = exportGameTickInput(state, state.llmStrategic?.lastTickFrame || 0, {
    verbosity: 'minimal'
  })

  // Skip commentary when nothing interesting happened
  const transitions = input.transitions?.events || []
  if (!hasInterestingEvents(transitions)) {
    window.logger.info('[LLM] Commentary skipped: no interesting events')
    return
  }

  const summary = summarizeInput(input, state.llmStrategic?.lastSummary || '')
  const systemPrompt = settings.commentary.promptOverride?.trim() || DEFAULT_COMMENTARY_PROMPT
  const costMap = await fetchCostMap()
  const recentComments = commentaryState.recentComments || []
  const messages = buildCommentaryMessages(input, summary, recentComments)
  const previousResponseId = commentaryState.responseId || null

  try {
    const response = await requestLlmCompletion(providerId, {
      model,
      system: systemPrompt,
      messages,
      maxTokens: 10000,
      temperature: 1.0,
      previousResponseId
    })

    applyUsageCost(providerId, model, response.usage, costMap)

    const rawComment = response.text?.trim()
    if (!rawComment) return

    // Check if LLM explicitly skipped
    try {
      const parsed = JSON.parse(rawComment)
      if (parsed.skip) {
        window.logger.info('[LLM] Commentary self-skipped via {skip:true}')
        return
      }
    } catch {
      // Not JSON, treat as a normal comment
    }

    state.llmCommentary.lastText = rawComment
    if (response.responseId) {
      commentaryState.responseId = response.responseId
    }

    // Track recent comments to prevent repetition (keep last 10)
    if (!commentaryState.recentComments) commentaryState.recentComments = []
    commentaryState.recentComments.push(rawComment)
    if (commentaryState.recentComments.length > 10) {
      commentaryState.recentComments = commentaryState.recentComments.slice(-10)
    }

    showNotification(rawComment, 5000)
    if (settings.commentary.ttsEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(rawComment)
      const voices = window.speechSynthesis.getVoices()
      if (settings.commentary.voiceName) {
        const selected = voices.find(v => v.name === settings.commentary.voiceName)
        if (selected) {
          utterance.voice = selected
        }
      }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    }
  } catch (err) {
    // Only show error messages if API key is configured
    if (!hasApiKey) {
      window.logger.warn('[LLM] Commentary error (no API key configured):', err.message)
      return
    }

    if (err instanceof QuotaExceededError) {
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
      showNotification(
        `${providerName} API quota exceeded. LLM Commentary disabled.`,
        6000
      )
      window.logger.warn(`[LLM] ${providerName} quota exceeded:`, err.message)
      disableLlmAI('commentary')
    } else if (err instanceof AuthenticationError) {
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
      showNotification(
        `${providerName} authentication failed: ${err.message}. LLM Commentary disabled.`,
        6000
      )
      window.logger.warn(`[LLM] ${providerName} authentication error:`, err.message)
      disableLlmAI('commentary')
    } else if (err instanceof ApiParameterError) {
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
      showNotification(
        `${providerName} API error: ${err.message}`,
        6000
      )
      window.logger.warn(`[LLM] ${providerName} API parameter error:`, err.message)
      disableLlmAI('commentary')
    } else {
      throw err
    }
  }
}

export function updateLlmStrategicAI(units, factories, _bullets, _mapGrid, state = gameState, now = performance.now()) {
  if (!isHost()) return
  const settings = getLlmSettings()
  if (!settings.strategic.enabled && !settings.commentary.enabled) return

  const strategicState = ensureStrategicState(state)
  const commentaryState = ensureCommentaryState(state)

  const tickIntervalMs = Math.max(5, settings.strategic.tickSeconds || 30) * 1000

  if (settings.strategic.enabled && !strategicState.pending &&
      (strategicState.lastTickAt === 0 || now - strategicState.lastTickAt >= tickIntervalMs)) {
    strategicState.pending = true
    strategicState.lastTickAt = now
    strategicState.lastTickFrame = state.frameCount || 0
    const aiPlayers = getAiPlayers(state)
    Promise.all(aiPlayers.map(playerId => runStrategicTickForPlayer(playerId, state, settings, now)))
      .catch(err => {
        window.logger.warn('[LLM] Strategic tick failed:', err)
      })
      .finally(() => {
        strategicState.pending = false
      })
  }

  if (settings.commentary.enabled && !commentaryState.pending && now - commentaryState.lastTickAt >= tickIntervalMs) {
    commentaryState.pending = true
    commentaryState.lastTickAt = now
    runCommentaryTick(state, settings, now)
      .catch(err => {
        window.logger.warn('[LLM] Commentary tick failed:', err)
      })
      .finally(() => {
        commentaryState.pending = false
      })
  }
}

// Trigger immediate strategic tick (used when enabling the feature via UI)
export async function triggerStrategicNow(state = gameState) {
  if (!isHost()) return
  const settings = getLlmSettings()
  if (!settings.strategic.enabled) return

  const strategicState = ensureStrategicState(state)
  if (strategicState.pending) return

  strategicState.pending = true
  const now = performance.now()
  strategicState.lastTickAt = now
  strategicState.lastTickFrame = state.frameCount || 0
  const aiPlayers = getAiPlayers(state)
  try {
    await Promise.all(aiPlayers.map(playerId => runStrategicTickForPlayer(playerId, state, settings, now)))
  } catch (err) {
    window.logger.warn('[LLM] Immediate strategic tick failed:', err)
  } finally {
    strategicState.pending = false
  }
}
