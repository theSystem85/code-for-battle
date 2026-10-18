import { test, expect } from '@playwright/test'

test('[E00113] light SSE imports two ungridded source sprites, grows target and exports metadata', async({ page }) => {
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/sse')
  await expect(page.locator('#sseRoot')).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__SSE__))
  await expect(page.locator('#gameCanvas, #loadingScreen')).toHaveCount(0)
  expect(requests.some(url => /\/images\/map\/units\/|\/src\/main\.js|gameOrchestrator|textureManager/.test(url))).toBe(false)
  await page.locator('#sseExtendToggle').click()
  await page.locator('#sseNewColumns').fill('1')
  await page.locator('#sseNewRows').fill('1')
  await page.locator('#sseNewTile').fill('16')
  await page.locator('#sseCreateBlank').click()
  await expect(page.locator('#sseExtendStatus')).toContainText('Target created')
  // Exercise the same DataTransfer/image-drop path as a user, including empty MIME.
  await page.evaluate(async() => {
    const canvas = document.createElement('canvas')
    canvas.width = 60
    canvas.height = 40
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 60, 40)
    ctx.fillStyle = '#f00'
    ctx.fillRect(3, 5, 10, 8)
    ctx.fillStyle = '#0f0'
    ctx.fillRect(32, 22, 9, 10)
    const blob = await new Promise(resolve => canvas.toBlob(resolve))
    const transfer = new window.DataTransfer()
    transfer.items.add(new window.File([blob], 'source.png', { type: '' }))
    document.querySelector('#sseSourcePane').dispatchEvent(new window.DragEvent('drop', { bubbles: true, dataTransfer: transfer }))
  })
  await expect(page.locator('#sseExtendStatus')).toContainText('Source loaded')
  // First isolate through UI, second through API; both must share occupancy.
  await page.locator('#sseSourceCanvas').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new MouseEvent('click', { clientX: rect.left + 5 * rect.width / canvas.width, clientY: rect.top + 7 * rect.height / canvas.height }))
  })
  await expect(page.locator('#sseExtendStatus')).toContainText('1 imported')
  const result = await page.evaluate(async() => {
    const events = []
    window.__SSE__.on('sheet-grown', data => events.push(data))
    const packed = await window.__SSE__.isolateAt({ x: 34, y: 25 })
    return { packed, state: window.__SSE__.getState(), events }
  })
  expect(result.packed.placedAt).toEqual({ column: 0, row: 1 })
  expect(result.state.occupiedTiles).toEqual(['0,0', '0,1'])
  expect(result.state.rows).toBe(2)
  expect(result.events).toEqual([{ previousRows: 1, rows: 2 }])
  const downloads = []
  page.on('download', item => downloads.push(item.suggestedFilename()))
  const exported = await page.evaluate(async() => {
    const result = await window.__SSE__.downloadExtendedSheet()
    return { type: result.imageBlob.type, metadata: JSON.parse(await result.metadataBlob.text()) }
  })
  expect(exported.type).toBe('image/webp')
  expect(exported.metadata.tileSize).toBe(16)
  expect(exported.metadata.extension.imports).toHaveLength(2)
  expect(exported.metadata.rows).toBe(2)
  await expect.poll(() => downloads.length).toBe(2)
  expect(downloads).toContain('extended-sheet.webp')
  expect(downloads).toContain('extended-sheet.json')
  const cleared = await page.evaluate(async() => {
    await window.__SSE__.clearTiles([{ col: 0, row: 0 }])
    const { webpBlob, json } = await window.__SSE__.exportSheet()
    const image = await window.createImageBitmap(webpBlob)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    return { pixel: [...context.getImageData(3, 3, 1, 1).data], imports: json.extension.imports.length, occupied: json.extension.occupiedTiles }
  })
  expect(cleared.pixel).toEqual([0, 0, 0, 255])
  expect(cleared.imports).toBe(1)
  expect(cleared.occupied).toEqual(['0,1'])
})

