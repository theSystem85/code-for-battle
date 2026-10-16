import { test, expect } from '@playwright/test'

test.use({ hasTouch: true })

test('sheet canvases pan, pinch and synchronize sidebar zoom', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  await page.evaluate(async() => {
    await window.__SSE__.newSheet({ cols: 8, rows: 8, tileSize: 64 })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp'))
    const transfer = new window.DataTransfer()
    transfer.items.add(new window.File([blob], 'source.webp', { type: 'image/webp' }))
    document.querySelector('#sseSourcePane').dispatchEvent(new window.DragEvent('drop', { bubbles: true, dataTransfer: transfer }))
  })
  await expect(page.locator('#sseSourceCanvas')).toBeVisible()
  for (const [selector, inputSelector, transformed] of [
    ['#sseCanvasWrap', '#sseZoomInput', '#sseCanvasViewport'],
    ['#sseSourceCanvas', '#sseZoom-source-1', '#sseSourceCanvas']
  ]) {
    const input = page.locator(inputSelector)
    const canvas = page.locator(selector)
    const transform = () => page.locator(transformed).evaluate(el => {
      const matrix = new window.DOMMatrix(window.getComputedStyle(el).transform)
      return { scale: matrix.a, x: matrix.e, y: matrix.f }
    })
    await input.fill('100')
    await expect.poll(async() => (await transform()).scale).toBe(1)
    const before = await transform()
    await canvas.hover()
    await page.mouse.wheel(30, 40)
    await expect.poll(async() => (await transform()).y).not.toBe(before.y)
    expect((await transform()).scale).toBe(1)
    await expect(input).toHaveValue('100')
    await canvas.evaluate(el => {
      const rect = el.getBoundingClientRect()
      el.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -40,
        clientX: rect.left + 40, clientY: rect.top + 40 }))
    })
    await expect.poll(async() => (await transform()).scale).toBeGreaterThan(1)
    expect(Number(await input.inputValue()) / 100).toBeCloseTo((await transform()).scale, 4)
    await input.fill('150')
    await expect.poll(async() => (await transform()).scale).toBe(1.5)
    await canvas.evaluate(el => {
      const rect = el.getBoundingClientRect()
      const send = (type, distance) => {
        const touches = distance ? [0, distance].map((offset, identifier) => new window.Touch({
          identifier, target: el, clientX: rect.left + 30 + offset, clientY: rect.top + 50
        })) : []
        el.dispatchEvent(new window.TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: touches }))
      }
      send('touchstart', 60)
      send('touchmove', 120)
      send('touchend', 0)
    })
    await expect.poll(async() => (await transform()).scale).toBe(3)
    await expect(input).toHaveValue('300')
  }
})
