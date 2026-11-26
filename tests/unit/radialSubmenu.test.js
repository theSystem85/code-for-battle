import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRadialMenu } from '../../src/ui/radialMenu/radialMenu.js'
import { layoutRadialSubmenu, resolveRadialTiming } from '../../src/ui/radialMenu/radialLayout.js'

function point(button) {
  return { x: parseFloat(button.style.getPropertyValue('--tx')), y: parseFloat(button.style.getPropertyValue('--ty')) }
}

describe('reusable radial submenus', () => {
  let menu
  let select
  beforeEach(() => {
    vi.useFakeTimers()
    select = vi.fn()
    menu = createRadialMenu()
    menu.open({ x: 400, y: 300 }, [{ id: 'supply', text: 'Supply', children: [
      { id: 'ammo', text: 'Ammo', onSelect: select }, { id: 'repair', disabled: true, text: 'Repair', onSelect: select },
      { id: 'gas', text: 'Gas', onSelect: select }, { id: 'crew', text: 'Crew', onSelect: select }
    ] }])
  })
  afterEach(() => { menu.destroy(); vi.useRealTimers() })
  it('[U07367] opens after 300ms and selects a child on the same drag release', () => {
    const parent = point(menu.element.querySelector('[data-id="supply"]'))
    menu.updatePointer(400, 300)
    menu.updatePointer(parent.x, parent.y)
    vi.advanceTimersByTime(299)
    expect(menu.element.querySelector('[data-id="ammo"]')).toBeNull()
    vi.advanceTimersByTime(1)
    const child = point(menu.element.querySelector('[data-id="ammo"]'))
    expect(child.y).toBeLessThan(parent.y + 1)
    menu.release(child.x, child.y)
    expect(select).toHaveBeenCalledOnce()
    expect(menu.isOpen()).toBe(false)
  })
  it('[U07368] cancels the submenu timer on leave and close, and ignores disabled children', () => {
    const parent = point(menu.element.querySelector('[data-id="supply"]'))
    menu.updatePointer(parent.x, parent.y)
    vi.advanceTimersByTime(200)
    menu.updatePointer(400, 300)
    vi.advanceTimersByTime(300)
    expect(menu.element.querySelector('[data-id="ammo"]')).toBeNull()
    menu.updatePointer(parent.x, parent.y)
    vi.advanceTimersByTime(300)
    const disabled = point(menu.element.querySelector('[data-id="repair"]'))
    menu.activate(disabled.x, disabled.y)
    expect(select).not.toHaveBeenCalled()
    menu.close()
    vi.advanceTimersByTime(500)
    expect(menu.isOpen()).toBe(false)
  })
  it('[U07369] allows a selected action to open a subsequent menu', () => {
    menu.open({ x: 400, y: 300 }, [{ id: 'next', onSelect: () => menu.open({ x: 400, y: 300 }, [{ id: 'final' }]) }])
    const next = point(menu.element.querySelector('[data-id="next"]'))
    menu.release(next.x, next.y)
    expect(menu.element.querySelector('[data-id="final"]')).not.toBeNull()
  })
  it.each([{ x: 35, y: 35 }, { x: 285, y: 35 }, { x: 35, y: 565 }, { x: 285, y: 565 }])('[U07370] fits a four-item fan on a mobile corner at $x,$y', parent => {
    const points = layoutRadialSubmenu(4, parent, -Math.PI / 2, { viewport: { x: 0, y: 0, width: 320, height: 600 }, buttonSize: 48 })
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(34)
      expect(p.x).toBeLessThanOrEqual(286)
      expect(p.y).toBeGreaterThanOrEqual(34)
      expect(p.y).toBeLessThanOrEqual(566)
    }
    for (let i = 1; i < points.length; i++) expect(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)).toBeGreaterThanOrEqual(48)
  })
  it('[U07371] halves the default fly and stagger times', () => {
    expect(resolveRadialTiming(4)).toMatchObject({ flyMs: 110, staggerMs: 20 })
  })
})
