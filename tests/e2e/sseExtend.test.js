import { test, expect } from '@playwright/test'

test('light SSE imports two ungridded source sprites, grows target and exports metadata', async({ page }) => {
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/sse')
  await expect(page.locator('#sseRoot')).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__SSE__))
  await expect(page.locator('#gameCanvas, #loadingScreen')).toHaveCount(0)
  expect(requests.some(url => /\/images\/map\/units\/|\/src\/main\.js|gameOrchestrator|textureManager/.test(url))).toBe(false)
  await page.locator('#sseExtendPanel summary').click()
  await page.locator('#sseNewColumns').fill('1')
  await page.locator('#sseNewRows').fill('1')
  await page.locator('#sseNewTile').fill('16')
  await page.locator('#sseNewHeight').fill('16')
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
})
