import { expect, test } from '@playwright/test'

test.use({ deviceScaleFactor: 2 })

for (const fallback of [false, true]) {
  test(`[E00031] explosion sheets are ready before combat with ${fallback ? 'startup fallback' : 'worker preparation'}`, async({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ fallback }) => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
      const observations = { workers: 0, readyBeforePlay: false, gameplayReadbacks: 0 }
      window.explosionPreparationTest = observations
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          const explosion = String(url).includes('explosionPreparation.worker')
          if (explosion && fallback) throw new Error('Test worker startup failure')
          super(url, options)
          if (explosion) {
            observations.workers++
            this.addEventListener('message', event => {
              if (event.data.texture) observations.readyBeforePlay = !window.gameInstance?.gameLoop?.running
            })
          }
        }
      }
      const getImageData = window.CanvasRenderingContext2D.prototype.getImageData
      window.CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        if (window.gameInstance?.gameLoop?.running && args[2] * args[3] >= 1024 * 1024) observations.gameplayReadbacks++
        return getImageData.apply(this, args)
      }
    }, { fallback })
    await page.goto('/?seed=11&size=100&players=4&heavyBattle=1&battleUnits=80&benchmarkDurationMs=60000&heavyBattleWarmupMs=0')
    await page.waitForFunction(() => window.gameState?.heavyBattleBenchmark && window.gameInstance?.gameLoop?.running)
    const result = await page.evaluate(async() => {
      const { getSpriteSheetTexture, getImageTextureWithBlendMode, renderSpriteSheetAnimation } = await import('/src/rendering/spriteSheetAnimation.js')
      const { spawnDestructionExplosion } = await import('/src/game/spriteSheetEffects.js')
      const game = window.gameInstance
      const texture = getSpriteSheetTexture('images/map/animations/explosion.webp')
      if (!texture) throw new Error(`Explosion not ready at gameplay start: ${JSON.stringify(window.explosionPreparationTest)}`)
      const observations = { ...window.explosionPreparationTest }
      game.gameLoop.stop()
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 1024
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(texture, 0, 0)
      const actual = ctx.getImageData(0, 0, 1024, 1024).data
      const image = new Image()
      image.src = '/images/map/animations/explosion.webp'
      await image.decode()
      ctx.clearRect(0, 0, 1024, 1024)
      ctx.drawImage(getImageTextureWithBlendMode(image), 0, 0)
      const expected = ctx.getImageData(0, 0, 1024, 1024).data
      let differentBytes = 0
      for (let index = 0; index < actual.length; index++) if (actual[index] !== expected[index]) differentBytes++
      // Exercise every animation frame at the existing size/cadence without
      // creating another asset job or invoking synchronous black-key work.
      const animation = spawnDestructionExplosion(window.gameState, 64, 64, { startTime: 0 })
      for (let frame = 0; frame < 229; frame++) renderSpriteSheetAnimation(ctx, animation, { x: 0, y: 0 }, frame * 1050 / 229)
      return {
        ...observations, differentBytes,
        bitmap: texture instanceof globalThis.ImageBitmap,
        ready: texture.width === 1024 && texture.height === 1024,
        shared: texture === getSpriteSheetTexture('images/map/animations/explosion.webp') && texture === getSpriteSheetTexture('/images/map/animations/explosion.webp'),
        workersAfterAnimation: window.explosionPreparationTest.workers
      }
    })
    expect(result.ready).toBe(true)
    expect(result.shared).toBe(true)
    expect(result.differentBytes).toBe(0)
    expect(result.gameplayReadbacks).toBe(0)
    expect(result.bitmap).toBe(!fallback)
    expect(result.workers).toBe(fallback ? 0 : 1)
    expect(result.workersAfterAnimation).toBe(result.workers)
    if (!fallback) expect(result.readyBeforePlay).toBe(true)
    expect(errors).toEqual([])
  })
}
