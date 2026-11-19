import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Guard for docs/asset-sources/sound-effects-prompts.json: every sound effect
// in the repo must be mapped to the prompt and model it was generated with.
// Music and voice lines are not sound effects and are excluded explicitly.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mappingPath = path.join(root, 'docs/asset-sources/sound-effects-prompts.json')

// Folders under public/sound/ that hold music or narration only.
const EXCLUDED_DIRS = new Set(['music', 'story', 'tutorial'])

// Voice lines (announcer, acknowledgements, unit callouts) directly in public/sound/.
const VOICE_LINES = new Set([
  'AllMinesOnTheFieldAreDisarmed', 'IAmOutOfGas', 'MineFieldCleared',
  'Repair_impossible_when_under_attack', 'The_mine_field_has_been_deployed_and_armed',
  'ackAirAttack1', 'ackAirAttack2', 'ackAirMove1', 'ackAirMove2', 'ackAirSelect1', 'ackAirSelect2',
  'ackAttackGround1', 'ackAttackGround2', 'ackAttackGround3', 'ackMoveGround1', 'ackMoveGround2',
  'ackMoveGround3', 'ackNavalAttack1', 'ackNavalAttack2', 'ackNavalMove1', 'ackNavalMove2',
  'ackNavalSelect1', 'ackNavalSelect2', 'ackSelectGround1', 'ackSelectGround2', 'ackSelectGround3',
  'ackSupportMove1', 'ackSupportMove2', 'ackSupportSelect1', 'ackSupportSelect2',
  'aircraftLowFuel', 'attacking', 'battleLost', 'battleWon', 'building', 'chainOfCommandsReceived',
  'confirmed', 'constructionComplete', 'construction_cancelled', 'construction_obstructed',
  'construction_paused', 'construction_started', 'critical_damage', 'enemySpotted',
  'enemy_building_destroyed', 'enemy_unit_destroyed', 'fireEngineReady', 'i_am_out_of_ammo',
  'insufficientFunds', 'lowPower', 'movingAlongThePath', 'new_building_types_available',
  'new_production_options', 'new_units_types_available', 'onMyWay', 'ourAircraftUnderAttack',
  'ourBaseIsUnderAttack', 'ourBattleshipGotAttacked', 'ourCarrierGotAttacked', 'ourCommanderIsOut',
  'ourDriverIsOut', 'ourGunnerIsOut', 'ourHarvestersAreUnderAttack', 'ourHovercraftGotAttacked',
  'ourLoaderIsOut', 'ourShipsGotAttacked', 'ourSubmarineGotAttacked', 'ourUnitsUnderAttack',
  'playerBlueDefeated', 'playerGreenDefeated', 'playerRedDefeated', 'playerYellowDefeated',
  'powerRestored', 'radarOfflineVO', 'radarOnlineVO', 'repairCancelled', 'repairFinished',
  'repairPaused', 'repairStarted', 'repairing', 'retreatCall1', 'retreatCall2', 'retreatCall3',
  'unitReady01', 'unitReady02', 'unitReady03', 'unitRefules', 'unit_is_being_repaired',
  'unit_lost', 'unitsBlocked', 'yesSir01'
])

// Sound effects that live outside public/sound/.
const EXTRA_SFX_PATHS = ['public/mine_explosion.mp3']

function soundEffectPaths() {
  const dir = path.join(root, 'public/sound')
  const paths = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        for (const file of fs.readdirSync(path.join(dir, entry.name))) {
          if (file.endsWith('.mp3')) paths.push(`public/sound/${entry.name}/${file}`)
        }
      }
      continue
    }
    if (!entry.name.endsWith('.mp3')) continue
    if (VOICE_LINES.has(entry.name.slice(0, -4))) continue
    paths.push(`public/sound/${entry.name}`)
  }
  return [...paths, ...EXTRA_SFX_PATHS].sort()
}

const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
const entries = Object.entries(mapping.files)

describe('sound effects prompt mapping', () => {
  it('[U07251] maps every sound effect file to an entry', () => {
    const mapped = new Set(entries.map(([, entry]) => entry.path))
    const missing = soundEffectPaths().filter(file => !mapped.has(file))
    expect(missing, 'add these files to docs/asset-sources/sound-effects-prompts.json (or to VOICE_LINES if they are speech)').toEqual([])
  })

  it('[U07252] only maps files that exist and are not voice lines', () => {
    for (const [name, entry] of entries) {
      expect(fs.existsSync(path.join(root, entry.path)), entry.path).toBe(true)
      expect(path.basename(entry.path, '.mp3'), entry.path).toBe(name)
      expect(VOICE_LINES.has(name), name).toBe(false)
    }
    for (const name of VOICE_LINES) {
      expect(fs.existsSync(path.join(root, 'public/sound', `${name}.mp3`)), `stale voice line ${name}`).toBe(true)
    }
  })

  it('[U07253] records prompt, model and generation for every traced entry', () => {
    for (const [name, entry] of entries) {
      expect(Object.keys(mapping.status_values), name).toContain(entry.status)
      if (entry.status === 'unknown-prompt') continue
      expect(entry.prompt, name).toMatch(/\S/)
      expect(entry.model_id, name).toMatch(/^eleven_/)
      expect(entry.generation_id, name).toMatch(/^\w+$/)
    }
  })
})
