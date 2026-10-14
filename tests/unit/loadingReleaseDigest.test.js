import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION } from '../../src/version.js'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  document.body.innerHTML = ''
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('loading screen release integration', () => {
  it('shows old and new versions and only feature descriptions, then records successful loading time', async() => {
    localStorage.setItem('cfb-last-loaded-version', '0.46.0')
    localStorage.setItem('cfb-last-boot-duration-ms', '4000')
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const screen = await import('../../src/ui/loadingScreen.js')
    const session = screen.showLoadingScreen({ phase: 'boot', progress: 0.1 })
    expect(document.getElementById('loadingScreenVersion').textContent).toBe(`Loading update v0.46.0 → v${APP_VERSION}`)
    const notes = document.querySelector('.release-digest')
    expect(notes.textContent).toContain('1 new features · 1 improvements · 1 bugfixes')
    expect(notes.textContent).toContain('See what is new')
    expect(notes.textContent).not.toContain('Update highlights follow')
    now = 4100
    screen.updateLoadingScreen({ phase: 'ready', progress: 1 }, session)
    screen.hideLoadingScreen(session)
    expect(localStorage.getItem('cfb-last-boot-duration-ms')).toBe('4000')
    expect(localStorage.getItem('cfb-last-loaded-version')).toBe(APP_VERSION)
    expect(document.querySelector('.release-digest')).toBeNull()
  })

  it('does not acknowledge an update or overwrite measured loading time on failed startup', async() => {
    localStorage.setItem('cfb-last-loaded-version', '0.46.0')
    localStorage.setItem('cfb-last-boot-duration-ms', '2500')
    const screen = await import('../../src/ui/loadingScreen.js')
    const session = screen.showLoadingScreen({ phase: 'boot' })
    screen.updateLoadingScreen({ phase: 'error' }, session)
    screen.hideLoadingScreen(session)
    expect(localStorage.getItem('cfb-last-loaded-version')).toBe('0.46.0')
    expect(localStorage.getItem('cfb-last-boot-duration-ms')).toBe('2500')
  })
})
