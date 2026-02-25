import { describe, expect, it } from 'vitest'
import {
  getCascadingBlueprintCancellation,
  isBlueprintConnectedToBase,
  mapBlueprintsToFootprints
} from '../../src/planning/blueprintPlanning.js'

describe('blueprintPlanning', () => {
  it('treats planned blueprints as placeable footprints for proximity checks', () => {
    const blueprints = [
      { type: 'concreteWall', x: 4, y: 0 },
      { type: 'concreteWall', x: 8, y: 0 }
    ]

    const planningBuildings = mapBlueprintsToFootprints(blueprints, 'player')
    expect(planningBuildings).toHaveLength(2)
    expect(planningBuildings[0]).toMatchObject({ x: 4, y: 0, owner: 'player' })
  })

  it('finds cascading consecutive cancellations when base connection is broken', () => {
    const baseBuildings = [{ x: 0, y: 0, width: 2, height: 2, owner: 'player' }]
    const blueprints = [
      { type: 'concreteWall', x: 4, y: 0 },
      { type: 'concreteWall', x: 8, y: 0 },
      { type: 'concreteWall', x: 11, y: 0 },
      { type: 'concreteWall', x: 16, y: 0 }
    ]

    const cancelled = getCascadingBlueprintCancellation(
      blueprints[0],
      blueprints,
      baseBuildings,
      [],
      'player'
    )

    expect(cancelled).toEqual([blueprints[0], blueprints[1], blueprints[2], blueprints[3]])
  })

  it('keeps plans connected through remaining structures', () => {
    const baseBuildings = [{ x: 0, y: 0, width: 2, height: 2, owner: 'player' }]
    const blueprints = [
      { type: 'concreteWall', x: 4, y: 0 },
      { type: 'concreteWall', x: 8, y: 0 },
      { type: 'concreteWall', x: 4, y: 3 }
    ]

    const connected = isBlueprintConnectedToBase(
      blueprints[2],
      blueprints,
      baseBuildings,
      [],
      'player',
      { exclude: new Set([blueprints[0]]) }
    )

    expect(connected).toBe(true)
  })
})
