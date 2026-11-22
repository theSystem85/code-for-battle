import { beforeEach, describe, expect, it } from 'vitest'
import manifest from '../../public/images/prepared/sprite-manifest.json'
import { applyLevelUps, grantHarvesterStars } from '../../src/game/veterancy.js'
import { gameState } from '../../src/gameState.js'
import { buildingData } from '../../src/data/buildingData.js'
import { applyPerkPurchase, getPerkLedger, grantPerkStars, resetPerkState } from '../../src/perks/perkState.js'
import { getAdvancedBuildingRequirement, hasBuildingBlueprint } from '../../src/production/advancedBuildingAccess.js'
import { getAssemblySpeedMultiplier } from '../../src/production/assemblyBonuses.js'
import { computeAvailableBuildingTypes } from '../../src/ai-api/techTree.js'

const owner = 'player1'
const building = (type, extra = {}) => ({ type, owner, health: 400, ...extra })

describe('advanced research buildings', () => {
  beforeEach(() => {
    resetPerkState()
    gameState.buildings = [building('technologyResearchCenter')]
  })

  it('[U07333] keeps the Drone Factory behind the purchased blueprint and an owned living center', () => {
    const buildings = gameState.buildings
    expect(hasBuildingBlueprint('droneFactory', owner)).toBe(false)
    expect(computeAvailableBuildingTypes(buildings, [], owner).has('droneFactory')).toBe(false)
    grantPerkStars(building('vehicleFactory'), 5)
    applyPerkPurchase(owner, 'tc.foundation')
    applyPerkPurchase(owner, 'tc.autonomy')
    expect(hasBuildingBlueprint('droneFactory', owner)).toBe(true)
    expect(hasBuildingBlueprint('aiCenter', owner)).toBe(true)
    expect(computeAvailableBuildingTypes(buildings, [], owner).has('droneFactory')).toBe(true)
    buildings[0].health = 0
    expect(getAdvancedBuildingRequirement('droneFactory', buildings, owner)).toMatch(/Technology Research Center/)
    expect(computeAvailableBuildingTypes(buildings, [], owner).has('droneFactory')).toBe(false)
  })

  it('[U07334] applies the support assembly bonus only to the owner of a working Drone Factory', () => {
    const buildings = [building('droneFactory')]
    expect(getAssemblySpeedMultiplier('recoveryTank', buildings, owner)).toBe(1.25)
    expect(getAssemblySpeedMultiplier('tank', buildings, owner)).toBe(1)
    expect(getAssemblySpeedMultiplier('recoveryTank', buildings, 'player2')).toBe(1)
    buildings[0].isBeingSold = true
    expect(getAssemblySpeedMultiplier('recoveryTank', buildings, owner)).toBe(1)
  })

  it('[U07335] ships the Drone Factory in the prepared asset tiers at the placed footprint', () => {
    const art = manifest.entries.find(entry => entry.id === 'building:droneFactory:base')
    expect(buildingData.droneFactory).toMatchObject({ width: 3, height: 3, cost: 4500, power: -80 })
    expect(art.variants.map(variant => variant.backingWidth)).toEqual([96, 192, 288])
  })
  it('[U07336] awards one extra star for its owner’s combat level-ups and leaves ore rewards alone', () => {
    const center = building('aiCenter')
    gameState.buildings.push(center)
    const tank = () => ({ type: 'tank', owner, level: 0, experience: 2000, baseCost: 1000 })
    expect(applyLevelUps(tank())).toBe(1)
    expect(getPerkLedger(owner).earned).toBe(2)
    grantHarvesterStars({ type: 'harvester', owner }, 1)
    expect(getPerkLedger(owner).earned).toBe(3)
    center.isBeingSold = true
    expect(applyLevelUps(tank())).toBe(1)
    expect(getPerkLedger(owner).earned).toBe(4)
    expect(manifest.entries.some(entry => entry.id === 'building:aiCenter:base')).toBe(true)
  })

})