test('[E00114] new sheet, lossless export, clearing and viewport controls share the browser API', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  await page.locator('#sseExtendToggle').click()
  await expect(page.getByRole('button', { name: 'New sheet', exact: true })).toBeVisible()
  await page.locator('#sseNewName').fill('test-sheet')
  await page.locator('#sseNewColumns').fill('3')
  await page.locator('#sseNewRows').fill('2')
  await page.locator('#sseNewTile').fill('16')
  await page.getByRole('button', { name: 'New sheet', exact: true }).click()
  await expect(page.locator('#sseExtendStatus')).toContainText('Target created')
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
  await expect(page.locator('#sseLossless')).toBeChecked()
  await expect(page.locator('#sseQuality')).toBeDisabled()
  await page.locator('#sseLossless').uncheck()
  await expect(page.locator('#sseQuality')).toBeEnabled()
  await page.locator('#sseLossless').check()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('test-sheet.webp')
  const result = await page.evaluate(async() => {
    const api = window.__SSE__
    const exported = await api.exportSheet()
    const decoded = await window.createImageBitmap(exported.webpBlob)
    await api.clearTiles([{ col: 0, row: 0 }])
    await api.setSplitRatio(0.4)
    return { width: decoded.width, height: decoded.height, json: exported.json, ratio: localStorage.getItem('sse.splitRatio') }
  })
  expect(result.width).toBe(48)
  expect(result.height).toBe(32)
  expect(result.json.compression).toEqual({ lossless: true })
  expect(result.ratio).toBe('0.4')
  await page.locator('#sseSheetInfoBtn').click()
  await expect(page.locator('#sseSheetInfoPopover')).toBeVisible()
  await expect(page.locator('#sseSheetInfoPopover')).toContainText('Compression: lossless')
  const wrap = page.locator('.sprite-sheet-editor__canvas-wrap')
  const before = await page.locator('.sprite-sheet-editor__canvas-viewport').evaluate(el => el.style.transform)
  await wrap.dispatchEvent('wheel', { deltaX: 30, deltaY: 20 })
  expect(await page.locator('.sprite-sheet-editor__canvas-viewport').evaluate(el => el.style.transform)).not.toBe(before)
})

test('[E00115] extract all, source masks, removal and compaction share UI and API actions', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  await page.evaluate(async() => {
    await window.__SSE__.newSheet({ cols: 3, rows: 2, tileSize: 16 })
    const source = document.createElement('canvas')
    source.width = 80
    source.height = 40
    const ctx = source.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 80, 40)
    for (const [x, color] of [[2, '#f00'], [25, '#0f0'], [50, '#00f']]) {
      ctx.fillStyle = color
      ctx.fillRect(x, 3, 8, 8)
    }
    await window.__SSE__.loadSourceImage(source.toDataURL())
  })
  await page.getByRole('button', { name: 'Extract all', exact: true }).click()
  await expect(page.locator('#sseExtendStatus')).toHaveText('Extracted 3 sprites.')
  const initial = await page.evaluate(() => {
    const canvas = document.querySelector('#sseSourceCanvas')
    return { sprites: window.__SSE__.getState().sprites, overlay: [...canvas.getContext('2d').getImageData(4, 5, 1, 1).data] }
  })
  expect(initial.overlay[1]).toBeGreaterThan(0)
  expect(initial.sprites.map(item => item.placedAt.column)).toEqual([0, 1, 2])
  await page.evaluate(async id => {
    await window.__SSE__.setViewport({ pane: 'source', x: -5, y: -2, scale: 2 })
    await window.__SSE__.selectSprite(id)
  }, initial.sprites[1].id)
  await page.getByRole('button', { name: 'Remove sprite', exact: true }).click()
  await page.getByRole('button', { name: 'Compact', exact: true }).click()
  const result = await page.evaluate(async() => {
    const { json, webpBlob } = await window.__SSE__.exportSheet()
    const bitmap = await window.createImageBitmap(webpBlob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    const pixel = x => [...canvas.getContext('2d').getImageData(x, 8, 1, 1).data]
    return { sprites: json.extension.imports, pixels: [pixel(8), pixel(24), pixel(40)] }
  })
  expect(result.sprites.map(item => item.id)).toEqual([initial.sprites[0].id, initial.sprites[2].id])
  expect(result.sprites.map(item => item.placedAt.column)).toEqual([0, 1])
  expect(result.pixels).toEqual([[255, 0, 0, 255], [0, 0, 255, 255], [0, 0, 0, 255]])
  // Click the target sprite, then use the same remove action via Delete.
  await page.locator('#sseTileCanvas').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + 2, clientY: rect.top + 2 }))
  })
  await page.getByRole('button', { name: 'Remove sprite', exact: true }).focus()
  await page.keyboard.press('Delete')
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().importedSprites)).toBe(1)
})

