import { test, expect } from '@playwright/test'

for (const density of [1, 3]) {
  test.describe(`recovery and Apache sprites at DPR ${density}`, () => {
    test.use({ deviceScaleFactor: density })
    test('[E00241] renders regenerated sources at the requested density with centered rotor and forward rocket mounts', async({ page }) => {
      // Exercise production rendering in isolation from simulation timing and AI.
      await page.route('**/sprite-review', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }))
      await page.goto('/sprite-review')
      const result = await page.evaluate(async density => {
        window.logger = () => {}
        const pipeline = await import('/src/rendering/prepared/preparedSpritePipeline.js')
        const prepared = await pipeline.prepareSpriteRegistry({
          density,
          resourceStore: null,
          fetchImpl: async(...args) => {
            const response = await fetch(...args)
            const manifest = await response.json()
            manifest.entries = manifest.entries.filter(entry => entry.id === 'unit:recoveryTank:base' || entry.id.startsWith('aircraft:apache:'))
            return { ok: true, json: async() => manifest }
          }
        })
        pipeline.publishPreparedSpriteRegistry(prepared)
        const { renderRecoveryTankWithImage } = await import('/src/rendering/recoveryTankImageRenderer.js')
        const { renderApacheWithImage, getApacheRocketSpawnPoints } = await import('/src/rendering/apacheImageRenderer.js')
        const canvas = document.createElement('canvas')
        canvas.width = 400 * density
        canvas.height = 120 * density
        document.body.append(canvas)
        const ctx = canvas.getContext('2d')
        ctx.scale(density, density)
        const rendered = []
        const forwards = []
        for (const [index, direction] of [0, Math.PI / 2, Math.PI, Math.PI * 1.5].entries()) {
          const unit = { direction, altitude: 0, rotor: { angle: 0 } }
          rendered.push(renderRecoveryTankWithImage(ctx, unit, 50 + index * 100, 30))
          rendered.push(renderApacheWithImage(ctx, unit, 50 + index * 100, 85))
          const points = getApacheRocketSpawnPoints(unit, 0, 0)
          forwards.push(points.left.x * Math.cos(direction) + points.left.y * Math.sin(direction))
        }
        const recovery = pipeline.getPreparedSprite('unit:recoveryTank:base')
        const rotor = pipeline.getPreparedSprite('aircraft:apache:rotor')
        const body = pipeline.getPreparedSprite('aircraft:apache:body:0:neutral')
        return {
          rendered, forwards,
          widths: [recovery.backingWidth, rotor.backingWidth, body.backingWidth],
          rotorAnchor: rotor.anchors.rotor,
          alphaPixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data.filter((value, index) => index % 4 === 3 && value > 0).length
        }
      }, density)
      expect(result.rendered).toEqual(Array(8).fill(true))
      expect(result.widths).toEqual([32 * density, 48 * density, 48 * density])
      expect(result.rotorAnchor).toEqual({ x: 24, y: 24, sourceX: 128, sourceY: 128 })
      for (const forward of result.forwards) expect(forward).toBeCloseTo(5.5125)
      expect(result.alphaPixels).toBeGreaterThan(1000 * density * density)
    })
  })
}
