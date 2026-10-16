import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createMapLongPressController } from '../../src/ui/mapActions/longPressController.js'
import { applicableAutomations, mapActionOptions, applyMapAction } from '../../src/ui/mapActions/mapActionCommands.js'
import { updateUnitPolicies, noteDirectOrder } from '../../src/policies/policyEngine.js'
import { updateMapArrival } from '../../src/policies/mapArrivalOrders.js'
import { resetPolicyStore, savePolicy } from '../../src/policies/policyStore.js'
import { POLICY_TEMPLATES } from '../../src/policies/policyTemplates.js'
import { TILE_SIZE, MAP_ACTION_LONG_PRESS_MS, setMapActionLongPressMs } from '../../src/config.js'

const tank = () => ({ id: 'tank', owner: 'player1', type: 'tank', health: 100, x: 0, y: 0, tileX: 0, tileY: 0 })
const turret = () => ({ id: 'turret', owner: 'player1', type: 'turretGunV1', health: 100, isBuilding: true })

describe('map long press controller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  function setup() {
    const open = vi.fn(() => true)
    const progress = vi.fn()
    const controller = createMapLongPressController({ duration: () => 1500, open, progress })
    return { controller, open, progress }
  }
  it('delays feedback and opens once at the configured duration, consuming release', () => {
    const { controller, open, progress } = setup()
    controller.down({ x: 100, y: 100 })
    progress.mockClear()
    vi.advanceTimersByTime(199)
    expect(progress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(progress).toHaveBeenCalledWith({ x: 100, y: 100 }, 1300)
    vi.advanceTimersByTime(1299)
    expect(open).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(open).toHaveBeenCalledTimes(1)
    expect(controller.up()).toBe(true)
    expect(controller.up()).toBe(false)
  })
  it('short release never opens or consumes the click', () => {
    const { controller, open } = setup()
    controller.down({ x: 0, y: 0 })
    vi.advanceTimersByTime(1499)
    expect(controller.up()).toBe(false)
    vi.advanceTimersByTime(2000)
    expect(open).not.toHaveBeenCalled()
  })
  it.each([{ touch: false, threshold: 8 }, { touch: true, threshold: 12 }])('cancels movement beyond $threshold px', ({ touch, threshold }) => {
    const { controller, open } = setup()
    controller.down({ x: 0, y: 0, touch })
    controller.move({ x: threshold, y: 0 })
    expect(controller.isTracking()).toBe(true)
    controller.move({ x: threshold + 0.1, y: 0 })
    vi.advanceTimersByTime(2000)
    expect(open).not.toHaveBeenCalled()
  })
  it('external cancellation prevents opening after a pan or second pointer', () => {
    const { controller, open } = setup()
    controller.down({ x: 0, y: 0 })
    controller.cancel()
    vi.advanceTimersByTime(5000)
    expect(open).not.toHaveBeenCalled()
    expect(controller.up()).toBe(false)
  })
})

