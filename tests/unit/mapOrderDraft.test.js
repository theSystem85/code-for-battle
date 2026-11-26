import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMapOrderDraft, getMapOrderPreview } from '../../src/ui/mapActions/mapOrderDraft.js'
import { PathPlanningRenderer } from '../../src/rendering/pathPlanningRenderer.js'
import { gameState } from '../../src/gameState.js'

describe('map order drafts', () => {
  let canvas
  let draft
  let commit
  let locked
  let requestRender
  function pointer(type, id, x, y, button = 0) {
    return draft.handle({ type, pointerId: id, clientX: x, clientY: y, button, target: canvas, preventDefault() {}, stopImmediatePropagation() {} })
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
    requestRender = vi.fn()
    draft = createMapOrderDraft({ canvas, commit, locked: () => locked, resetInput() {}, requestRender })
  })
  afterEach(() => { draft.clear(); document.body.innerHTML = '' })
  it('[U07372] does not issue movement until a two-finger tap finalizes all route points', () => {
    draft.start('planPath', ['tank'])
    tap(1, 100, 100)
    tap(1, 150, 150)
    expect(commit).not.toHaveBeenCalled()
    expect(getMapOrderPreview().points).toEqual([{ x: 100, y: 100 }, { x: 150, y: 150 }])
    expect(requestRender).toHaveBeenCalledTimes(2)
    pointer('pointerdown', 1, 200, 200)
    pointer('pointerdown', 2, 250, 200)
    pointer('pointerup', 1, 200, 200)
    expect(commit).not.toHaveBeenCalled()
    pointer('pointerup', 2, 250, 200)
    expect(commit).toHaveBeenCalledWith('planPath', { x: 100, y: 100, points: [{ x: 100, y: 100 }, { x: 150, y: 150 }] }, ['tank'])
    expect(draft.active()).toBe(false)
    expect(requestRender).toHaveBeenCalledTimes(3)
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
  it('[U07374] commits the captured selection and points on desktop right-click', () => {
    const selection = ['tank']
    draft.start('planPath', selection)
    selection.push('other')
    gameState.mapGrid[3][3].type = 'water'
    tap(1, 100, 100)
    expect(commit).not.toHaveBeenCalled()
    tap(1, 200, 200)
    expect(commit).not.toHaveBeenCalled()
    expect(pointer('pointerdown', 1, 300, 300, 2)).toBe(true)
    expect(commit).toHaveBeenCalledWith('planPath', { x: 200, y: 200, points: [{ x: 200, y: 200 }] }, ['tank'])
    expect(getMapOrderPreview()).toBeNull()
  })
  it('[U07400] draws numbered patrol markers with a line and direction on each leg', () => {
    draft.start('patrol', ['tank'])
    tap(1, 80, 80)
    tap(1, 160, 80)
    tap(1, 160, 160)
    const ctx = Object.fromEntries(['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'fillText'].map(method => [method, vi.fn()]))
    new PathPlanningRenderer().render(ctx, [], { x: 8, y: 0 })

    expect(ctx.arc).toHaveBeenCalledTimes(3)
    expect(ctx.fillText.mock.calls).toEqual([['1', 72, 80], ['2', 152, 80], ['3', 152, 160]])
    expect(ctx.lineTo).toHaveBeenCalledWith(152, 80)
    expect(ctx.lineTo).toHaveBeenCalledWith(115, 80)
    expect(ctx.lineTo).toHaveBeenCalledTimes(9)
  })

  it('[U07375] clears cancelled or locked drafts without issuing orders', () => {
    draft.start('planPath', ['tank'])
    tap(1, 100, 100)
    pointer('pointercancel', 1, 100, 100)
    expect(draft.active()).toBe(false)
    draft.start('patrol', ['tank'])
    locked = true
    tap(1, 200, 200)
    expect(draft.active()).toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })
})
