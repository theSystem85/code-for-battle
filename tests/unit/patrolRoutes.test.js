import { beforeEach, describe, expect, it, vi } from 'vitest'
import { beginPatrol, cancelPatrol, parsePatrolRoute, updatePatrols, validPatrolPoints } from '../../src/game/patrolRoutes.js'
import { gameState } from '../../src/gameState.js'
import { ownsPerk, applyPerkPurchase, adjustPerkStars, setAutomationPerkMode } from '../../src/perks/perkState.js'
import { applyMapAction, mapActionOptions } from '../../src/ui/mapActions/mapActionCommands.js'
import { parseCFBL, printCFBL, toMachine } from '../../src/automation/cfbl/index.js'
import { applyPolicyEffect, noteDirectOrder } from '../../src/policies/policyEngine.js'
import { migrateLiveState } from '../../src/gameStateMigrations.js'
import { createRadialMenu } from '../../src/ui/radialMenu/radialMenu.js'

const nearby = vi.hoisted(() => ({ ground: [], air: [] }))
vi.mock('../../src/game/spatialQuadtree.js', () => ({ getSpatialQuadtree: () => ({ queryNearbyGround: () => nearby.ground, queryNearbyAir: () => nearby.air }) }))
vi.mock('../../src/replaySystem.js', () => ({ recordReplayCommand: vi.fn(), createReplayUnitReferences: ids => ids.map(id => ({ id })), createReplayEntityReference: entity => ({ id: entity.id }) }))

function unit(id = 'u', extra = {}) { return { id, type: 'tank_v1', owner: 'player1', health: 100, x: 48, y: 48, speed: 1, tileX: 2, tileY: 2, ...extra } }
function context() {
  return { now: 1000, units: [], buildings: [], mapGrid: Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'land' }))),
    commands: { handleMovementCommand: vi.fn((units, x, y) => units.forEach(unit => { unit.path = [{ x: Math.floor(x / 32), y: Math.floor(y / 32) }]; unit.moveTarget = { x, y }; unit.target = null })) },
    canTarget: (unit, target) => unit.type === 'tank_v1' && target.type !== 'apache', isVisible: () => true }
}
const points = [{ x: 176, y: 176 }, { x: 336, y: 176 }, { x: 336, y: 336 }]

beforeEach(() => {
  gameState.humanPlayer = 'player1'
  gameState.perks = { automationPerkMode: 'required', owners: {} }
  globalThis.__AUTOMATION_PERK_MODE__ = 'required'
  nearby.ground = []
  nearby.air = []
})

