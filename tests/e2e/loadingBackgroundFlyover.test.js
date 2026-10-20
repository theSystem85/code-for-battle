import { test, expect } from '@playwright/test'

async function openLoadingScreen(page) {
  // Hold the real initial overlay in place without starting gameplay.
  await page.route('**/src/startup.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
  await page.goto('/')
  await expect(page.locator('#loadingScreen')).toBeVisible()
}

async function sampleBackdrop(page, time) {
  return page.locator('.loading-screen__backdrop img').evaluate((image, currentTime) => {
    const animation = image.getAnimations()[0]
    animation.pause()
    animation.currentTime = currentTime
    const { x, y, right, bottom, width, height } = image.getBoundingClientRect()
    return { x, y, right, bottom, width, height }
  }, time)
}

for (const { width, height, direction, zoom } of [
  { width: 2560, height: 1080, direction: 'y', zoom: false },
  { width: 1920, height: 1080, direction: 'y', zoom: true },
  { width: 390, height: 844, direction: 'x', zoom: false },
  { width: 1024, height: 768, direction: 'x', zoom: false }
]) {
  test(`[E00209] loading flyover keeps the image covered and moves one way at ${width}x${height}`, async({ page }) => {
    await page.setViewportSize({ width, height })
    await openLoadingScreen(page)
    const first = await sampleBackdrop(page, 0)
    let previous = first
    for (const time of [1000, 10000, 120000, 600000]) {
      const next = await sampleBackdrop(page, time)
      expect(next[direction]).toBeGreaterThan(previous[direction])
      expect(next[direction === 'x' ? 'y' : 'x']).toBeCloseTo(first[direction === 'x' ? 'y' : 'x'], 2)
      expect(next.x).toBeLessThanOrEqual(-7.9)
      expect(next.y).toBeLessThanOrEqual(-7.9)
      expect(next.right).toBeGreaterThanOrEqual(width + 7.9)
      expect(next.bottom).toBeGreaterThanOrEqual(height + 7.9)
      previous = next
    }
    const coverScale = Math.max((width + 16) / 16, (height + 16) / 9)
    expect(first.width / (16 * coverScale)).toBeCloseTo(zoom ? (124 * height / 100) / (height + 16) : 1, 2)

    await page.locator('#loadingScreen').evaluate(root => root.classList.add('loading-screen--hidden'))
    await expect(page.locator('#loadingScreen')).toBeHidden()
    expect(await page.locator('.loading-screen__backdrop img').evaluate(image => image.getAnimations().length)).toBe(0)
    await page.locator('#loadingScreen').evaluate(root => root.classList.remove('loading-screen--hidden'))
    expect((await sampleBackdrop(page, 1000))[direction]).toBeGreaterThan(first[direction])
  })
}

test('[E00210] loading flyover adapts after rotating the viewport', async({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1080 })
  await openLoadingScreen(page)
  await sampleBackdrop(page, 10000)
  await page.setViewportSize({ width: 390, height: 844 })
  const first = await sampleBackdrop(page, 0)
  const next = await sampleBackdrop(page, 10000)
  expect(next.x).toBeGreaterThan(first.x)
  expect(next.y).toBeCloseTo(first.y, 2)
  expect(next.right).toBeGreaterThanOrEqual(398)
  expect(next.bottom).toBeGreaterThanOrEqual(852)
})

test('[E00211] loading background stays still with reduced motion', async({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openLoadingScreen(page)
  expect(await page.locator('.loading-screen__backdrop img').evaluate(image => image.getAnimations().length)).toBe(0)
})
