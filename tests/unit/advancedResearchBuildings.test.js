import { AIRCRAFT_TYPES } from '../../src/production/aircraftProduction.js'
import { computeAvailableUnitTypes } from '../../src/ai-api/techTree.js'
import { beforeEach, describe, expect, it } from 'vitest'
import manifest from '../../public/images/prepared/sprite-manifest.json'
import { applyLevelUps, grantHarvesterStars } from '../../src/game/veterancy.js'
import { updateShadowOfWar } from '../../src/game/shadowOfWar.js'
import { gameState } from '../../src/gameState.js'
import { buildingData } from '../../src/data/buildingData.js'
import { applyPerkPurchase, getPerkLedger, grantPerkStars, resetPerkState } from '../../src/perks/perkState.js'
import { getAdvancedBuildingRequirement, hasBuildingBlueprint } from '../../src/production/advancedBuildingAccess.js'
import { getAssemblySpeedMultiplier, getConstructionAssemblySpeedMultiplier } from '../../src/production/assemblyBonuses.js'
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

  it('[U07337] requires radar to construct the launch base and provides local reconnaissance while it operates', () => {
    const structures = gameState.buildings
    grantPerkStars(building('vehicleFactory'), 6)
    applyPerkPurchase(owner, 'tc.foundation')
    applyPerkPurchase(owner, 'tc.orbit')
    expect(getAdvancedBuildingRequirement('rocketLaunchBase', structures, owner)).toMatch(/Radar Station/)
    structures.push(building('radarStation'))
    expect(getAdvancedBuildingRequirement('rocketLaunchBase', structures, owner)).toBe('')
    const launchBase = building('rocketLaunchBase', { x: 10, y: 10, width: 3, height: 3 })
    const mapGrid = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'land' })))
    const fog = { humanPlayer: owner, buildings: [launchBase], mapGrid }
    updateShadowOfWar(fog, [], mapGrid)
    expect(fog.visibilityMap[11][24]).toEqual({ visible: true, discovered: true })
    expect(fog.visibilityMap[11][28].visible).toBe(false)
    launchBase.isBeingSold = true
    updateShadowOfWar(fog, [], mapGrid)
    expect(fog.visibilityMap[11][24]).toEqual({ visible: false, discovered: true })
    expect(manifest.entries.some(entry => entry.id === 'building:rocketLaunchBase:base')).toBe(true)
  })

  it('[U07338] applies the Spaceship Factory’s prefab boost only while an owned factory operates', () => {
    const factory = building('spaceshipFactory')
    const buildings = [factory]
    expect(getConstructionAssemblySpeedMultiplier(buildings, owner)).toBe(1.2)
    expect(getConstructionAssemblySpeedMultiplier(buildings, 'player2')).toBe(1)
    factory.health = 0
    expect(getConstructionAssemblySpeedMultiplier(buildings, owner)).toBe(1)
    expect(manifest.entries.some(entry => entry.id === 'building:spaceshipFactory:base')).toBe(true)
  })

  it('[U07339] unlocks all aircraft through the Plane Factory without changing production speed', () => {
    const buildings = gameState.buildings
    grantPerkStars(building('vehicleFactory'), 5)
    applyPerkPurchase(owner, 'tc.foundation')
    applyPerkPurchase(owner, 'tc.aerospace')
    expect(getAdvancedBuildingRequirement('planeFactory', buildings, owner)).toMatch(/Airstrip/)
    buildings.push(building('airstrip'))
    expect(getAdvancedBuildingRequirement('planeFactory', buildings, owner)).toBe('')
    expect(AIRCRAFT_TYPES.some(type => computeAvailableUnitTypes(buildings, [], owner).has(type))).toBe(false)
    buildings.push(building('planeFactory'))
    const available = computeAvailableUnitTypes(buildings, [], owner)
    for (const type of AIRCRAFT_TYPES) {
      expect(available.has(type)).toBe(true)
      expect(getAssemblySpeedMultiplier(type, buildings, owner)).toBe(1)
    }
    expect(manifest.entries.some(entry => entry.id === 'building:planeFactory:base')).toBe(true)
  })

})
