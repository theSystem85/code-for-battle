import { test, expect } from '@playwright/test'

test('light SSE imports two ungridded source sprites, grows target and exports metadata', async({ page }) => {
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/sse')
  await expect(page.locator('#sseRoot')).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__SSE__))
  await expect(page.locator('#gameCanvas, #loadingScreen')).toHaveCount(0)
  expect(requests.some(url => /\/images\/map\/units\/|\/src\/main\.js|gameOrchestrator|textureManager/.test(url))).toBe(false)
  await page.locator('#sseExtendPanel summary').first().click()
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

test('new sheet, lossless export, clearing and viewport controls share the browser API', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  await page.locator('#sseExtendPanel summary').first().click()
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
  await expect(page.locator('#sseSheetInfoPopover')).toContainText('Compression: unknown')
  const wrap = page.locator('.sprite-sheet-editor__canvas-wrap')
  const before = await page.locator('.sprite-sheet-editor__canvas-viewport').evaluate(el => el.style.transform)
  await wrap.dispatchEvent('wheel', { deltaX: 30, deltaY: 20 })
  expect(await page.locator('.sprite-sheet-editor__canvas-viewport').evaluate(el => el.style.transform)).not.toBe(before)
})

test('extract all, source masks, removal and compaction share UI and API actions', async({ page }) => {
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
    const pixel = x => [...canvas.getContext('2d').getImageData(x, 2, 1, 1).data]
    return { sprites: json.extension.imports, pixels: [pixel(2), pixel(18), pixel(34)] }
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
