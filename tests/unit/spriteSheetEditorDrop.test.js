import { describe, it, expect } from 'vitest'
import { isDroppedImageFile, isDroppedJsonFile, loadDroppedFiles } from '../../src/ui/spriteSheetEditor.js'

const file = (name, type) => ({ name, type })

describe('Sprite Sheet Editor drop helpers', () => {
  it('accepts images by MIME type or by extension when the MIME type is empty', () => {
    expect(isDroppedImageFile(file('a.bin', 'image/png'))).toBe(true)
    expect(isDroppedImageFile(file('a.png', ''))).toBe(true)
    expect(isDroppedImageFile(file('a.WEBP', ''))).toBe(true)
    expect(isDroppedImageFile(file('a.txt', ''))).toBe(false)
    expect(isDroppedImageFile(null)).toBe(false)
  })

  it('recognises JSON tag files by MIME type or extension', () => {
    expect(isDroppedJsonFile(file('tags.json', ''))).toBe(true)
    expect(isDroppedJsonFile(file('tags', 'application/json'))).toBe(true)
    expect(isDroppedJsonFile(file('tags', 'text/json'))).toBe(true)
    expect(isDroppedJsonFile(file('a.png', 'image/png'))).toBe(false)
  })

  it('warns when JSON is dropped without a loaded sheet', async() => {
    const state = { statusEl: { textContent: '', style: {} }, activeData: null, image: null }
    await loadDroppedFiles(state, [file('tags.json', 'application/json')])
    expect(state.statusEl.textContent).toBe('Load a sprite sheet first, then drop JSON tag metadata.')
  })

  it('warns when only unsupported files are dropped', async() => {
    const state = { statusEl: { textContent: '', style: {} } }
    await loadDroppedFiles(state, [file('notes.txt', 'text/plain')])
    expect(state.statusEl.textContent).toBe('Only image or JSON files can be dropped into SSE.')
  })
})