describe('map action selection and dispatch', () => {
  beforeEach(() => resetPolicyStore())
  it('filters ownership and building capabilities', () => {
    expect(mapActionOptions([tank()], 'player1')).toEqual(['forceAttackAt', 'defendHoldAt'])
    expect(mapActionOptions([turret()], 'player1')).toEqual(['forceAttackAt', 'holdFire', 'clearTarget'])
    expect(mapActionOptions([{ ...tank(), owner: 'player2' }, { ...turret(), type: 'powerPlant' }], 'player1')).toEqual([])
    expect(mapActionOptions([tank(), turret()], 'player1')).toContain('defendHoldAt')
  })
  it('lists only owned per-unit unit policies for programmable selected units', () => {
    const entry = (id, variant = 'unit', scope = 'perUnit', ownerId = 'player1') => ({ ownerId, policy: { id, variant, scope } })
    const entries = [entry('yes'), entry('base', 'build'), entry('defence', 'defence'), entry('global', 'unit', 'global'), entry('foreign', 'unit', 'perUnit', 'player2')]
    expect(applicableAutomations([tank(), turret()], 'player1', entries).map(entry => entry.policy.id)).toEqual(['yes'])
    expect(applicableAutomations([turret()], 'player1', entries)).toEqual([])
    expect(applicableAutomations([{ ...tank(), type: 'harvester' }], 'player1', entries)).toEqual([])
  })
  function context() {
    const unit = tank()
    const building = turret()
    return { unit, building, units: [unit], buildings: [building], mapGrid: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'grass' }))), commands: { handleMovementCommand: vi.fn(), handleAttackCommand: vi.fn() } }
  }
  it('uses force attack handlers for units and the existing defence target queue', () => {
    const ctx = context()
    expect(applyMapAction({ action: 'forceAttackAt', x: 64, y: 64, entityIds: ['tank', 'turret'] }, 'player1', ctx)).toBe(true)
    expect(ctx.commands.handleAttackCommand).toHaveBeenCalledWith([ctx.unit], expect.objectContaining({ isGroundTarget: true, x: 64, y: 64 }), ctx.mapGrid, true)
    expect(ctx.unit.forcedAttack).toBe(true)
    expect(ctx.building.forcedAttackTarget.isGroundTarget).toBe(true)
  })
  it('moves then holds only upon center-based arrival', () => {
    const ctx = context()
    applyMapAction({ action: 'defendHoldAt', x: 2.5 * TILE_SIZE, y: 2.5 * TILE_SIZE, entityIds: ['tank', 'turret'] }, 'player1', ctx)
    expect(ctx.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
    updateMapArrival(ctx.unit)
    expect(ctx.unit.mapHoldPosition).toBeUndefined()
    ctx.unit.x = 1.75 * TILE_SIZE
    ctx.unit.y = 1.75 * TILE_SIZE
    updateMapArrival(ctx.unit)
    expect(ctx.unit.mapHoldPosition).toMatchObject({ action: 'defendHoldAt' })
    expect(ctx.unit.moveTarget).toBeNull()
  })
  it('applies a policy on arrival rather than when ordering movement', () => {
    const ctx = context()
    const policy = { ...POLICY_TEMPLATES[0].create('arrival-test'), scope: 'perUnit' }
    savePolicy('player1', policy)
    const entry = applicableAutomations([ctx.unit], 'player1')[0]
    expect(entry).toBeDefined()
    applyMapAction({ action: 'applyAutomationOnArrival', x: 2.5 * TILE_SIZE, y: 2.5 * TILE_SIZE, policyId: entry.policy.id, entityIds: ['tank'] }, 'player1', ctx)
    expect(ctx.unit.policyBindings).toBeUndefined()
    ctx.unit.x = 2 * TILE_SIZE
    ctx.unit.y = 2 * TILE_SIZE
    updateMapArrival(ctx.unit)
    expect(ctx.unit.policyBindings.some(binding => binding.policyId === entry.policy.id)).toBe(true)
  })
  it('engages in range while held and releases hold for a new direct order', () => {
    const ctx = context()
    const enemy = { ...tank(), id: 'enemy', owner: 'player2', x: 64, y: 0 }
    ctx.units.push(enemy)
    ctx.getFireRange = () => 100
    ctx.unit.mapArrivalAction = { action: 'defendHoldAt', x: 16, y: 16, owner: 'player1' }
    updateUnitPolicies(ctx.units, ctx, 1000)
    expect(ctx.unit.mapHoldPosition).toBeTruthy()
    expect(ctx.unit.target).toBe(enemy)
    expect(ctx.unit.moveTarget).toBeNull()
    enemy.x = 350
    updateUnitPolicies(ctx.units, ctx, 1300)
    expect(ctx.unit.target).toBeNull()
    expect(ctx.unit.moveTarget).toBeNull()
    noteDirectOrder([ctx.unit], 1400)
    expect(ctx.unit.mapHoldPosition).toBeNull()
    expect(ctx.unit.mapArrivalAction).toBeNull()
  })
  it('lets held destroyers use the existing in-range attack command', () => {
    const ctx = context()
    ctx.unit.type = 'destroyer'
    ctx.unit.isNaval = true
    ctx.unit.mapArrivalAction = { action: 'defendHoldAt', x: 16, y: 16, owner: 'player1' }
    const enemy = { ...tank(), id: 'enemy', owner: 'player2', x: 64, y: 0 }
    ctx.units.push(enemy)
    ctx.getFireRange = () => 100
    updateUnitPolicies(ctx.units, ctx, 1000)
    expect(ctx.unit.target).toBe(enemy)
    expect(ctx.unit.moveTarget).toBeNull()
  })
  it('holds and clears defence fire without issuing movement to buildings', () => {
    const ctx = context()
    applyMapAction({ action: 'forceAttackAt', x: 64, y: 64, entityIds: ['turret'] }, 'player1', ctx)
    applyMapAction({ action: 'holdFire', x: 64, y: 64, entityIds: ['turret', 'tank'] }, 'player1', ctx)
    expect(ctx.building.holdFire).toBe(true)
    expect(ctx.building.forcedAttackTarget).toBeNull()
    applyMapAction({ action: 'clearTarget', x: 64, y: 64, entityIds: ['turret'] }, 'player1', ctx)
    expect(ctx.building.holdFire).toBe(false)
    expect(ctx.commands.handleMovementCommand).not.toHaveBeenCalled()
  })
  it('rejects malformed, foreign and off-map orders', () => {
    const ctx = context()
    expect(applyMapAction({ action: 'defendHoldAt', x: -1, y: 0, entityIds: ['tank'] }, 'player1', ctx)).toBe(false)
    expect(applyMapAction({ action: 'defendHoldAt', x: 64, y: 64, entityIds: ['tank'] }, 'player2', ctx)).toBe(false)
    expect(ctx.commands.handleMovementCommand).not.toHaveBeenCalled()
  })
  it('clamps the persisted setting and rejects invalid durations', () => {
    expect(setMapActionLongPressMs(200)).toBe(true)
    expect(MAP_ACTION_LONG_PRESS_MS).toBe(300)
    setMapActionLongPressMs(9000)
    expect(MAP_ACTION_LONG_PRESS_MS).toBe(5000)
    expect(setMapActionLongPressMs(NaN)).toBe(false)
    setMapActionLongPressMs(1500)
  })
})
