import { afterEach, expect, it } from 'vitest'
import { initSettingsModal, openSettingsModal } from '../../src/ui/settingsModal.js'
import { DEFAULT_MAP_ACTION_LONG_PRESS_MS, MAP_ACTION_LONG_PRESS_MS, setMapActionLongPressMs } from '../../src/config.js'

// Opening through the public API may precede the idle startup initializer.
afterEach(() => {
  document.body.innerHTML = ''
  document.body.className = ''
  setMapActionLongPressMs(DEFAULT_MAP_ACTION_LONG_PRESS_MS)
})

it('[U02560] binds hold duration before opening and tolerates deferred initialization afterward', () => {
  document.body.innerHTML = `<div id="configSettingsModal">
    <input id="settingsMapActionLongPressMs" type="number">
    <button id="configModalCloseBtn">Close</button>
  </div>`
  openSettingsModal('runtime')
  initSettingsModal()
  const input = document.getElementById('settingsMapActionLongPressMs')
  input.value = '900'
  input.dispatchEvent(new Event('change'))
  expect(MAP_ACTION_LONG_PRESS_MS).toBe(900)
  document.getElementById('configModalCloseBtn').click()
  expect(document.getElementById('configSettingsModal').getAttribute('aria-hidden')).toBe('true')
})
