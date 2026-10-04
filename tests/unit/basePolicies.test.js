import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { POLICY_SCHEMA_VERSION, validatePolicy } from '../../src/policies/policySchema.js'
import { POLICY_TEMPLATES, createBlankPolicy, templatesForVariant } from '../../src/policies/policyTemplates.js'
import {
  applyPolicyToUnit,
  isBuildAutomationOptedIn,
  listEnabledBuildPolicies,
  listEnabledGlobalPolicies,
  resetPolicyStore,
  savePolicy,
  setBuildAutomationOptIn,
  setPolicyEnabled
} from '../../src/policies/policyStore.js'
import { executeBuildCommand, getBuildRefusal } from '../../src/policies/buildCommandApi.js'
import {
  MONEY_MIN_SPAN_MS,
  beginBaseScope,
  measureBaseLeaf,
  resetBaseSensors
} from '../../src/policies/basePolicySensors.js'
import {
  BASE_EVAL_INTERVAL_MS,
  BASE_REFUSED_RETRY_MS,
  describeBasePolicyStatus,
  getBasePolicyStatus,
  resetBasePolicyEngine,
  subscribeBasePolicyEvents,
  updateBasePolicies
} from '../../src/policies/basePolicyEngine.js'

const ME = 'player1'
const FOE = 'player2'

const compare = (field, op, value, extra = {}) => ({ type: 'compare', field, op, value, ...extra })

function buildPolicy(id, when, buildingType, extra = {}) {
  const kind = extra.kind || 'while'
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id,
    name: id,
    variant: 'build',
    scope: 'global',
    execution: extra.execution || 'continuous',
    folderId: null,
    initialStateId: 'watch',
    states: [
      { id: 'watch', name: 'Watch', effect: null, transitions: [kind === 'after' ? { id: 'r1', kind, when, delaySeconds: extra.delaySeconds, to: 'build' } : { id: 'r1', kind, when, to: 'build' }] },
      { id: 'build', name: 'Build', effect: { type: 'buildBuilding', buildingType }, transitions: [] }
    ]
  }
}

function fakeBuild(overrides = {}) {
  const state = { busy: false, queued: [], available: true, yard: true, locked: null, place: { x: 10, y: 10 } }
  Object.assign(state, overrides)
  return {
    state,
    adapter: {
      lockReason: () => state.locked,
      hasConstructionYard: () => state.yard,
      isAvailable: () => state.available,
      isQueueBusy: () => state.busy,
      getCost: type => ({ powerPlant: 2000, oreRefinery: 2500, turretGunV1: 500 })[type] ?? null,
      findPlacement: () => state.place,
      queue: (type, placement) => {
        state.queued.push({ type, placement })
        state.busy = true
        return true
      }
    }
  }
}

function makeContext(overrides = {}) {
  const fake = fakeBuild(overrides.build)
  const context = {
    owner: ME,
    units: [],
    buildings: [],
    money: 5000,
    power: 0,
    earned: 0,
    visible: () => true,
    getMoney: () => context.money,
    getPower: () => context.power,
    getMoneyEarned: () => context.earned,
    isPositionVisible: (owner, x, y) => context.visible(owner, x, y),
    build: fake.adapter,
    ...overrides.context
  }
  return { context, fake }
}

const unit = (owner, type, tile = 5) => ({ id: `${owner}-${type}-${tile}`, owner, type, x: tile * TILE_SIZE, y: tile * TILE_SIZE, tileX: tile, tileY: tile, health: 100 })
const building = (owner, type, x = 2) => ({ id: `${owner}-${type}-${x}`, owner, type, x, y: 2, width: 2, height: 2, health: 100 })

beforeEach(() => {
  localStorage.clear()
  resetPolicyStore()
  resetBasePolicyEngine()
})

