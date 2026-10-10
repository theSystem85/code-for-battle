import { beforeEach, describe, expect, it } from 'vitest'
import { executeUnitBuildCommand, getUnitBuildRefusal } from '../../src/policies/unitBuildCommandApi.js'
import { validatePolicy } from '../../src/policies/policySchema.js'
import { templatesForVariant } from '../../src/policies/policyTemplates.js'
import { beginBaseScope, measureBaseLeaf, resetBaseSensors } from '../../src/policies/basePolicySensors.js'

describe('unit build policy command API', () => {
  let queued
  let context

  beforeEach(() => {
    queued = []
    context = {
      unitBuild: {
        lockReason: () => null,
        isAvailable: () => true,
        queueLength: () => queued.reduce((total, item) => total + item.quantity, 0),
        queue: order => { queued.push(order); return true }
      }
    }
  })

  it('queues a validated stack with its delivery order', () => {
    const args = { unitType: 'rocketTank', quantity: 3, delivery: 'attackHarvester' }
    expect(executeUnitBuildCommand('buildUnits', args, context)).toEqual({ ok: true, reason: null })
    expect(queued).toEqual([args])
  })

  it('refuses invalid, locked, unavailable, and overflowing requests without changing the queue', () => {
    expect(getUnitBuildRefusal('buildUnits', { unitType: 'tank', quantity: 21, delivery: 'defendBase' }, context)).toContain('between 1 and 20')
    expect(executeUnitBuildCommand('buildUnits', { unitType: 'unknown', quantity: 1, delivery: 'defendBase' }, context).ok).toBe(false)
    context.unitBuild.lockReason = () => 'the game is paused'
    expect(executeUnitBuildCommand('buildUnits', { unitType: 'tank', quantity: 1, delivery: 'defendBase' }, context).reason).toBe('the game is paused')
    expect(queued).toEqual([])
  })
})

describe('unit build policy documents and loss sensor', () => {
  beforeEach(() => resetBaseSensors())

  it('ships valid production, delivery, and destroyed-unit replacement templates', () => {
    const templates = templatesForVariant('unitBuild')
    expect(templates.map(item => item.id)).toEqual(expect.arrayContaining([
      'replace-lost-tank', 'harvester-escort-stack', 'harvester-raiders'
    ]))
    templates.forEach(template => expect(validatePolicy(template.create(`test-${template.id}`)).valid).toBe(true))
  })

  it('reports a destroyed unit type for exactly the next base-policy pass', () => {
    const tank = { id: 'tank-1', type: 'tank', owner: 'player1', health: 100 }
    const context = { units: [tank], buildings: [] }
    const condition = { type: 'check', check: 'ownUnitDestroyed', unitType: 'tank_v1' }
    beginBaseScope(context, 'player1', 0)
    expect(measureBaseLeaf(condition)).toBe(false)
    context.units = []
    beginBaseScope(context, 'player1', 1000)
    expect(measureBaseLeaf(condition)).toBe(true)
    beginBaseScope(context, 'player1', 2000)
    expect(measureBaseLeaf(condition)).toBe(false)
  })
})
