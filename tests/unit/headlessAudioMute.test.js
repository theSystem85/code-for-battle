import { afterEach, describe, expect, it } from 'vitest'

import { isHeadlessAudioMuted } from '../../src/utils/headlessAudioMute.js'

const originalWebdriver = Object.getOwnPropertyDescriptor(window.navigator, 'webdriver')
const originalUserAgent = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent')

function setNavigatorValue(property, value) {
  Object.defineProperty(window.navigator, property, {
    configurable: true,
    value
  })
}

describe('isHeadlessAudioMuted', () => {
  afterEach(() => {
    if (originalWebdriver) {
      Object.defineProperty(window.navigator, 'webdriver', originalWebdriver)
    } else {
      delete window.navigator.webdriver
    }

    if (originalUserAgent) {
      Object.defineProperty(window.navigator, 'userAgent', originalUserAgent)
    } else {
      delete window.navigator.userAgent
    }

    delete globalThis.__PLAYWRIGHT_MUTE_AUDIO__
  })

  it('returns true for automated headless chrome', () => {
    setNavigatorValue('webdriver', true)
    setNavigatorValue('userAgent', 'Mozilla/5.0 HeadlessChrome/124.0.0.0 Safari/537.36')

    expect(isHeadlessAudioMuted()).toBe(true)
  })

  it('returns false for non-headless browsers', () => {
    setNavigatorValue('webdriver', false)
    setNavigatorValue('userAgent', 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36')

    expect(isHeadlessAudioMuted()).toBe(false)
  })

  it('supports an explicit global mute override', () => {
    globalThis.__PLAYWRIGHT_MUTE_AUDIO__ = true

    expect(isHeadlessAudioMuted()).toBe(true)
  })

  it('supports an explicit Vite env mute flag', () => {
    const previousValue = import.meta.env.VITE_HEADLESS_E2E_MUTE_AUDIO
    import.meta.env.VITE_HEADLESS_E2E_MUTE_AUDIO = '1'

    expect(isHeadlessAudioMuted()).toBe(true)

    if (previousValue === undefined) {
      delete import.meta.env.VITE_HEADLESS_E2E_MUTE_AUDIO
    } else {
      import.meta.env.VITE_HEADLESS_E2E_MUTE_AUDIO = previousValue
    }
  })
})
