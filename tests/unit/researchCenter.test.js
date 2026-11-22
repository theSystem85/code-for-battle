import { existsSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { buildingData } from '../../src/data/buildingData.js'
import { hasResearchCenterPrerequisites } from '../../src/production/researchCenterRequirements.js'
import { computeAvailableBuildingTypes } from '../../src/ai-api/techTree.js'
import { applyPerkPurchase, canPurchasePerk, exportPerkState, getPerkLedger, grantPerkStars, ownsResearchPerk, requestPerkPurchase, resetPerkState, restorePerkState } from '../../src/perks/perkState.js'
import { RESEARCH_PERKS } from '../../src/perks/researchCatalog.js'
import { updateBuildingButtonStates } from '../../src/ui/productionControllerButtonStates.js'

const { broadcastGameCommand } = vi.hoisted(() => ({ broadcastGameCommand: vi.fn() }))
vi.mock('../../src/network/commandBroadcast.js', () => ({ broadcastGameCommand }))
vi.mock('../../src/replayCommandPrimitives.js', () => ({ recordReplayCommand: vi.fn() }))

const owner = 'player1'
const building = (type, properties = {}) => ({ type, owner, health: 100, ...properties })
const center = () => building('technologyResearchCenter')

describe('Technology Research Center', () => {
  beforeEach(() => {
    gameState.humanPlayer = owner
    gameState.buildings = []
    resetPerkState()
  })

  it('[U07313] applies a host purchase locally before broadcasting it', async() => {
    const previousSession = gameState.multiplayerSession
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    try {
      gameState.buildings = [center()]
      grantPerkStars({ owner }, 2)
      expect(await requestPerkPurchase('tc.foundation')).toEqual({ ok: true })
      expect(ownsResearchPerk(owner, 'tc.foundation')).toBe(true)
      expect(getPerkLedger(owner).available).toBe(0)
      expect(broadcastGameCommand).toHaveBeenCalledWith('perk-purchase', { actorId: owner, perkId: 'tc.foundation', expectedCost: 2 }, owner)
    } finally {
      gameState.multiplayerSession = previousSession
    }
  })

  it('[U07310] requires the same player to own both live prerequisites', () => {
    const radar = building('radarStation')
    const command = building('commandCenter')
    expect(buildingData.technologyResearchCenter.power).toBe(-buildingData.powerPlant.power / 2)
    expect(hasResearchCenterPrerequisites([radar, { ...command, owner: 'player2' }], owner)).toBe(false)
    expect(hasResearchCenterPrerequisites([radar, { ...command, isBeingSold: true }], owner)).toBe(false)
    expect(computeAvailableBuildingTypes([radar], [], owner).has('technologyResearchCenter')).toBe(false)
    expect(computeAvailableBuildingTypes([radar, command], [], owner).has('technologyResearchCenter')).toBe(true)
  })

  it('[U07311] charges the shared star ledger, checks the research chain, and restores purchases', () => {
    grantPerkStars({ owner }, 6)
    expect(canPurchasePerk(owner, 'tc.foundation').reason).toBe('noResearchCenter')
    gameState.buildings = [center()]
    expect(canPurchasePerk(owner, 'tc.orbit').reason).toBe('missingPrerequisite')
    expect(applyPerkPurchase(owner, 'tc.foundation').ok).toBe(true)
    expect(applyPerkPurchase(owner, 'tc.orbit').ok).toBe(true)
    expect(getPerkLedger(owner).available).toBe(0)
    expect(getPerkLedger('player2').available).toBe(0)
    const saved = exportPerkState()
    resetPerkState()
    gameState.buildings = []
    restorePerkState(saved)
    expect(ownsResearchPerk(owner, 'tc.orbit')).toBe(true)
    expect(canPurchasePerk(owner, 'tc.autonomy').reason).toBe('noResearchCenter')
  })

  it('[U07312] hides real blueprint buttons until the relevant perk and uses the approved images', () => {
    document.body.innerHTML = '<button class="production-button unlocked" data-building-type="planeFactory"></button>'
    gameState.buildings = [center()]
    gameState.availableBuildingTypes = new Set(['planeFactory'])
    const card = document.querySelector('[data-building-type="planeFactory"]')
    const refresh = () => updateBuildingButtonStates({ getBuildingProductionCount: () => 0 })
    refresh()
    expect(card.style.display).toBe('none')
    grantPerkStars({ owner }, 5)
    applyPerkPurchase(owner, 'tc.foundation')
    refresh()
    expect(card.style.display).toBe('none')
    applyPerkPurchase(owner, 'tc.aerospace')
    refresh()
    expect(card.style.display).toBe('')
    expect(card.classList.contains('disabled')).toBe(true)
    expect(card.dataset.requirement).toMatch(/Airstrip/)
    const html = readFileSync('index.html', 'utf8')
    for (const perk of RESEARCH_PERKS) {
      expect(existsSync(`public/${perk.badge}`)).toBe(true)
      for (const blueprint of perk.blueprints) {
        expect(buildingData[blueprint.type].researchPerk).toBe(perk.id)
        expect(existsSync(`public/images/sidebar/${blueprint.image}.webp`)).toBe(true)
        expect(html).toContain(`data-src="images/sidebar/${blueprint.image}.webp"`)
      }
    }
  })
})
