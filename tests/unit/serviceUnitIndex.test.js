import { describe, expect, it } from 'vitest'
import { lookupServiceUnit, ServiceUnitIndex } from '../../src/game/serviceUnitIndex.js'

describe('service unit index', () => {
  it('[U07204] keeps alias owners in source order and clears stale service targets on rebuild', () => {
    const alias = { id: 'alias', owner: 'player', type: 'tank' }
    const ambulance = { id: 'ambulance', owner: 'player1', type: 'ambulance' }
    const exiting = { id: 'exiting', owner: 'player1', type: 'recoveryTank', factoryExit: true }
    const dead = { id: 'dead', owner: 'player2', type: 'tankerTruck', health: 0 }
    const index = new ServiceUnitIndex().rebuild([alias, ambulance, exiting, dead])

    expect(index.friendly('player')).toEqual([alias, ambulance, exiting])
    expect(index.ambulances).toEqual([ambulance])
    expect(index.tankers).toEqual([])
    expect(index.recoveryTanks).toEqual([])
    expect(lookupServiceUnit(index, [], exiting.id)).toBe(exiting)

    index.rebuild([ambulance])
    expect(lookupServiceUnit(index, [], exiting.id)).toBeUndefined()
    expect(index.friendly('player1')).toEqual([ambulance])
  })
})
