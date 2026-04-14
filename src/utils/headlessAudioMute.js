export function isHeadlessAudioMuted() {
  if (typeof globalThis !== 'undefined' && globalThis.__PLAYWRIGHT_MUTE_AUDIO__ === true) {
    return true
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_HEADLESS_E2E_MUTE_AUDIO === '1') {
    return true
  }

  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : ''
  return navigator.webdriver === true && /HeadlessChrome/i.test(userAgent)
}