test('[E00116] anchor, ratio and shrink UI persist metadata and permit reimport on target changes', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const first = await page.evaluate(async() => {
    const api = window.__SSE__
    const sheet = await api.newSheet({ cols: 4, rows: 2, tileSize: 16 })
    const source = document.createElement('canvas')
    source.width = 24
    source.height = 24
    source.getContext('2d').fillStyle = '#f00'
    source.getContext('2d').fillRect(2, 2, 18, 10)
    await api.loadSourceImage(source.toDataURL())
    return sheet.targetSheetPath
  })
  // Register before triggering UI actions so completion is observed even when
  // the controller dispatches synchronously during the click/change event.
  await page.evaluate(() => {
    window.sseCompletedEvents = []
    for (const name of ['anchor-changed', 'size-ratio-changed', 'sprite-resized', 'sprite-menu-closed']) {
      window.__SSE__.on(name, detail => window.sseCompletedEvents.push({ name, detail }))
    }
  })
  await page.locator('#sseAnchor').selectOption('bottom-right')
  await expect.poll(() => page.evaluate(() => window.sseCompletedEvents.some(event => event.name === 'anchor-changed' && event.detail.anchor === 'bottom-right'))).toBe(true)
  await page.locator('#sseSizeRatio').fill('1.5')
  await page.locator('#sseSizeRatio').dispatchEvent('change')
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().sizeRatio)).toBe(1.5)
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().anchor)).toBe('bottom-right')
  const sprite = await page.evaluate(() => window.__SSE__.isolateAt({ x: 3, y: 3 }))
  expect(sprite.anchor).toBe('bottom-right')
  expect(sprite.tileSpan).toEqual({ columns: 2, rows: 1 })
  await page.locator('#sseTileCanvas').evaluate((canvas, placed) => {
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
      clientX: rect.left + (placed.column * 16 + 8) * rect.width / canvas.width,
      clientY: rect.top + (placed.row * 16 + 8) * rect.height / canvas.height }))
  }, sprite.placedAt)
  await expect(page.locator('#sseSpriteContextMenu')).toBeVisible()
  await page.locator('#sseResizeColumns').fill('1')
  await page.locator('#sseResizeApply').click()
  await expect.poll(() => page.evaluate(id => window.__SSE__.getState().sprites.find(item => item.id === id)?.tileSpan.columns, sprite.id)).toBe(1)
  await expect.poll(() => page.evaluate(() => window.sseCompletedEvents.filter(event => ['sprite-resized', 'sprite-menu-closed'].includes(event.name)).map(event => event.name))).toEqual(['sprite-resized', 'sprite-menu-closed'])
  await expect(page.locator('#sseSpriteContextMenu')).toBeHidden()
  const result = await page.evaluate(async({ first, id }) => {
    const api = window.__SSE__
    const resized = api.getState().sprites.find(item => item.id === id)
    const { json } = await api.exportSheet()
    await api.newSheet({ cols: 4, rows: 2, tileSize: 16 })
    const again = await api.isolateAt({ x: 3, y: 3 })
    await api.selectTargetSheet(first)
    const returned = await api.isolateAt({ x: 3, y: 3 })
    return { resized, json, again, returned }
  }, { first, id: sprite.id })
  expect(result.resized.tileSpan).toEqual({ columns: 1, rows: 1 })
  expect(result.resized.renderRect.width).toBe(16)
  expect(result.resized.renderRect.height).toBeCloseTo(16 * 10 / 18)
  expect(result.json.extension.imports[0].anchor).toBe('bottom-right')
  expect(result.json.sprites.find(item => item.id === sprite.id).px.width).toBe(16)
  expect(result.again.ok).toBe(true)
  expect(result.returned.ok).toBe(true)
})