describe('patrol routes', () => {
  it('[U07380] loops to the first route point, maintaining stable route state between ticks', () => {
    const ctx = context()
    const tank = unit()
    expect(beginPatrol([tank], points, ctx)).toBe(true)
    const route = tank.patrol.points
    const patrol = tank.patrol
    updatePatrols([tank], ctx, 1000)
    expect(ctx.commands.handleMovementCommand).toHaveBeenLastCalledWith([tank], 176, 176, ctx.mapGrid)
    for (let i = 0; i < 3; i++) {
      const next = route[tank.patrol.index]
      tank.x = next.x - 16; tank.y = next.y - 16
      updatePatrols([tank], ctx, 2000 + i * 2000)
    }
    expect(tank.patrol.index).toBe(0)
    expect(tank.patrol).toBe(patrol)
    expect(tank.patrol.points).toBe(route)
    expect(points).toHaveLength(3)
  })
  it('[U07381] inserts current position for a single point and starts towards the requested destination', () => {
    const tank = unit()
    expect(beginPatrol([tank], [points[0]], context())).toBe(true)
    expect(tank.patrol.points).toEqual([{ x: 64, y: 64 }, points[0]])
    expect(tank.patrol.index).toBe(1)
  })
  it('[U07382] stagger-starts independent units by equal fractions of the closed route travel time', () => {
    const units = [unit('a'), unit('b'), unit('c')]
    const ctx = context()
    beginPatrol(units, points, ctx)
    const times = units.map(unit => unit.patrol.startAt)
    expect(times[0]).toBe(1000)
    expect(times[1] - times[0]).toBeCloseTo(times[2] - times[1])
    ctx.commands.handleMovementCommand.mockClear()
    updatePatrols(units, ctx, 1000)
    expect(ctx.commands.handleMovementCommand).toHaveBeenCalledOnce()
    expect(ctx.commands.handleMovementCommand.mock.calls[0][0]).toEqual([units[0]])
  })
  it('[U07383] keeps a formation together and waits for every member at each waypoint', () => {
    const units = [unit('f1', { formationActive: true, groupNumber: 1, formationOffset: { x: -16, y: 0 } }), unit('f2', { formationActive: true, groupNumber: 1, formationOffset: { x: 16, y: 0 } }), unit('solo')]
    const ctx = context()
    beginPatrol(units, points, ctx)
    expect(units[0].patrol.startAt).toBe(units[1].patrol.startAt)
    expect(units[2].patrol.startAt).toBeGreaterThan(units[0].patrol.startAt)
    updatePatrols(units, ctx, 1000)
    expect(units.slice(0, 2).every(unit => unit.patrol.moving)).toBe(true)
    units[0].x = 144; units[0].y = 160
    updatePatrols(units, ctx, 2000)
    expect(units[0].patrol.index).toBe(0)
    units[1].x = 176; units[1].y = 160
    updatePatrols(units, ctx, 2100)
    expect(units.slice(0, 2).map(unit => unit.patrol.index)).toEqual([1, 1])
  })
  it('[U07384] acquires valid visible hostile units automatically while retaining the movement route', () => {
    const tank = unit('u', { canFire: false })
    const ctx = context()
    const friend = unit('friend', { x: 80 })
    const enemy = unit('enemy', { owner: 'player2', x: 100 })
    nearby.ground = [friend, unit('dead', { owner: 'player2', health: 0 }), enemy]
    nearby.air = [unit('air', { type: 'apache', owner: 'player2' })]
    beginPatrol([tank], points, ctx)
    updatePatrols([tank], ctx, 1000)
    expect(tank.canFire).toBe(true)
    expect(tank.target).toBe(enemy)
    expect(tank.patrol.points).toEqual(points)
    nearby.ground = [friend]
    updatePatrols([tank], ctx, 1300)
    expect(tank.target).toBeNull()
  })
  it('[U07385] allows naval and air routes and rejects out-of-bounds, foreign or locked map orders', () => {
    const ctx = context()
    const ship = unit('ship', { type: 'destroyer', isNaval: true })
    const air = unit('air', { type: 'apache', isAirUnit: true })
    ctx.mapGrid[5][5].type = 'water'
    expect(validPatrolPoints(ship, [points[0]], ctx.mapGrid)).toBe(true)
    expect(validPatrolPoints(unit(), [points[0]], ctx.mapGrid)).toBe(false)
    expect(validPatrolPoints(air, [points[0]], ctx.mapGrid)).toBe(true)
    ctx.units = [ship]
    const payload = { action: 'patrol', x: 176, y: 176, points: [points[0]], entityIds: ['ship'] }
    expect(mapActionOptions([ship], 'player1')).toContain('patrol')
    expect(applyMapAction(payload, 'player1', ctx)).toBe(false)
    expect(applyMapAction(payload, 'player2', ctx)).toBe(false)
    expect(ship.patrol).toBeUndefined()
  })
  it('[U07386] unlocks the patrol effect and map action for exactly two additional stars', () => {
    gameState.buildings = [{ type: 'commandCenter', owner: 'player1', health: 100 }]
    adjustPerkStars('player1', 7)
    expect(applyPerkPurchase('player1', 'cc.unit.start').ok).toBe(true)
    expect(ownsPerk('player1', 'cc.unit.do.patrol')).toBe(false)
    expect(applyPerkPurchase('player1', 'cc.unit.do.patrol', 2).ok).toBe(true)
    expect(gameState.perks.owners.player1.spent).toBe(7)
    const tank = unit()
    const ctx = context(); ctx.units = [tank]
    expect(applyMapAction({ action: 'patrol', points, entityIds: [tank.id] }, 'player1', ctx)).toBe(true)
    noteDirectOrder([tank])
    expect(tank.patrol).toBeNull()
    const transport = unit('transport', { type: 'c5Galaxy', patrol: { index: 0 }, c5Mission: { phase: 'patrolHold' } })
    cancelPatrol(transport)
    expect(transport.patrol).toBeNull()
    expect(transport.c5Mission.phase).toBe('return')
  })
  it('[U07387] parses, validates, prints and executes an arbitrary CFBL patrol route', () => {
    setAutomationPerkMode('allUnlocked')
    const source = 'control unit { scope individual; run once; start 1; state 1 { do patrol(route="5,5;10,5;10,10"); } }'
    const parsed = parseCFBL(source)
    expect(parsed.diagnostics).toEqual([])
    expect(parseCFBL(printCFBL(parsed.ast)).diagnostics).toEqual([])
    const policy = toMachine(parsed.ast, { automationId: 'patrol-test' })
    const tank = unit()
    expect(applyPolicyEffect(tank, policy.states[0].effect, context())).toBe(true)
    expect(tank.patrol.points).toEqual([{ x: 176, y: 176 }, { x: 336, y: 176 }, { x: 336, y: 336 }])
    expect(parseCFBL(source.replace('5,5;10,5;10,10', '-1,5')).diagnostics.length).toBeGreaterThan(0)
    expect(parsePatrolRoute('5,5;bad')).toBeNull()
    expect(parsePatrolRoute('1,1;'.repeat(257))).toBeNull()
  })
  it('[U07394] uses bounded carrier wings for automatic strikes and respects artillery minimum range', () => {
    const ctx = context()
    ctx.canTarget = () => true
    ctx.onPatrolTarget = vi.fn()
    const carrier = unit('carrier', { type: 'aircraftCarrier', isNaval: true })
    const aircraft = unit('wing', { type: 'f35', carrierId: carrier.id })
    const enemy = unit('enemy', { owner: 'player2', x: 160 })
    nearby.ground = [enemy]
    const shipGrid = ctx.mapGrid.map(row => row.map(() => ({ type: 'water' })))
    ctx.mapGrid = shipGrid
    beginPatrol([carrier], points, ctx)
    ctx.units = [carrier, aircraft, enemy]
    updatePatrols(ctx.units, ctx, 1000)
    expect(ctx.onPatrolTarget).toHaveBeenCalledWith(carrier, enemy, [aircraft])
    const gun = unit('gun', { type: 'howitzer' })
    ctx.mapGrid = context().mapGrid
    beginPatrol([gun], points, ctx)
    nearby.ground = [enemy, unit('far', { owner: 'player2', x: 400 })]
    updatePatrols([gun], ctx, 1000)
    expect(gun.target.id).toBe('far')
  })
  it('[U07388] migrates old saves without modifying their queues or starting patrols', () => {
    const unit = Object.freeze({ id: 'saved', commandQueue: Object.freeze([]) })
    const state = Object.freeze({ schemaVersion: 11, gameState: {}, units: Object.freeze([unit]) })
    const migrated = migrateLiveState(state, 11, 12)
    expect(migrated.units[0]).toMatchObject({ id: 'saved', patrol: null })
    expect(unit).not.toHaveProperty('patrol')
    expect(migrated.units[0].commandQueue).toBe(unit.commandQueue)
  })
  it('[U07389] can explain a locked radial action without executing it', () => {
    const menu = createRadialMenu()
    const explain = vi.fn()
    const select = vi.fn()
    const { layout } = menu.open({ x: 200, y: 200 }, [{ id: 'patrol', disabled: true, onDisabledSelect: explain, onSelect: select }])
    menu.activate(layout.points[0].x, layout.points[0].y)
    expect(explain).toHaveBeenCalledOnce()
    expect(select).not.toHaveBeenCalled()
    expect(menu.isOpen()).toBe(false)
    menu.destroy()
  })
})
