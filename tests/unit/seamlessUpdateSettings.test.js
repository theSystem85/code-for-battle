import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../src/storage/indexedDbStorage.js', () => ({
  getStoredItem: vi.fn(), setStoredItem: vi.fn()
}))
import { getStoredItem, setStoredItem } from '../../src/storage/indexedDbStorage.js'
import { isSeamlessUpdateEnabled, setSeamlessUpdateEnabled, SEAMLESS_UPDATE_SETTING } from '../../src/pwa/seamlessUpdateSettings.js'

beforeEach(() => vi.clearAllMocks())
it('[U07177] disables seamless updates unless the user explicitly opts in', () => {
  for (const value of [null, undefined, '', 'false']) {
    getStoredItem.mockReturnValue(value)
    expect(isSeamlessUpdateEnabled()).toBe(false)
  }
  getStoredItem.mockReturnValue('true')
  expect(isSeamlessUpdateEnabled()).toBe(true)
  setSeamlessUpdateEnabled(false)
  expect(setStoredItem).toHaveBeenCalledWith(SEAMLESS_UPDATE_SETTING, 'false')
})
