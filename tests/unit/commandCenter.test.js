import { describe, expect, it } from 'vitest'
import { buildingData } from '../../src/data/buildingData.js'
import { buildingImageMap } from '../../src/buildingImageMap.js'
import { getMissingBuildingRequirements } from '../../src/production/buildingRequirements.js'
import { productionUnlockRules } from '../../src/production/techTree.js'

describe('Command Center building', () => {
  it('[U07274] is a unique 3x3 Radar-gated building with prepared art', () => {
    expect(buildingData.commandCenter).toMatchObject({ width: 3, height: 3, cost: 3500, power: -100, health: 400, armor: 2, requiresRadar: true, limit: 1 })
    expect(getMissingBuildingRequirements('commandCenter', new Set(['constructionYard','powerPlant','oreRefinery','vehicleFactory']))).toContain('Radar Station')
    expect(getMissingBuildingRequirements('commandCenter', new Set(['constructionYard','powerPlant','oreRefinery','vehicleFactory','radarStation']))).not.toContain('Radar Station')
    expect(productionUnlockRules.find(rule => rule.requires.length === 1 && rule.requires[0] === 'radarStation').buildings).toContain('commandCenter')
    expect(buildingImageMap.commandCenter).toBe('images/map/buildings/command_center.webp')
  })
})