describe('build policy schema', () => {
  it('accepts a build policy that uses money, power, inflow and counts', () => {
    const when = {
      type: 'and',
      of: [
        compare('money', '>=', 2000),
        compare('moneyPerMinute', '>=', 100),
        compare('power', '<', 0),
        compare('buildingCount', '<', 2, { buildingType: 'oreRefinery' }),
        compare('unitCount', '>=', 3, { unitType: 'harvester' }),
        compare('enemyUnitCount', '>', 0, { unitType: 'tank_v1' }),
        compare('enemyBuildingCount', '>', 0, { buildingType: 'any' })
      ]
    }
    const result = validatePolicy(buildPolicy('p', when, 'powerPlant'))
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('keeps the unit-only conditions and actions out of build policies', () => {
    expect(validatePolicy(buildPolicy('p', compare('hp', '<', 0.25), 'powerPlant')).valid).toBe(false)
    expect(validatePolicy(buildPolicy('p', { type: 'check', check: 'moving' }, 'powerPlant')).valid).toBe(false)
    expect(validatePolicy(buildPolicy('p', { type: 'enemyInRange' }, 'powerPlant')).valid).toBe(false)
    const unitAction = buildPolicy('p', { type: 'always' }, 'powerPlant')
    unitAction.states[1].effect = { type: 'retreat' }
    expect(validatePolicy(unitAction).valid).toBe(false)
  })

  it('keeps the base-only conditions and actions out of unit policies', () => {
    const unit = createBlankPolicy('u')
    unit.states[0].transitions = [{ id: 'r1', kind: 'if', when: compare('moneyPerMinute', '>', 1), to: 'start' }]
    expect(validatePolicy(unit).valid).toBe(false)
    const build = createBlankPolicy('u')
    build.states[0].effect = { type: 'buildBuilding', buildingType: 'powerPlant' }
    expect(validatePolicy(build).valid).toBe(false)
  })

  it('requires a build policy to be global and validates the building type', () => {
    const perUnit = { ...buildPolicy('p', { type: 'always' }, 'powerPlant'), scope: 'perUnit' }
    expect(validatePolicy(perUnit).errors.map(e => e.code)).toContain('build_scope')
    expect(validatePolicy(buildPolicy('p', { type: 'always' }, 'banana')).valid).toBe(false)
    expect(validatePolicy(buildPolicy('p', { type: 'always' }, 'street')).valid).toBe(false)
  })

  it('still holds a build policy to at most 7 states', () => {
    const policy = buildPolicy('p', { type: 'always' }, 'powerPlant')
    for (let i = 0; i < 6; i++) policy.states.push({ id: `s${i}`, name: `S${i}`, effect: null, transitions: [] })
    expect(policy.states).toHaveLength(8)
    expect(validatePolicy(policy).errors.map(e => e.code)).toContain('too_many_states')
  })

  it('ships valid build templates and a blank build draft', () => {
    const templates = templatesForVariant('build')
    expect(templates.length).toBeGreaterThanOrEqual(3)
    templates.forEach(template => {
      const doc = template.create('t')
      expect(validatePolicy(doc).errors, template.id).toEqual([])
      expect(doc.variant).toBe('build')
      expect(doc.scope).toBe('global')
    })
    const blank = createBlankPolicy('b', 'build')
    expect(validatePolicy(blank).valid).toBe(true)
    expect(templatesForVariant('unit').every(t => t.create('x').variant === 'unit')).toBe(true)
    expect(POLICY_TEMPLATES.length).toBe(templatesForVariant('unit').length + templates.length)
  })
})

describe('build policies in the store', () => {
  it('never lets a build policy reach units or the unit radial', () => {
    const policy = buildPolicy('base-power', compare('power', '<', 0), 'powerPlant')
    expect(savePolicy(ME, policy).ok).toBe(true)
    expect(setPolicyEnabled(ME, 'base-power', true).ok).toBe(true)
    expect(listEnabledGlobalPolicies()).toHaveLength(0)
    expect(listEnabledBuildPolicies(ME)).toHaveLength(1)
    const tank = unit(ME, 'tank_v1')
    expect(applyPolicyToUnit(ME, tank, 'base-power')).toEqual({ ok: false, reason: 'build-policy' })
    expect(tank.policyBindings).toBeUndefined()
  })

  it('lists enabled build policies of one owner only', () => {
    savePolicy(ME, buildPolicy('mine', { type: 'always' }, 'powerPlant'))
    savePolicy(FOE, buildPolicy('theirs', { type: 'always' }, 'powerPlant'))
    setPolicyEnabled(ME, 'mine', true)
    setPolicyEnabled(FOE, 'theirs', true)
    expect(listEnabledBuildPolicies(ME).map(e => e.policy.id)).toEqual(['mine'])
    expect(listEnabledBuildPolicies(FOE).map(e => e.policy.id)).toEqual(['theirs'])
    expect(setPolicyEnabled(ME, 'theirs', false)).toEqual({ ok: false, reason: 'not-owner' })
  })

  it('opts in per player for their own base only, off by default', () => {
    expect(isBuildAutomationOptedIn(ME)).toBe(false)
    expect(setBuildAutomationOptIn(ME, true).ok).toBe(true)
    expect(isBuildAutomationOptedIn(ME)).toBe(true)
    expect(isBuildAutomationOptedIn(FOE)).toBe(false)
    expect(setBuildAutomationOptIn(ME, true, FOE)).toEqual({ ok: false, reason: 'not-owner' })
    expect(isBuildAutomationOptedIn(FOE)).toBe(false)
    expect(isBuildAutomationOptedIn('player')).toBe(true)
    setBuildAutomationOptIn(ME, false)
    expect(isBuildAutomationOptedIn(ME)).toBe(false)
  })

  it('persists the opt-in with the policies', async() => {
    vi.resetModules()
    const first = await import('../../src/policies/policyStore.js')
    first.resetPolicyStore()
    first.savePolicy(ME, buildPolicy('keep', { type: 'always' }, 'powerPlant'))
    first.setPolicyEnabled(ME, 'keep', true)
    first.setBuildAutomationOptIn(ME, true)
    vi.resetModules()
    const second = await import('../../src/policies/policyStore.js')
    second.loadPolicyStore()
    expect(second.isBuildAutomationOptedIn(ME)).toBe(true)
    expect(second.listEnabledBuildPolicies(ME)).toHaveLength(1)
  })
})

describe('base sensors', () => {
  it('reads money, power and own counts by type', () => {
    const { context } = makeContext({
      context: {
        money: 1234,
        power: -40,
        units: [unit(ME, 'harvester'), unit(ME, 'harvester', 6), unit(ME, 'tank_v1', 7), unit(FOE, 'tank_v1', 8)],
        buildings: [building(ME, 'powerPlant'), building(ME, 'oreRefinery', 6), building(FOE, 'powerPlant', 20)]
      }
    })
    beginBaseScope(context, ME, 0)
    expect(measureBaseLeaf(compare('money', '>=', 0))).toBe(1234)
    expect(measureBaseLeaf(compare('power', '>=', 0))).toBe(-40)
    expect(measureBaseLeaf(compare('buildingCount', '>=', 0, { buildingType: 'powerPlant' }))).toBe(1)
    expect(measureBaseLeaf(compare('buildingCount', '>=', 0, { buildingType: 'any' }))).toBe(2)
    expect(measureBaseLeaf(compare('unitCount', '>=', 0, { unitType: 'harvester' }))).toBe(2)
    expect(measureBaseLeaf(compare('unitCount', '>=', 0))).toBe(3)
  })

  it('counts only enemies the player can see', () => {
    const hidden = unit(FOE, 'tank_v1', 30)
    const seen = unit(FOE, 'tank_v1', 8)
    const seenBuilding = building(FOE, 'teslaCoil', 9)
    const hiddenBuilding = building(FOE, 'teslaCoil', 40)
    const { context } = makeContext({
      context: {
        units: [seen, hidden, unit(ME, 'tank_v1', 5)],
        buildings: [seenBuilding, hiddenBuilding, building(ME, 'powerPlant')],
        visible: (owner, x) => x < 20 * TILE_SIZE
      }
    })
    beginBaseScope(context, ME, 0)
    expect(measureBaseLeaf(compare('enemyUnitCount', '>=', 0, { unitType: 'any' }))).toBe(1)
    expect(measureBaseLeaf(compare('enemyUnitCount', '>=', 0, { unitType: 'tank_v1' }))).toBe(1)
    expect(measureBaseLeaf(compare('enemyUnitCount', '>=', 0, { unitType: 'howitzer' }))).toBe(0)
    expect(measureBaseLeaf(compare('enemyBuildingCount', '>=', 0, { buildingType: 'teslaCoil' }))).toBe(1)
    expect(measureBaseLeaf(compare('enemyBuildingCount', '>=', 0, { buildingType: 'any' }))).toBe(1)
  })

  it('does not count dead or embarked units', () => {
    const dead = { ...unit(FOE, 'tank_v1', 8), health: 0 }
    const embarked = { ...unit(FOE, 'tank_v1', 9), embarkedOnId: 'x' }
    const { context } = makeContext({ context: { units: [dead, embarked, unit(FOE, 'tank_v1', 10)] } })
    beginBaseScope(context, ME, 0)
    expect(measureBaseLeaf(compare('enemyUnitCount', '>=', 0))).toBe(1)
  })

  it('measures money inflow per minute from the earnings counter, once there is history', () => {
    resetBaseSensors()
    const { context } = makeContext()
    for (let t = 0; t <= 30000; t += 1000) {
      context.earned = t / 1000 * 50
      beginBaseScope(context, ME, t)
    }
    expect(measureBaseLeaf(compare('moneyPerMinute', '>=', 0))).toBeCloseTo(3000, 5)
  })

  it('has no inflow reading before enough history exists', () => {
    resetBaseSensors()
    const { context } = makeContext()
    beginBaseScope(context, ME, 0)
    context.earned = 100
    beginBaseScope(context, ME, MONEY_MIN_SPAN_MS - 1000)
    expect(measureBaseLeaf(compare('moneyPerMinute', '>=', 0))).toBeUndefined()
    context.earned = 200
    beginBaseScope(context, ME, MONEY_MIN_SPAN_MS)
    expect(measureBaseLeaf(compare('moneyPerMinute', '>=', 0))).toBeCloseTo(1200, 5)
  })

  it('only looks at the last minute of earnings', () => {
    resetBaseSensors()
    const { context } = makeContext()
    context.earned = 0
    beginBaseScope(context, ME, 0)
    context.earned = 100000
    beginBaseScope(context, ME, 1000)
    for (let t = 2000; t <= 130000; t += 1000) {
      beginBaseScope(context, ME, t)
    }
    expect(measureBaseLeaf(compare('moneyPerMinute', '>=', 0))).toBe(0)
  })
})

describe('build command API', () => {
  it('queues a building through the adapter when the engine allows it', () => {
    const { context, fake } = makeContext()
    expect(getBuildRefusal('buildBuilding', { buildingType: 'powerPlant' }, context)).toBeNull()
    expect(executeBuildCommand('buildBuilding', { buildingType: 'powerPlant' }, context)).toEqual({ ok: true, reason: null })
    expect(fake.state.queued).toEqual([{ type: 'powerPlant', placement: { x: 10, y: 10 } }])
  })

  it.each([
    ['the game is paused', { locked: 'the game is paused' }, {}],
    ['a construction yard is required', { yard: false }, {}],
    ['not unlocked', { available: false }, {}],
    ['the construction queue is busy', { busy: true }, {}],
    ['not enough money', {}, { money: 1999 }],
    ['no valid place', { place: null }, {}]
  ])('refuses and queues nothing: %s', (text, build, context) => {
    const { context: ctx, fake } = makeContext({ build, context })
    const result = executeBuildCommand('buildBuilding', { buildingType: 'powerPlant' }, ctx)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain(text)
    expect(fake.state.queued).toHaveLength(0)
  })

  it('refuses unknown commands and buildings a policy may not order', () => {
    const { context } = makeContext()
    expect(executeBuildCommand('buildSpaceport', {}, context).ok).toBe(false)
    expect(executeBuildCommand('buildBuilding', { buildingType: 'street' }, context).ok).toBe(false)
    expect(executeBuildCommand('buildBuilding', { buildingType: 'powerPlant' }, { owner: ME }).ok).toBe(false)
  })
})

describe('base policy engine', () => {
  function enable(policy, owner = ME) {
    expect(savePolicy(owner, policy).ok).toBe(true)
    expect(setPolicyEnabled(owner, policy.id, true).ok).toBe(true)
  }

  it('does nothing until the player opts in', () => {
    enable(buildPolicy('p', { type: 'always' }, 'powerPlant'))
    const { context, fake } = makeContext()
    updateBasePolicies(context, 0)
    expect(fake.state.queued).toHaveLength(0)
    setBuildAutomationOptIn(ME, true)
    updateBasePolicies(context, BASE_EVAL_INTERVAL_MS)
    expect(fake.state.queued).toHaveLength(1)
  })

  it('does nothing for a policy that is saved but not enabled', () => {
    savePolicy(ME, buildPolicy('p', { type: 'always' }, 'powerPlant'))
    setBuildAutomationOptIn(ME, true)
    const { context, fake } = makeContext()
    updateBasePolicies(context, 0)
    expect(fake.state.queued).toHaveLength(0)
  })

  it('never runs another player\'s build policy on this base', () => {
    enable(buildPolicy('theirs', { type: 'always' }, 'powerPlant'), FOE)
    setBuildAutomationOptIn(ME, true)
    setBuildAutomationOptIn(FOE, true)
    const { context, fake } = makeContext()
    updateBasePolicies(context, 0)
    expect(fake.state.queued).toHaveLength(0)
  })

  it('builds while a condition holds and stops when it ends', () => {
    enable(buildPolicy('power', compare('power', '<', 0), 'powerPlant'))
    setBuildAutomationOptIn(ME, true)
    const { context, fake } = makeContext({ context: { power: 20 } })
    updateBasePolicies(context, 0)
    expect(fake.state.queued).toHaveLength(0)
    context.power = -50
    updateBasePolicies(context, 1000)
    expect(fake.state.queued.map(q => q.type)).toEqual(['powerPlant'])
    fake.state.busy = false
    updateBasePolicies(context, 2000)
    updateBasePolicies(context, 3000)
    expect(fake.state.queued).toHaveLength(2)
    context.power = 100
    fake.state.busy = false
    updateBasePolicies(context, 4000)
    updateBasePolicies(context, 8000)
    expect(fake.state.queued).toHaveLength(2)
  })

  it('evaluates at most once per interval', () => {
    enable(buildPolicy('p', { type: 'always' }, 'powerPlant'))
    setBuildAutomationOptIn(ME, true)
    const { context } = makeContext()
    const money = vi.spyOn(context, 'getMoney')
    updateBasePolicies(context, 0)
    const calls = money.mock.calls.length
    for (let t = 16; t < BASE_EVAL_INTERVAL_MS; t += 16) updateBasePolicies(context, t)
    expect(money.mock.calls.length).toBe(calls)
  })

  it('gets refused and reports why instead of spending money it does not have', () => {
    enable(buildPolicy('p', { type: 'always' }, 'powerPlant', { kind: 'if' }))
    setBuildAutomationOptIn(ME, true)
    const { context, fake } = makeContext({ context: { money: 100 } })
    const events = []
    subscribeBasePolicyEvents(event => events.push(event))
    updateBasePolicies(context, 0)
    expect(fake.state.queued).toHaveLength(0)
    expect(events[0]).toMatchObject({ type: 'refused', policyId: 'p' })
    expect(describeBasePolicyStatus(getBasePolicyStatus('p'))).toContain('not enough money')
  })

  it('retries a refused one-shot order until the engine accepts it', () => {
    enable(buildPolicy('p', { type: 'always' }, 'powerPlant', { kind: 'if', execution: 'oneTime' }))
    setBuildAutomationOptIn(ME, true)
    const { context, fake } = makeContext({ context: { money: 100 } })
    updateBasePolicies(context, 0)
    expect(fake.state.queued).toHaveLength(0)
    expect(getBasePolicyStatus('p').finished).toBe(false)
    context.money = 5000
    updateBasePolicies(context, BASE_EVAL_INTERVAL_MS)
    expect(fake.state.queued).toHaveLength(0)
    updateBasePolicies(context, BASE_REFUSED_RETRY_MS)
    expect(fake.state.queued).toHaveLength(1)
    expect(getBasePolicyStatus('p').finished).toBe(true)
    fake.state.busy = false
    updateBasePolicies(context, BASE_REFUSED_RETRY_MS * 3)
    expect(fake.state.queued).toHaveLength(1)
  })

  it('waits for an after delay before building', () => {
    enable(buildPolicy('p', { type: 'always' }, 'radarStation', { kind: 'after', delaySeconds: 5, execution: 'oneTime' }))
    setBuildAutomationOptIn(ME, true)
    const { context, fake } = makeContext({ build: { busy: false } })
    fake.adapter.getCost = () => 100
    updateBasePolicies(context, 0)
    updateBasePolicies(context, 3000)
    expect(fake.state.queued).toHaveLength(0)
    updateBasePolicies(context, 6000)
    expect(fake.state.queued.map(q => q.type)).toEqual(['radarStation'])
  })

  it('combines money, counts and visible enemies in one rule', () => {
    const when = {
      type: 'and',
      of: [
        compare('enemyUnitCount', '>=', 2, { unitType: 'any' }),
        compare('buildingCount', '<', 1, { buildingType: 'turretGunV1' })
      ]
    }
    enable(buildPolicy('def', when, 'turretGunV1'))
    setBuildAutomationOptIn(ME, true)
    const { context, fake } = makeContext({ context: { units: [unit(FOE, 'tank_v1', 8)] } })
    updateBasePolicies(context, 0)
    expect(fake.state.queued).toHaveLength(0)
    context.units.push(unit(FOE, 'rocketTank', 9))
    updateBasePolicies(context, 1000)
    expect(fake.state.queued.map(q => q.type)).toEqual(['turretGunV1'])
  })

  it('resets its state when the policy is turned off and on again', () => {
    enable(buildPolicy('p', { type: 'always' }, 'powerPlant', { kind: 'if', execution: 'oneTime' }))
    setBuildAutomationOptIn(ME, true)
    const { context, fake } = makeContext()
    updateBasePolicies(context, 0)
    expect(getBasePolicyStatus('p').finished).toBe(true)
    setPolicyEnabled(ME, 'p', false)
    updateBasePolicies(context, 1000)
    expect(getBasePolicyStatus('p')).toBeNull()
    setPolicyEnabled(ME, 'p', true)
    fake.state.busy = false
    updateBasePolicies(context, 2000)
    expect(fake.state.queued).toHaveLength(2)
  })

  it('starts over when simulation time goes backwards (new game)', () => {
    enable(buildPolicy('p', { type: 'always' }, 'powerPlant', { kind: 'if', execution: 'oneTime' }))
    setBuildAutomationOptIn(ME, true)
    const { context, fake } = makeContext()
    updateBasePolicies(context, 500000)
    fake.state.busy = false
    updateBasePolicies(context, 0)
    expect(fake.state.queued).toHaveLength(2)
  })

  it('leaves the game running: it never touches the pause flag', async() => {
    const { gameState } = await import('../../src/gameState.js')
    gameState.gamePaused = false
    enable(buildPolicy('p', { type: 'always' }, 'powerPlant'))
    setBuildAutomationOptIn(ME, true)
    const { context } = makeContext()
    updateBasePolicies(context, 0)
    expect(gameState.gamePaused).toBe(false)
  })
})