test('[E00117] multiple source clicks toggle imports, resize buttons grow and shrink, and mobile panes stay visible', async({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  await page.evaluate(async() => {
    const api = window.__SSE__
    await api.newSheet({ cols: 6, rows: 4, tileSize: 16 })
    const source = document.createElement('canvas')
    source.width = source.height = 28
    source.getContext('2d').fillStyle = '#ff0000'
    source.getContext('2d').fillRect(2, 2, 18, 18)
    await api.addSourceImage(source.toDataURL())
    await api.addSourceImage(source.toDataURL())
  })
  const clickSource = async index => {
    await page.locator('#sseSources canvas').nth(index).evaluate(canvas => {
      const r = canvas.getBoundingClientRect()
      canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + 4 * r.width / canvas.width, clientY: r.top + 4 * r.height / canvas.height }))
    })
  }
  await clickSource(0)
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().importedSprites)).toBe(1)
  await clickSource(1)
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().importedSprites)).toBe(2)
  await clickSource(1)
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().importedSprites)).toBe(1)
  await page.evaluate(() => window.__SSE__.openSpriteMenu(window.__SSE__.getState().sprites[0].id, { x: 10, y: 350 }))
  await page.getByRole('button', { name: 'Shrink', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().sprites[0].tileSpan.columns)).toBe(1)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().sprites[0].tileSpan.columns)).toBe(2)
  await page.evaluate(() => window.__SSE__.closeSpriteMenu())
  for (const selector of ['.sprite-sheet-editor__canvas-wrap', '#sseSourcePane']) {
    const bounds = await page.locator(selector).boundingBox()
    expect(bounds.height).toBeGreaterThan(70)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844)
    const sidebar = await page.locator('.sprite-sheet-editor__sidebar').boundingBox()
    expect(bounds.y).toBeGreaterThanOrEqual(sidebar.y + sidebar.height - 1)
  }
})

test('[E00118] Extract all imports both source sheets in order with independent segmentation and shared accordion controls', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const ids = await page.evaluate(async() => {
    const api = window.__SSE__
    await api.newSheet({ cols: 4, rows: 2, tileSize: 16 })
    const source = document.createElement('canvas')
    source.width = 32
    source.height = 16
    const ctx = source.getContext('2d')
    ctx.fillStyle = '#f00'
    ctx.fillRect(2, 2, 8, 8)
    ctx.fillRect(20, 2, 8, 8)
    return [await api.addSourceImage(source.toDataURL()), await api.addSourceImage(source.toDataURL())]
  })
  const toggle = page.locator('#sseExtendToggle')
  await expect(toggle).toHaveClass('action-button sidebar-accordion__toggle')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await page.evaluate(() => window.__SSE__.setExtendOpen(true))
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#sseExtendPanel')).toHaveCSS('border-top-width', '0px')
  await page.locator('#sseExtractAll').click()
  await expect.poll(() => page.evaluate(() => window.__SSE__.getState().importedSprites)).toBe(4)
  const result = await page.evaluate(async() => ({
    sprites: window.__SSE__.getState().sprites,
    duplicates: await window.__SSE__.extractAll(),
    masks: [...document.querySelectorAll('#sseSources canvas')].map(canvas => {
      const pixel = canvas.getContext('2d').getImageData(4, 4, 1, 1).data
      return pixel[1] > 0 && pixel[2] > 0
    })
  }))
  expect(result.sprites.map(sprite => sprite.sourceId)).toEqual([ids[0], ids[0], ids[1], ids[1]])
  expect(result.sprites.map(sprite => sprite.placedAt)).toEqual([0, 1, 2, 3].map(column => ({ column, row: 0 })))
  expect(result.duplicates).toEqual([])
  expect(result.masks).toEqual([true, true])
  await page.evaluate(id => window.__SSE__.removeSprite(id), result.sprites[0].id)
  expect(await page.evaluate(sourceId => window.__SSE__.extractAll({ sourceId }), ids[1])).toEqual([])
  expect(await page.evaluate(sourceId => window.__SSE__.extractAll({ sourceId }), ids[0])).toHaveLength(1)
})
