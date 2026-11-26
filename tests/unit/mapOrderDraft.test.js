import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMapOrderDraft } from '../../src/ui/mapActions/mapOrderDraft.js'
import { gameState } from '../../src/gameState.js'

describe('map order drafts', () => {
  let canvas
  let draft
  let commit
  let locked
  function pointer(type, id, x, y) {
    return draft.handle({ type, pointerId: id, clientX: x, clientY: y, button: 0, target: canvas, preventDefault() {}, stopImmediatePropagation() {} })
  }
  function tap(id, x, y) { pointer('pointerdown', id, x, y); pointer('pointerup', id, x, y) }
  beforeEach(() => {
    canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 400 })
    gameState.mapGrid = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'land' })))
    gameState.scrollOffset = { x: 0, y: 0 }
    commit = vi.fn(() => true)
    locked = false
    draft = createMapOrderDraft({ canvas, commit, locked: () => locked, resetInput() {} })
  })
  afterEach(() => { draft.clear(); document.body.innerHTML = '' })
  it('[U07372] does not issue movement until a two-finger tap finalizes all route points', () => {
    draft.start('planPath', ['tank'])
    tap(1, 100, 100)
    tap(1, 150, 150)
    expect(commit).not.toHaveBeenCalled()
    expect(document.querySelectorAll('.map-order-draft__point')).toHaveLength(2)
    pointer('pointerdown', 1, 200, 200)
    pointer('pointerdown', 2, 250, 200)
    pointer('pointerup', 1, 200, 200)
    expect(commit).not.toHaveBeenCalled()
    pointer('pointerup', 2, 250, 200)
    expect(commit).toHaveBeenCalledWith('planPath', { x: 100, y: 100, points: [{ x: 100, y: 100 }, { x: 150, y: 150 }] }, ['tank'])
    expect(draft.active()).toBe(false)
  })
  it('[U07373] treats a two-finger pan as camera movement and leaves the route open', () => {
    draft.start('planPath', ['tank'])
    tap(1, 100, 100)
    pointer('pointerdown', 1, 200, 200)
    pointer('pointerdown', 2, 250, 200)
    pointer('pointermove', 1, 160, 200)
    pointer('pointerup', 1, 160, 200)
    pointer('pointerup', 2, 250, 200)
    expect(gameState.scrollOffset.x).toBe(20)
    expect(commit).not.toHaveBeenCalled()
    expect(draft.active()).toBe(true)
  })
  it('[U07374] commits a retreat on the next valid destination and keeps the captured selection', () => {
    const selection = ['tank']
    draft.start('retreatTo', selection)
    selection.push('other')
    gameState.mapGrid[3][3].type = 'water'
    tap(1, 100, 100)
    expect(commit).not.toHaveBeenCalled()
    tap(1, 200, 200)
    expect(commit).toHaveBeenCalledWith('retreatTo', expect.objectContaining({ x: 200, y: 200 }), ['tank'])
  })
  it('[U07375] clears cancelled or locked drafts without issuing orders', () => {
    draft.start('planPath', ['tank'])
    tap(1, 100, 100)
    pointer('pointercancel', 1, 100, 100)
    expect(draft.active()).toBe(false)
    draft.start('retreatTo', ['tank'])
    locked = true
    tap(1, 200, 200)
    expect(draft.active()).toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })
})
