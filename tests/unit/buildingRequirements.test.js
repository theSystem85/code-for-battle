import { describe, expect, it } from 'vitest'
import { getBuildingRequirements, getMissingBuildingRequirements } from '../../src/production/buildingRequirements.js'

const missing = (type, owned) => getMissingBuildingRequirements(type, new Set(owned))

describe('shared sidebar building requirements', () => {
  it('preserves conditional build-order messages and each phase of base construction', () => {
    expect(missing('oreRefinery', ['constructionYard'])).toEqual(['Power Plant'])
    expect(missing('oreRefinery', ['constructionYard', 'powerPlant'])).toEqual([])
    expect(missing('vehicleFactory', ['constructionYard'])).toEqual(['Power Plant'])
    expect(missing('vehicleFactory', ['constructionYard', 'powerPlant'])).toEqual(['Ore Refinery'])
    expect(missing('vehicleFactory', ['constructionYard', 'powerPlant', 'oreRefinery'])).toEqual([])
    expect(missing('hospital', ['constructionYard', 'powerPlant', 'oreRefinery'])).toEqual(['Vehicle Factory'])
    expect(missing('hospital', ['constructionYard', 'powerPlant', 'oreRefinery', 'vehicleFactory'])).toEqual([])
  })

  it('preserves radar/factory flags, special yard/street rules and message order', () => {
    expect(missing('helipad', ['constructionYard', 'powerPlant', 'oreRefinery', 'vehicleFactory'])).toEqual(['Radar Station'])
    expect(missing('shipyard', [])).toEqual(['Construction Yard', 'Radar Station', 'Vehicle Factory', 'Power Plant'])
    expect(missing('ammunitionFactory', ['constructionYard', 'powerPlant', 'oreRefinery'])).toEqual(['Vehicle Factory'])
    expect(missing('constructionYard', [])).toEqual(['Vehicle Workshop'])
    expect(missing('constructionYard', ['vehicleWorkshop'])).toEqual([])
    expect(missing('street', [])).toEqual([])
    expect(missing('powerPlant', [])).toEqual(['Construction Yard'])
  })

  it('reuses prepared requirement definitions', () => {
    expect(getBuildingRequirements('shipyard')).toBe(getBuildingRequirements('shipyard'))
  })
})
