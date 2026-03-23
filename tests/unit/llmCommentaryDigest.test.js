import { describe, expect, it } from 'vitest'
import { buildCompactCommentaryInput, hasInterestingCommentaryEvents } from '../../src/ai/llmCommentaryDigest.js'

describe('llmCommentaryDigest', () => {
  it('builds a compact commentary payload with owner context and anti-repeat memory', () => {
    const rawInput = {
      protocolVersion: '1.0',
      playerId: 'player2',
      tick: 440,
      snapshot: {
        units: [
          {
            id: 'tank-1',
            type: 'tank_v1',
            owner: 'player2',
            tilePosition: { x: 10, y: 10, space: 'tile' }
          },
          {
            id: 'enemy-howitzer',
            type: 'howitzer',
            owner: 'player1',
            tilePosition: { x: 40, y: 40, space: 'tile' }
          }
        ],
        buildings: [
          {
            id: 'yard-1',
            type: 'constructionYard',
            owner: 'player2',
            tilePosition: { x: 8, y: 8, space: 'tile' }
          },
          {
            id: 'enemy-refinery',
            type: 'oreRefinery',
            owner: 'player1',
            tilePosition: { x: 44, y: 42, space: 'tile' }
          }
        ]
      },
      transitions: {
        summary: { totalDamage: 80, unitsDestroyed: 1, buildingsDestroyed: 0 },
        events: [
          { type: 'damage', tick: 438, targetId: 'enemy-refinery', amount: 80 },
          { type: 'destroyed', tick: 439, victimId: 'tank-1', victimKind: 'unit' }
        ]
      }
    }

    const digest = buildCompactCommentaryInput(rawInput, {
      summary: 'Tick 440 | MyUnits 1 EnemyUnits 1',
      recentComments: ['You call that artillery?', 'My tanks smell fear.'],
      humanPlayerId: 'player1',
      maxHighlights: 4,
      maxRecentComments: 2
    })

    expect(digest.inputMode).toBe('compact-commentary-v1')
    expect(digest.ownerContext.selfPlayerId).toBe('player2')
    expect(digest.ownerContext.humanPlayerId).toBe('player1')
    expect(digest.ownerContext.hostPerspectiveSide).toBe('enemy')
    expect(digest.ownerContext.opposingOwners).toEqual(['player1'])
    expect(digest.ownerContext.visibleEnemyUnitTypes).toEqual({ howitzer: 1 })
    expect(digest.recentDeltas.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'damage', side: 'enemy', entityId: 'enemy-refinery', entityType: 'oreRefinery' }),
        expect.objectContaining({ type: 'destroyed', side: 'self', entityId: 'tank-1', entityType: 'tank_v1' })
      ])
    )
    expect(digest.antiRepeat.recentComments).toEqual(['You call that artillery?', 'My tanks smell fear.'])
  })

  it('recognizes the actual transition collector event types as commentary-worthy', () => {
    expect(hasInterestingCommentaryEvents([{ type: 'damage' }])).toBe(true)
    expect(hasInterestingCommentaryEvents([{ type: 'destroyed' }])).toBe(true)
    expect(hasInterestingCommentaryEvents([{ type: 'building_completed' }])).toBe(true)
    expect(hasInterestingCommentaryEvents([{ type: 'unknown_noise' }])).toBe(false)
  })

  it('keeps the compact commentary payload smaller than the raw input', () => {
    const rawInput = {
      protocolVersion: '1.0',
      playerId: 'player2',
      tick: 500,
      snapshot: {
        units: Array.from({ length: 10 }, (_, index) => ({
          id: `enemy-${index}`,
          type: index % 2 === 0 ? 'tank_v1' : 'rocketTank',
          owner: 'player1',
          tilePosition: { x: 20 + index, y: 30 + index, space: 'tile' }
        })),
        buildings: [
          {
            id: 'yard-1',
            type: 'constructionYard',
            owner: 'player2',
            tilePosition: { x: 5, y: 5, space: 'tile' }
          },
          {
            id: 'enemy-yard',
            type: 'constructionYard',
            owner: 'player1',
            tilePosition: { x: 70, y: 70, space: 'tile' }
          }
        ]
      },
      transitions: {
        summary: { totalDamage: 160, unitsDestroyed: 2, buildingsDestroyed: 0 },
        events: Array.from({ length: 8 }, (_, index) => ({
          type: 'damage',
          tick: 490 + index,
          targetId: index % 2 === 0 ? 'enemy-yard' : `enemy-${index}`,
          amount: 20
        }))
      }
    }

    const rawSize = JSON.stringify(rawInput).length
    const digestSize = JSON.stringify(buildCompactCommentaryInput(rawInput, {
      summary: 'Tick 500 | pressure rising',
      recentComments: ['line one', 'line two', 'line three']
    })).length

    expect(digestSize).toBeLessThan(rawSize)
  })
})
