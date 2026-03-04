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

    const sidebarScrollCheck = await page.evaluate(() => {
      const sidebar = document.querySelector('.sprite-sheet-editor__sidebar')
      if (!sidebar) return null
      const style = window.getComputedStyle(sidebar)
      return {
        overflowY: style.overflowY,
        scrollbarWidth: style.scrollbarWidth,
        canScroll: sidebar.scrollHeight > sidebar.clientHeight
      }
    })
    expect(sidebarScrollCheck).not.toBeNull()
    expect(sidebarScrollCheck.overflowY).toBe('auto')
    expect(sidebarScrollCheck.scrollbarWidth).toBe('none')
    expect(sidebarScrollCheck.canScroll).toBe(true)

    await expect(page.locator('#sseTileSizeInput')).toHaveValue('64')
    await expect(page.locator('#sseBorderWidthInput')).toHaveValue('1')
    await expect(page.locator('#spriteSheetEditorMaxBtn')).toHaveCount(0)
    await expect(page.locator('#sseBrightnessRange')).toHaveValue('100')
    await expect(page.locator('#sseSaturationRange')).toHaveValue('100')

    await page.evaluate(() => {
      const brightness = document.getElementById('sseBrightnessRange')
      const saturation = document.getElementById('sseSaturationRange')
      if (brightness) {
        brightness.value = '120'
        brightness.dispatchEvent(new window.Event('input', { bubbles: true }))
      }
      if (saturation) {
        saturation.value = '140'
        saturation.dispatchEvent(new window.Event('input', { bubbles: true }))
      }
    })

    await expect(page.locator('#sseBrightnessValue')).toHaveText('120%')
    await expect(page.locator('#sseSaturationValue')).toHaveText('140%')

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

    await expect(page.locator('#sseTagList input[value="rocks"]')).toHaveCount(1)

    const canvas = page.locator('#sseTileCanvas')
    await canvas.click({ position: { x: 12, y: 12 } })
    await canvas.click({ position: { x: 80, y: 12 } })

    await page.uncheck('#sseShowLabelsCheckbox')

    const activeTagOverlayPixel = await page.evaluate(() => {
      const canvasEl = document.getElementById('sseTileCanvas')
      const ctx = canvasEl?.getContext('2d')
      if (!ctx) return null
      return Array.from(ctx.getImageData(20, 50, 1, 1).data)
    })
    expect(activeTagOverlayPixel).not.toBeNull()

    await page.evaluate(() => {
      const input = document.querySelector('#sseTagList input[value="decorative"]')
      if (input) {
        input.checked = true
        input.dispatchEvent(new window.Event('change', { bubbles: true }))
      }
    })
    await canvas.click({ position: { x: 12, y: 12 } })

    const differentTagOverlayPixel = await page.evaluate(() => {
      const canvasEl = document.getElementById('sseTileCanvas')
      const ctx = canvasEl?.getContext('2d')
      if (!ctx) return null
      return Array.from(ctx.getImageData(20, 20, 1, 1).data)
    })
    expect(differentTagOverlayPixel).not.toBeNull()
    expect(differentTagOverlayPixel).not.toEqual(activeTagOverlayPixel)

    await page.uncheck('#sseShowTaggedOverlayCheckbox')

    const overlayDisabledPixel = await page.evaluate(() => {
      const canvasEl = document.getElementById('sseTileCanvas')
      const ctx = canvasEl?.getContext('2d')
      if (!ctx) return null
      return Array.from(ctx.getImageData(20, 20, 1, 1).data)
    })
    expect(overlayDisabledPixel).not.toBeNull()
    expect(overlayDisabledPixel).not.toEqual(differentTagOverlayPixel)

    await page.check('#sseShowTaggedOverlayCheckbox')

    const labelPixelWithoutLabels = await page.evaluate(() => {
      const canvasEl = document.getElementById('sseTileCanvas')
      const ctx = canvasEl?.getContext('2d')
      if (!ctx) return null
      return Array.from(ctx.getImageData(6, 6, 1, 1).data)
    })
    expect(labelPixelWithoutLabels).not.toBeNull()

    await page.check('#sseShowLabelsCheckbox')
    const labelPixelWithDifferentActiveTag = await page.evaluate(() => {
      const canvasEl = document.getElementById('sseTileCanvas')
      const ctx = canvasEl?.getContext('2d')
      if (!ctx) return null
      return Array.from(ctx.getImageData(6, 6, 1, 1).data)
    })
    expect(labelPixelWithDifferentActiveTag).not.toBeNull()
    expect(labelPixelWithDifferentActiveTag).not.toEqual(labelPixelWithoutLabels)

    await page.evaluate(() => {
      const input = document.querySelector('#sseTagList input[value="passable"]')
      if (input) {
        input.checked = true
        input.dispatchEvent(new window.Event('change', { bubbles: true }))
      }
    })

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

    const appliedStorage = await page.evaluate(() => {
      const raw = localStorage.getItem('rts-sse-applied-metadata')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return {
        sheetPath: parsed?.sheetPath || null,
        tileCount: parsed?.tiles ? Object.keys(parsed.tiles).length : 0
      }
    })
    expect(appliedStorage).not.toBeNull()
    expect(appliedStorage.tileCount).toBeGreaterThan(0)

    await page.click('#spriteSheetEditorCloseBtn')
    await expect(page.locator('#spriteSheetEditorModal')).not.toHaveClass(/config-modal--open/)

    await page.check('#integratedSpriteSheetModeCheckbox')

    await page.selectOption('#integratedSpriteSheetBiomeSelect', 'snow')

    const runtimeModeEnabled = await page.evaluate(() => {
      return {
        stateFlag: Boolean(window.gameState?.useIntegratedSpriteSheetMode),
        persistedFlag: localStorage.getItem('rts-integrated-spritesheet-mode'),
        biomeTag: window.gameState?.activeSpriteSheetBiomeTag || null,
        persistedBiome: localStorage.getItem('rts-integrated-spritesheet-biome'),
        brightness: window.gameState?.activeSpriteSheetMetadata?.brightness || null,
        saturation: window.gameState?.activeSpriteSheetMetadata?.saturation || null
      }
    })

    expect(runtimeModeEnabled.stateFlag).toBe(true)
    expect(runtimeModeEnabled.persistedFlag).toBe('true')
    expect(runtimeModeEnabled.biomeTag).toBe('snow')
    expect(runtimeModeEnabled.persistedBiome).toBe('snow')
    expect(runtimeModeEnabled.brightness).toBe(120)
    expect(runtimeModeEnabled.saturation).toBe(140)

    const integratedFilterState = await page.evaluate(async() => {
      const renderingModule = await import('/src/rendering.js')
      const textureManager = renderingModule?.getTextureManager ? renderingModule.getTextureManager() : null
      if (!textureManager || !window.gameState?.activeSpriteSheetPath || !window.gameState?.activeSpriteSheetMetadata) return null
      await textureManager.setIntegratedSpriteSheetConfig({
        enabled: true,
        sheetPath: window.gameState.activeSpriteSheetPath,
        metadata: window.gameState.activeSpriteSheetMetadata,
        biomeTag: window.gameState.activeSpriteSheetBiomeTag || 'grass'
      })
      return {
        brightness: textureManager.integratedBrightness,
        saturation: textureManager.integratedSaturation
      }
    })
    expect(integratedFilterState).not.toBeNull()
    expect(integratedFilterState.brightness).toBe(120)
    expect(integratedFilterState.saturation).toBe(140)

    const seededMetadata = await page.evaluate(async() => {
      const renderingModule = await import('/src/rendering.js')
      const textureManager = renderingModule?.getTextureManager ? renderingModule.getTextureManager() : null
      const gameState = window.gameState
      if (!textureManager || !gameState?.activeSpriteSheetMetadata || !gameState?.activeSpriteSheetPath) {
        return null
      }

      const metadata = JSON.parse(JSON.stringify(gameState.activeSpriteSheetMetadata))
      const keys = Object.keys(metadata.tiles || {})
      if (keys.length < 3) {
        return null
      }

      metadata.tiles[keys[0]].tags = ['grass', 'passable']
      metadata.tiles[keys[1]].tags = ['grass', 'decorative']
      metadata.tiles[keys[2]].tags = ['snow', 'passable', 'rocks']

      gameState.activeSpriteSheetMetadata = metadata

      await textureManager.setIntegratedSpriteSheetConfig({
        enabled: true,
        sheetPath: gameState.activeSpriteSheetPath,
        metadata,
        biomeTag: gameState.activeSpriteSheetBiomeTag || 'snow'
      })

      return {
        seeded: true,
        tileCount: keys.length
      }
    })
    expect(seededMetadata).not.toBeNull()
    expect(seededMetadata.seeded).toBe(true)

    const biomeResolutionCheck = await page.evaluate(async() => {
      const renderingModule = await import('/src/rendering.js')
      const textureManager = renderingModule?.getTextureManager ? renderingModule.getTextureManager() : null
      const mapGrid = window.gameState?.mapGrid
      if (!textureManager || !mapGrid?.length) {
        return null
      }

      const findTileType = (type) => {
        for (let y = 0; y < mapGrid.length; y++) {
          for (let x = 0; x < mapGrid[y].length; x++) {
            if (mapGrid[y][x]?.type === type) return { x, y }
          }
        }
        return { x: 1, y: 1 }
      }

      const landPos = findTileType('land')
      const landSnow = textureManager.getIntegratedTileForMapTile('land', landPos.x, landPos.y)

      return {
        snowTags: landSnow?.tags || []
      }
    })
    expect(biomeResolutionCheck).not.toBeNull()
    expect(biomeResolutionCheck.snowTags).toContain('snow')

    const grassBiomeResolutionCheck = await page.evaluate(async() => {
      const renderingModule = await import('/src/rendering.js')
      const textureManager = renderingModule?.getTextureManager ? renderingModule.getTextureManager() : null
      const gameState = window.gameState
      const mapGrid = window.gameState?.mapGrid
      if (!textureManager || !mapGrid?.length || !gameState?.activeSpriteSheetPath || !gameState?.activeSpriteSheetMetadata) {
        return null
      }

      await textureManager.setIntegratedSpriteSheetConfig({
        enabled: true,
        sheetPath: gameState.activeSpriteSheetPath,
        metadata: gameState.activeSpriteSheetMetadata,
        biomeTag: 'grass'
      })

      const originalClassifier = textureManager.getLandClassificationTag.bind(textureManager)
      textureManager.getLandClassificationTag = () => 'passable'
      const landGrass = textureManager.getIntegratedTileForMapTile('land', 2, 2)
      textureManager.getLandClassificationTag = originalClassifier

      return {
        biomeTag: textureManager.integratedBiomeTag,
        grassTags: landGrass?.tags || []
      }
    })
    expect(grassBiomeResolutionCheck).not.toBeNull()
    expect(grassBiomeResolutionCheck.biomeTag).toBe('grass')
    expect(grassBiomeResolutionCheck.grassTags).toContain('grass')

    const decorativeBiomeUseCheck = await page.evaluate(async() => {
      const renderingModule = await import('/src/rendering.js')
      const textureManager = renderingModule?.getTextureManager ? renderingModule.getTextureManager() : null
      const gameState = window.gameState
      if (!textureManager || !gameState?.activeSpriteSheetPath || !gameState?.activeSpriteSheetMetadata) {
        return null
      }

      await textureManager.setIntegratedSpriteSheetConfig({
        enabled: true,
        sheetPath: gameState.activeSpriteSheetPath,
        metadata: gameState.activeSpriteSheetMetadata,
        biomeTag: 'grass'
      })

      const originalClassifier = textureManager.getLandClassificationTag.bind(textureManager)

      textureManager.getLandClassificationTag = () => 'decorative'
      const decorativeTile = textureManager.getIntegratedTileForMapTile('land', 3, 3)
      let decorativeNullCount = 0
      for (let i = 0; i < 24; i++) {
        const sampleTile = textureManager.getIntegratedTileForMapTile('land', i, i + 1)
        if (!sampleTile) {
          decorativeNullCount++
        }
      }

      textureManager.getLandClassificationTag = () => 'passable'
      const passableTile = textureManager.getIntegratedTileForMapTile('land', 3, 3)

      textureManager.getLandClassificationTag = originalClassifier

      return {
        decorativeTags: decorativeTile?.tags || [],
        passableTags: passableTile?.tags || [],
        decorativeNullCount
      }
    })
    expect(decorativeBiomeUseCheck).not.toBeNull()
    expect(decorativeBiomeUseCheck.decorativeTags).toContain('grass')
    expect(decorativeBiomeUseCheck.decorativeTags).toContain('decorative')
    expect(decorativeBiomeUseCheck.decorativeNullCount).toBe(0)
    expect(decorativeBiomeUseCheck.passableTags).toContain('grass')
    expect(decorativeBiomeUseCheck.passableTags).not.toContain('decorative')

    const fallbackCheck = await page.evaluate(async() => {
      const renderingModule = await import('/src/rendering.js')
      const textureManager = renderingModule?.getTextureManager ? renderingModule.getTextureManager() : null
      const gameState = window.gameState
      if (!textureManager || !gameState?.activeSpriteSheetMetadata || !gameState?.activeSpriteSheetPath) {
        return null
      }

      const metadata = gameState.activeSpriteSheetMetadata
      const stripped = JSON.parse(JSON.stringify(metadata))

      Object.values(stripped.tiles || {}).forEach((entry) => {
        if (!Array.isArray(entry?.tags)) return
        entry.tags = entry.tags.filter((tag) => !['rocks', 'rock', 'street', 'water', 'grass'].includes(tag))
      })

      await textureManager.setIntegratedSpriteSheetConfig({
        enabled: true,
        sheetPath: gameState.activeSpriteSheetPath,
        metadata: stripped,
        biomeTag: 'grass'
      })

      const rockTile = textureManager.getIntegratedTileForMapTile('rock', 1, 1)
      const streetTile = textureManager.getIntegratedTileForMapTile('street', 1, 1)
      const waterTile = textureManager.getIntegratedTileForMapTile('water', 1, 1)
      const landTile = textureManager.getIntegratedTileForMapTile('land', 1, 1)

      await textureManager.setIntegratedSpriteSheetConfig({
        enabled: true,
        sheetPath: gameState.activeSpriteSheetPath,
        metadata,
        biomeTag: gameState.activeSpriteSheetBiomeTag || 'grass'
      })

      return {
        rockNull: rockTile === null,
        streetNull: streetTile === null,
        waterNull: waterTile === null,
        landNull: landTile === null
      }
    })
    expect(fallbackCheck).not.toBeNull()
    expect(fallbackCheck.rockNull).toBe(true)
    expect(fallbackCheck.streetNull).toBe(true)
    expect(fallbackCheck.waterNull).toBe(true)
    expect(fallbackCheck.landNull).toBe(true)

  })
})
