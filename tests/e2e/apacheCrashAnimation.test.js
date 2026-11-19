import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

test('[E00265] a destroyed Apache draws its prepared body and rotor throughout the fall before exploding', async({ page }) => {
  await prepareRegressionScenario(page, 213)
  const sprites = { bodyId: 'aircraft:apache:body:90:neutral', rotorId: 'aircraft:apache:rotor' }
  await page.evaluate(() => window.__regression.unit('apache', window.__regression.human, 24, 24).id)
  await page.waitForFunction(async({ bodyId, rotorId }) => {
    const { getPreparedSprite } = await import('/src/rendering/prepared/preparedSpritePipeline.js')
    return Boolean(getPreparedSprite(bodyId) && getPreparedSprite(rotorId))
  }, sprites)

  const result = await page.evaluate(async() => {
    const { UnitRenderer } = await import('/src/rendering/unitRenderer.js')
    const { cleanupDestroyedUnits } = await import('/src/game/gameStateManager.js')
    const unit = window.gameInstance.units.find(unit => unit.type === 'apache')
    const units = [unit]
    const state = { simulationTime: 1000, explosions: [], humanPlayer: unit.owner, playerUnitsDestroyed: 0 }
    const renderer = new UnitRenderer()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const offset = { x: unit.x - 64, y: unit.y - 64 }
    const drawImage = ctx.drawImage.bind(ctx)
    const draws = []
    ctx.drawImage = (image, ...args) => {
      const transform = ctx.getTransform()
      const [x, y] = args
      const center = transform.transformPoint({ x: x + image.width / 2, y: y + image.height / 2 })
      const id = image.__preparedSpriteAudit?.id || (image.currentSrc ?? 'unprepared canvas')
      draws.push({ id, y: center.y, angle: Math.atan2(transform.b, transform.a) })
      drawImage(image, ...args)
    }
    unit.direction = Math.PI / 2
    unit.altitude = 40
    unit.rotor.angle = 0.1
    unit.rotor.speed = 0.04
    unit.health = 0

    function frame(simulationTime) {
      draws.length = 0
      state.simulationTime = simulationTime
      cleanupDestroyedUnits(units, state)
      renderer.renderBases(ctx, units, offset)
      return { draws: draws.slice(), explosions: state.explosions.length, rotorSpeed: unit.rotor.speed,
        visible: renderer.shouldRenderUnit(unit, offset, canvas.width, canvas.height), queuedAt: unit.destructionQueuedAt }
    }

    return { start: frame(1000), middle: frame(2000), impact: frame(3000) }
  })

  expect(result.start, JSON.stringify(result)).toMatchObject({ draws: [{ id: sprites.bodyId, y: 64 }, { id: sprites.rotorId, y: 64 }], explosions: 0 })
  expect(result.start.draws[0].angle).toBeCloseTo(0)
  expect(result.start.draws[1].angle).toBeCloseTo(0.1)
  expect(result.middle).toMatchObject({ draws: [{ id: sprites.bodyId, y: 76 }, { id: sprites.rotorId }], explosions: 0 })
  expect(result.middle.draws[1].y).toBeCloseTo(76)
  expect(result.middle.draws[0].angle).toBeCloseTo(3 * Math.PI / 4)
  expect(result.middle.rotorSpeed).toBeCloseTo(0.01)
  expect(result.impact).toMatchObject({ draws: [], explosions: 1, rotorSpeed: 0 })
})
