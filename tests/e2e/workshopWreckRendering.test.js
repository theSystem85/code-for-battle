import { test, expect } from '@playwright/test'

test.describe('Workshop wreck rendering', () => {
  test('renders F22 wreck sprite in workshop and rotates restored wrecks by 45 degrees', async({ page }) => {
    await page.goto('/?seed=11')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    const result = await page.evaluate(async() => {
      const { WreckRenderer } = await import('/src/rendering/wreckRenderer.js')

      function createMockContext() {
        return {
          rotateCalls: [],
          drawImageCalls: 0,
          fillRectCalls: 0,
          save() {},
          restore() {},
          translate() {},
          rotate(angle) {
            this.rotateCalls.push(angle)
          },
          drawImage() {
            this.drawImageCalls += 1
          },
          fillRect() {
            this.fillRectCalls += 1
          },
          strokeRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          closePath() {},
          fill() {},
          stroke() {},
          fillText() {},
          set font(_) {},
          set textAlign(_) {},
          set textBaseline(_) {},
          set lineWidth(_) {},
          set strokeStyle(_) {},
          set fillStyle(_) {},
          set globalAlpha(_) {},
          set filter(_) {}
        }
      }

      const renderer = new WreckRenderer()
      const scrollOffset = { x: 0, y: 0 }

      const f22Ctx = createMockContext()
      renderer.renderWreck(f22Ctx, {
        id: 'f22-wreck',
        x: 64,
        y: 64,
        unitType: 'f22Raptor',
        direction: 0,
        health: 100,
        maxHealth: 100,
        isBeingRestored: true
      }, scrollOffset)

      const harvesterCtx = createMockContext()
      renderer.renderWreck(harvesterCtx, {
        id: 'harvester-wreck',
        x: 128,
        y: 64,
        unitType: 'harvester',
        direction: 0,
        health: 100,
        maxHealth: 100,
        isBeingRestored: true
      }, scrollOffset)

      const quarterTurn = Math.PI / 4
      const tolerance = 0.0001
      const f22Rotation = f22Ctx.rotateCalls[0]
      const harvesterRotation = harvesterCtx.rotateCalls[0]

      return {
        f22HasSprite: f22Ctx.drawImageCalls > 0,
        f22RotatedQuarterTurn: Math.abs(f22Rotation - quarterTurn) < tolerance,
        harvesterRotatedQuarterTurn: Math.abs(harvesterRotation - quarterTurn) < tolerance,
        f22Rotation,
        harvesterRotation,
        f22DrawImageCalls: f22Ctx.drawImageCalls
      }
    })

    expect(result.f22HasSprite).toBe(true)
    expect(result.f22RotatedQuarterTurn).toBe(true)
    expect(result.harvesterRotatedQuarterTurn).toBe(true)
  })
})
