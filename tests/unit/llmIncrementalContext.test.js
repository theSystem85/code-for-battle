import { describe, expect, it } from 'vitest'
import { createStrategicContextTracker } from '../../src/ai/llmIncrementalContext.js'

function input(tick, units, buildings = [], money = 1000, events = []) {
  return { playerId: 'ai', tick, meta: { tilesX: 40, tilesY: 30 }, constraints: { maxActionsPerTick: 10 }, snapshot: { resources: { money }, units, buildings }, transitions: { events } }
}
const unit = (id, owner, x, health = 100) => ({ id, type: 'tank', owner, health, maxHealth: 100, tilePosition: { x, y: 2 } })

describe('strategic incremental context', () => {
  it('sends schema-once initial tables then ordered coalesced deltas', () => {
    const tracker = createStrategicContextTracker()
    const initial = tracker.build(input(1, [unit('a', 'ai', 1), unit('seen', 'human', 4)]))
    expect(initial).toMatchObject({ contextVersion: '1.0', mode: 'initial', revision: 1 })
    expect(initial.units.columns).toEqual(['id', 'type', 'owner', 'health', 'maxHealth', 'x', 'y'])

    const delta = tracker.build(input(2, [unit('a', 'ai', 3, 70), unit('new', 'ai', 5)], [], 800, [{ id: 'ev2', type: 'damage', tick: 2 }]))
    expect(delta).toMatchObject({ mode: 'delta', fromRevision: 1, revision: 2 })
    expect(delta.changes.units.changed).toHaveLength(1)
    expect(delta.changes.units.created[0][0]).toBe('new')
    expect(delta.changes.units.destroyed).toEqual([])
    expect(delta.changes.units.changed.some(row => row[0] === 'seen')).toBe(false)
    expect(delta.changes.events[0].id).toBe('ev2')
  })

  it('does not reveal whether an enemy merely left visibility', () => {
    const tracker = createStrategicContextTracker()
    tracker.build(input(1, [unit('own', 'ai', 1), unit('hidden-next', 'human', 8)]))
    const delta = tracker.build(input(2, [unit('own', 'ai', 1)]))
    expect(delta.changes.units.destroyed).toEqual([])
    expect(tracker.query({ entityId: 'hidden-next' }).rows).toHaveLength(1)
  })

  it('returns bounded region and entity queries', () => {
    const tracker = createStrategicContextTracker()
    tracker.build(input(1, [unit('a', 'ai', 1), unit('b', 'ai', 8)]))
    expect(tracker.query({ region: { x: 0, y: 0, width: 4, height: 4 }, maxRows: 1 }).rows[0][0]).toBe('a')
    expect(tracker.query({ entityId: 'b' }).rows[0][0]).toBe('b')
  })
})
