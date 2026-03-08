import { test, expect } from '@playwright/test'

test.describe('Street sidebar build button image', () => {
  test('uses a dedicated desert-style street icon instead of placeholder art', async({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#sidebar', { state: 'visible' })

    const streetButtonImage = page.locator('button.production-button[data-building-type="street"] img')
    await expect(streetButtonImage).toBeVisible()

    const imageMetadata = await streetButtonImage.evaluate((img) => ({
      src: img.getAttribute('src'),
      dataSrc: img.getAttribute('data-src'),
      alt: img.getAttribute('alt')
    }))

    expect(imageMetadata.alt).toBe('Street')
    expect(imageMetadata.dataSrc).toBe('images/sidebar/street_sidebar.svg')
    expect(imageMetadata.src).toBe('images/sidebar/placeholder.webp')

    const iconCheck = await page.evaluate(async() => {
      const probe = new Image()
      probe.src = '/images/sidebar/street_sidebar.svg'
      await new Promise((resolve, reject) => {
        probe.onload = resolve
        probe.onerror = reject
      })

      return {
        width: probe.naturalWidth,
        height: probe.naturalHeight
      }
    })

    expect(iconCheck.width).toBeGreaterThan(0)
    expect(iconCheck.height).toBeGreaterThan(0)
  })
})
