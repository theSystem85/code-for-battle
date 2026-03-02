import { test, expect } from '@playwright/test'

test.describe('Sprite Sheet Editor integration', () => {
  test('opens SSE, paints tags, applies metadata, and toggles integrated mode', async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=9')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForSelector('#mapSettingsToggle', { state: 'visible' })

    const tutorialSkip = page.getByRole('button', { name: 'Skip tutorial' })
    if (await tutorialSkip.isVisible()) {
      await tutorialSkip.click()
    }

    const tutorialMinimize = page.locator('[data-tutorial-action="minimize"]')
    if (await tutorialMinimize.isVisible()) {
      await tutorialMinimize.click()
    }

    await page.evaluate(() => {
      const overlay = document.getElementById('tutorialOverlay')
      if (overlay) {
        overlay.remove()
      }
    })

    await page.click('#mapSettingsToggle')
    await expect(page.locator('#openSpriteSheetEditorBtn')).toBeVisible()

    await page.click('#openSpriteSheetEditorBtn')
    await expect(page.locator('#spriteSheetEditorModal')).toHaveClass(/config-modal--open/)

    await expect(page.locator('#sseTileSizeInput')).toHaveValue('64')
    await expect(page.locator('#sseBorderWidthInput')).toHaveValue('1')
    await expect(page.locator('#spriteSheetEditorMaxBtn')).toHaveCount(0)

    const fitScaleCheck = await page.evaluate(() => {
      const wrap = document.getElementById('sseCanvasWrap')
      const canvas = document.getElementById('sseTileCanvas')
      const viewport = document.getElementById('sseCanvasViewport')
      if (!wrap || !canvas || !viewport) return null
      const fit = Math.min(wrap.clientWidth / canvas.width, wrap.clientHeight / canvas.height)
      const transform = viewport.style.transform || ''
      const match = transform.match(/scale\(([^)]+)\)/)
      const scale = match ? Number.parseFloat(match[1]) : NaN
      return {
        fit,
        scale,
        zoomLabel: (document.getElementById('sseZoomValue')?.textContent || '').trim()
      }
    })
    expect(fitScaleCheck).not.toBeNull()
    expect(Number.isFinite(fitScaleCheck.scale)).toBe(true)
    expect(Math.abs(fitScaleCheck.scale - fitScaleCheck.fit)).toBeLessThan(0.03)
    expect(fitScaleCheck.zoomLabel.endsWith('%')).toBe(true)

    await page.waitForFunction(() => {
      const canvas = document.getElementById('sseTileCanvas')
      return Boolean(canvas && canvas.width > 0 && canvas.height > 0)
    })

    const canvas = page.locator('#sseTileCanvas')
    await canvas.click({ position: { x: 12, y: 12 } })
    await canvas.click({ position: { x: 80, y: 12 } })

    const zoomBefore = await page.evaluate(() => {
      const raw = (document.getElementById('sseZoomValue')?.textContent || '0').replace('%', '')
      return Number.parseFloat(raw) || 0
    })

    await page.click('#sseZoomInBtn')
    const zoomAfterIn = await page.evaluate(() => {
      const raw = (document.getElementById('sseZoomValue')?.textContent || '0').replace('%', '')
      return Number.parseFloat(raw) || 0
    })
    expect(zoomAfterIn).toBeGreaterThan(zoomBefore)

    await page.click('#sseZoomOutBtn')
    const zoomAfterOut = await page.evaluate(() => {
      const raw = (document.getElementById('sseZoomValue')?.textContent || '0').replace('%', '')
      return Number.parseFloat(raw) || 0
    })
    expect(zoomAfterOut).toBeLessThanOrEqual(zoomAfterIn)

    await page.click('#sseZoomFitBtn')
    const zoomAfterFit = await page.evaluate(() => {
      const raw = (document.getElementById('sseZoomValue')?.textContent || '0').replace('%', '')
      return Number.parseFloat(raw) || 0
    })
    expect(zoomAfterFit).toBeGreaterThan(0)

    await page.click('#sseZoom100Btn')
    await expect(page.locator('#sseZoomValue')).toHaveText('100%')

    const panBefore = await page.evaluate(() => {
      const viewport = document.getElementById('sseCanvasViewport')
      return viewport?.style.transform || ''
    })

    const wrapBox = await page.locator('#sseCanvasWrap').boundingBox()
    expect(wrapBox).not.toBeNull()
    const startX = wrapBox.x + (wrapBox.width * 0.6)
    const startY = wrapBox.y + (wrapBox.height * 0.6)
    await page.mouse.move(startX, startY)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(startX - 80, startY - 60)
    await page.mouse.move(startX - 140, startY - 100)
    await page.mouse.up({ button: 'right' })

    const panAfterDrag = await page.evaluate(() => {
      const viewport = document.getElementById('sseCanvasViewport')
      return viewport?.style.transform || ''
    })
    expect(panAfterDrag).not.toBe(panBefore)

    await page.waitForTimeout(120)
    const panAfterInertia = await page.evaluate(() => {
      const viewport = document.getElementById('sseCanvasViewport')
      return viewport?.style.transform || ''
    })
    expect(panAfterInertia).not.toBe(panAfterDrag)

    await page.click('#sseApplyCurrentTagAllBtn')

    const tileCoverage = await page.evaluate(() => {
      const metadata = window.gameState?.activeSpriteSheetMetadata
      if (!metadata) {
        return { tagged: 0, expected: 0 }
      }
      const expected = (metadata.columns || 0) * (metadata.rows || 0)
      const tagged = metadata.tiles ? Object.keys(metadata.tiles).length : 0
      return { tagged, expected }
    })
    expect(tileCoverage.expected).toBeGreaterThan(0)
    expect(tileCoverage.tagged).toBe(tileCoverage.expected)

    await page.click('#sseApplyTagsBtn', { force: true })

    const taggedTileCount = await page.evaluate(() => {
      const metadata = window.gameState?.activeSpriteSheetMetadata
      return metadata?.tiles ? Object.keys(metadata.tiles).length : 0
    })
    expect(taggedTileCount).toBeGreaterThan(0)

    await page.click('#spriteSheetEditorCloseBtn')
    await expect(page.locator('#spriteSheetEditorModal')).not.toHaveClass(/config-modal--open/)

    await page.check('#integratedSpriteSheetModeCheckbox')

    const runtimeModeEnabled = await page.evaluate(() => {
      return {
        stateFlag: Boolean(window.gameState?.useIntegratedSpriteSheetMode),
        persistedFlag: localStorage.getItem('rts-integrated-spritesheet-mode')
      }
    })

    expect(runtimeModeEnabled.stateFlag).toBe(true)
    expect(runtimeModeEnabled.persistedFlag).toBe('true')

  })
})
