import { beforeEach, describe, expect, it } from 'vitest'
import {
  getLoadingScreenState,
  hideLoadingScreen,
  runWithLoadingScreen,
  showLoadingScreen,
  updateLoadingScreen
} from '../../src/ui/loadingScreen.js'

describe('loadingScreen', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.className = ''
    hideLoadingScreen()
  })

  it('shows a determinate loading state the UI can bind to', () => {
    const session = showLoadingScreen({
      phase: 'assets',
      kicker: 'THEATER COMMAND',
      detail: 'Loading battlefield assets',
      progress: 0.42
    })

    const root = document.getElementById('loadingScreen')
    expect(root.classList.contains('loading-screen--hidden')).toBe(false)
    expect(root.getAttribute('aria-busy')).toBe('true')
    expect(root.dataset.phase).toBe('assets')
    expect(document.body.classList.contains('game-loading')).toBe(true)
    expect(document.getElementById('loadingScreenKicker').textContent).toBe('THEATER COMMAND')
    expect(document.getElementById('loadingScreenDetail').textContent).toBe('Loading battlefield assets')
    expect(document.getElementById('loadingScreenBar').style.width).toBe('42%')
    expect(document.getElementById('loadingScreenBar').classList.contains('is-indeterminate')).toBe(false)
    expect(document.getElementById('loadingScreenPercent').textContent).toBe('42%')
    expect(document.getElementById('loadingScreenTrack').getAttribute('aria-valuenow')).toBe('42')
    expect(getLoadingScreenState().session).toBe(session)
    expect(getLoadingScreenState().visible).toBe(true)
  })

  it('uses an indeterminate standby state when progress is unknown', () => {
    showLoadingScreen({
      phase: 'map',
      kicker: 'MAP CONTROL',
      detail: 'Generating the map',
      progress: null
    })

    const bar = document.getElementById('loadingScreenBar')
    expect(bar.classList.contains('is-indeterminate')).toBe(true)
    expect(bar.style.width).toBe('')
    expect(document.getElementById('loadingScreenPercent').textContent).toBe('STANDBY')
    expect(document.getElementById('loadingScreenTrack').hasAttribute('aria-valuenow')).toBe(false)
    expect(document.getElementById('loadingScreenTrack').getAttribute('aria-valuetext')).toBe('Loading')
  })

  it('hides cleanly and ignores a stale session', () => {
    const first = showLoadingScreen({ detail: 'First', progress: 0.2 })
    const second = showLoadingScreen({ detail: 'Second', progress: 0.5 })

    hideLoadingScreen(first)

    expect(getLoadingScreenState().visible).toBe(true)
    expect(document.getElementById('loadingScreenDetail').textContent).toBe('Second')

    hideLoadingScreen(second)

    const root = document.getElementById('loadingScreen')
    expect(root.classList.contains('loading-screen--hidden')).toBe(true)
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.getAttribute('aria-busy')).toBe('false')
    expect(root.hasAttribute('inert')).toBe(true)
    expect(document.body.classList.contains('game-loading')).toBe(false)
    expect(getLoadingScreenState().visible).toBe(false)
  })

  it('ignores progress updates from an older session', () => {
    const first = showLoadingScreen({ detail: 'Boot', progress: 0.1 })
    showLoadingScreen({ detail: 'Map', progress: null })

    updateLoadingScreen({ detail: 'Stale', progress: 0.9 }, first)

    expect(document.getElementById('loadingScreenDetail').textContent).toBe('Map')
    expect(document.getElementById('loadingScreenBar').classList.contains('is-indeterminate')).toBe(true)
  })

  it('runs a reload task after the overlay can paint, then tears it down', async() => {
    let sawOverlay = false

    const result = await runWithLoadingScreen(() => {
      sawOverlay = getLoadingScreenState().visible === true
      return 'ready'
    }, {
      phase: 'restart',
      kicker: 'NEW BATTLE',
      detail: 'Rebuilding the battlefield',
      progress: null
    })

    expect(result).toBe('ready')
    expect(sawOverlay).toBe(true)
    expect(getLoadingScreenState().visible).toBe(false)
    expect(document.body.classList.contains('game-loading')).toBe(false)
    expect(document.getElementById('loadingScreen').classList.contains('loading-screen--hidden')).toBe(true)
  })

  it('removes the overlay when a reload task fails', async() => {
    await expect(runWithLoadingScreen(() => {
      throw new Error('regen failed')
    }, {
      detail: 'Generating the map',
      progress: null
    })).rejects.toThrow('regen failed')

    expect(getLoadingScreenState().visible).toBe(false)
    expect(document.body.classList.contains('game-loading')).toBe(false)
  })
})
