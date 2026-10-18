/* global DataTransfer, DragEvent, File */
import { test, expect } from '@playwright/test'

const SHOT_DIR = process.env.SSE_DROP_SHOT_DIR || ''

async function openSpriteSheetEditor(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=9')
  await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
  await page.waitForSelector('#mapSettingsToggle', { state: 'visible' })
  await page.evaluate(() => document.getElementById('tutorialOverlay')?.remove())
  await page.click('#mapSettingsToggle')
  await page.click('#openSpriteSheetEditorBtn')
  await expect(page.locator('#spriteSheetEditorModal')).toHaveClass(/config-modal--open/)
}

/**
 * Dispatch a real drop event on the SSE canvas wrap with a DataTransfer
 * built in the page. Images are generated as 128x128 canvases.
 */
async function dropFiles(page, files) {
  await page.evaluate(async(fileSpecs) => {
    const makeImageBlob = (format) => new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#c28a3a'
      ctx.fillRect(0, 0, 128, 128)
      ctx.fillStyle = '#2d6a4f'
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillRect(64, 64, 64, 64)
      canvas.toBlob(resolve, format)
    })
    const dataTransfer = new DataTransfer()
    for (const spec of fileSpecs) {
      const parts = spec.json !== undefined
        ? [JSON.stringify(spec.json)]
        : [await makeImageBlob(spec.format || 'image/png')]
      dataTransfer.items.add(new File(parts, spec.name, { type: spec.type }))
    }
    const target = document.getElementById('sseCanvasWrap')
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
  }, files)
}

const tagValues = (page) => page.locator('#sseTagList input[name="sse-active-tag"]').evaluateAll((els) => els.map((el) => el.value))

test.describe('Sprite Sheet Editor file drop', () => {
  test('[E00109] drops an image with a proper MIME type', async({ page }) => {
    await openSpriteSheetEditor(page)
    await dropFiles(page, [{ name: 'drop-mime.png', type: 'image/png' }])
    await expect(page.locator('#sseStatus')).toHaveText('Loaded dropped image: drop-mime.png')
    await expect(page.locator('#sseSheetSelect option:checked')).toHaveText(/drop-mime\.png/)
    await expect(page.locator('#sseSheetResolution')).toContainText('128')
  })

  for (const [name, format] of [['no-mime.png', 'image/png'], ['no-mime.webp', 'image/webp']]) {
    test(`[E00110] drops ${name} with an empty MIME type`, async({ page }) => {
      await openSpriteSheetEditor(page)
      await dropFiles(page, [{ name, type: '', format }])
      await expect(page.locator('#sseStatus')).toHaveText(`Loaded dropped image: ${name}`)
      await expect(page.locator('#sseSheetSelect option:checked')).toHaveText(new RegExp(name.replace('.', '\\.')))
    })
  }

  test('[E00111] drops an image together with its JSON tag file and applies the tags', async({ page }) => {
    await openSpriteSheetEditor(page)
    // JSON listed first on purpose: the image must still be loaded before the tags.
    await dropFiles(page, [
      {
        name: 'drop-tags.json',
        type: 'application/json',
        json: { tileSize: 64, borderWidth: 0, tags: ['e2edroptag'], tiles: { '0,0': { tags: ['e2edroptag'] } } }
      },
      { name: 'drop-tags.png', type: 'image/png' }
    ])
    await expect(page.locator('#sseStatus')).toHaveText('Loaded tag metadata from drop-tags.json.')
    await expect(page.locator('#sseSheetSelect option:checked')).toHaveText(/drop-tags\.png/)
    expect(await tagValues(page)).toContain('e2edroptag')
    await expect(page.locator('#sseBorderWidthInput')).toHaveValue('0')
    if (SHOT_DIR) {
      await page.screenshot({ path: `${SHOT_DIR}/sse-drop-image-json.png` })
    }
  })
})
