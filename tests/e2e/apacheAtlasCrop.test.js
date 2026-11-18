import { expect, test } from '@playwright/test'

test('[E00264] worker-cropped Apache poses preserve atlas pixels and release staging memory', async({ page }) => {
  await page.goto('/?seed=11&size=80&tutorial=0')
  const result = await page.evaluate(async() => {
    const { createAtlasCropClient } = await import('/src/rendering/prepared/atlasCropClient.js')
    const { SpriteResourceStore } = await import('/src/rendering/prepared/spriteResourceStore.js')
    const { entries } = await fetch('/images/prepared/sprite-manifest.json').then(response => response.json())
    const variants = ['neutral', 'backward'].map(pose => entries.find(entry => entry.id === `aircraft:apache:body:0:${pose}`)
      .variants.find(variant => variant.density === 2))
    const store = new SpriteResourceStore({ budgets: { staging: 32 * 1024 * 1024 } })
    const worker = createAtlasCropClient(store)
    const image = new Image()
    image.src = variants[0].path
    await image.decode()
    const controller = new AbortController()
    const canvas = new globalThis.OffscreenCanvas(72, 72)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    function pixels(bitmap) {
      context.clearRect(0, 0, 72, 72)
      context.drawImage(bitmap, 0, 0)
      return context.getImageData(0, 0, 72, 72).data
    }
    let changedChannels = 0
    let distinctPoses = false
    let previous
    try {
      for (const { path, sourceRect: rect } of variants) {
        const crop = await worker.crop(path, rect, 72, 72, controller.signal)
        const reference = await globalThis.createImageBitmap(image, rect.x, rect.y, rect.width, rect.height, {
          resizeWidth: 72, resizeHeight: 72, resizeQuality: 'high'
        })
        const actual = pixels(crop)
        const expected = pixels(reference)
        changedChannels += actual.reduce((total, value, index) => total + (value !== expected[index] ? 1 : 0), 0)
        if (previous) distinctPoses = actual.some((value, index) => value !== previous[index])
        previous = actual
        crop.close()
        reference.close()
      }
    } finally {
      worker.dispose()
    }
    return { changedChannels, distinctPoses, staging: store.snapshot().totals.staging }
  })
  expect(result).toEqual({ changedChannels: 0, distinctPoses: true, staging: 0 })
})
