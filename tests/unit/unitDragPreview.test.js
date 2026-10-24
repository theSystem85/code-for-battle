import { beforeEach, expect, it } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { initUnitDragPreview, unitDragSprites } from '../../src/ui/unitDragPreview.js'
import { existsSync } from 'node:fs'

beforeEach(() => {
  document.body.innerHTML = '<canvas id="gameCanvas"></canvas>'
  document.getElementById('gameCanvas').getBoundingClientRect = () => ({ left: 100, top: 0, right: 800, bottom: 600 })
  gameState.draggedUnitType = null
  initUnitDragPreview()
})

it('[U05464] shows map sprite layers only over the map and clears on release or cancellation', () => {
  const preview = document.getElementById('unitDragPreview')
  gameState.draggedUnitType = 'tank'
  document.dispatchEvent(new MouseEvent('dragover', { clientX: 300, clientY: 200 }))
  expect(preview.hidden).toBe(false)
  expect(preview.style.left).toBe('300px')
  expect(preview.querySelector('div:not([hidden]) img').src).toContain('/images/map/units/tankV1_wagon.webp')
  document.dispatchEvent(new Event('drop'))
  expect(preview.hidden).toBe(true)
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 200 }))
  expect(preview.hidden).toBe(false)
  document.dispatchEvent(new Event('pointercancel'))
  expect(preview.hidden).toBe(true)
  document.dispatchEvent(new MouseEvent('dragover', { clientX: 20, clientY: 200 }))
  expect(preview.hidden).toBe(true)
})

it('[U05465] uses existing map assets for every supported production unit', () => {
  for (const layers of Object.values(unitDragSprites)) {
    for (const layer of layers) expect(existsSync(`public/images/map/units/${layer}.webp`)).toBe(true)
  }
  initUnitDragPreview()
  expect(document.querySelectorAll('#unitDragPreview')).toHaveLength(1)
})
