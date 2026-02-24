import { beforeEach, describe, expect, it } from 'vitest'
import '../setup.js'
import { canPlaceBuilding } from '../../src/validation/buildingPlacement.js'
import { createTestMapGrid, resetGameState } from '../testUtils.js'
import { isAirstripBlockedLocalTile } from '../../src/utils/buildingPassability.js'

describe('build-only occupation', () => {
  beforeEach(() => {
    resetGameState()
  })

  it('prevents placing buildings on build-only occupied tiles', () => {
    const mapGrid = createTestMapGrid(20, 20)
    mapGrid[5][5].buildOnlyOccupied = 1

    const canPlace = canPlaceBuilding(
      'street',
      5,
      5,
      mapGrid,
      [],
      [],
      [],
      'player',
      { mapEditMode: true }
    )

    expect(canPlace).toBe(false)
  })

  it('treats the lower-left section of the airstrip footprint as blocked', () => {
    expect(isAirstripBlockedLocalTile(0, 0, 12, 6)).toBe(false)
    expect(isAirstripBlockedLocalTile(0, 5, 12, 6)).toBe(true)
  })
})
