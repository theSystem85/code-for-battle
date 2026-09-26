import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyGamepadIndicatorVisibility,
  gamepadIndicatorVisibility,
  gamepadRemoteIndicatorMode
} from '../../src/input/gamepad/gamepadIndicators.js'

function readRepoFile(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('in-game gamepad player overlay', () => {
  it('hides the overlay when no pad is connected', () => {
    expect(gamepadIndicatorVisibility([false, false])).toEqual({
      overlay: false,
      chips: [false, false]
    })
  })

  it('treats null gamepad slots and a missing list as disconnected', () => {
    expect(gamepadIndicatorVisibility([null, null])).toEqual({
      overlay: false,
      chips: [false, false]
    })
    expect(gamepadIndicatorVisibility([undefined, undefined])).toEqual({
      overlay: false,
      chips: [false, false]
    })
    expect(gamepadIndicatorVisibility(null)).toEqual({
      overlay: false,
      chips: [false, false]
    })
    expect(gamepadIndicatorVisibility([])).toEqual({
      overlay: false,
      chips: [false, false]
    })
    expect(gamepadIndicatorVisibility([{ connected: false }, { connected: false }])).toEqual({
      overlay: false,
      chips: [false, false]
    })
  })

  it('shows only the chip for the connected player, including player 2 alone', () => {
    expect(gamepadIndicatorVisibility([false, true])).toEqual({
      overlay: true,
      chips: [false, true]
    })
    expect(gamepadIndicatorVisibility([null, { connected: true }])).toEqual({
      overlay: true,
      chips: [false, true]
    })
    expect(gamepadIndicatorVisibility([{ connected: true }, null])).toEqual({
      overlay: true,
      chips: [true, false]
    })
  })

  it('shows the remote chip only for a connected player that is in remote control', () => {
    expect(gamepadRemoteIndicatorMode([false, false], [true, true])).toBe(0)
    expect(gamepadRemoteIndicatorMode([null, null], [true, false])).toBe(0)
    expect(gamepadRemoteIndicatorMode(null, [true, true])).toBe(0)
    expect(gamepadRemoteIndicatorMode([true, false], [false, false])).toBe(0)
    expect(gamepadRemoteIndicatorMode([true, false], [true, false])).toBe(1)
    expect(gamepadRemoteIndicatorMode([false, true], [true, true])).toBe(2)
    expect(gamepadRemoteIndicatorMode([true, true], [true, true])).toBe(3)
    expect(gamepadRemoteIndicatorMode([{ connected: false }, { connected: true }], [true, true])).toBe(2)
  })

  it('shows only the P1 chip for one connected pad', () => {
    expect(gamepadIndicatorVisibility([true, false])).toEqual({
      overlay: true,
      chips: [true, false]
    })
  })

  it('shows P1 and P2 when two pads are connected', () => {
    expect(gamepadIndicatorVisibility([true, true])).toEqual({
      overlay: true,
      chips: [true, true]
    })
  })

  it('hides a chip when that player disconnects', () => {
    expect(gamepadIndicatorVisibility([true, true]).chips).toEqual([true, true])
    expect(gamepadIndicatorVisibility([true, false]).chips).toEqual([true, false])
    expect(gamepadIndicatorVisibility([false, false]).overlay).toBe(false)
  })

  it('sets hidden on the container and on chips for players that are not connected', () => {
    document.body.innerHTML = `
      <div id="gamepadIndicators" class="gamepad-indicators">
        <span id="gamepadIndicatorP1" class="gamepad-indicator">P1</span>
        <span id="gamepadIndicatorP2" class="gamepad-indicator">P2</span>
      </div>`
    const host = document.getElementById('gamepadIndicators')
    const chips = [
      document.getElementById('gamepadIndicatorP1'),
      document.getElementById('gamepadIndicatorP2')
    ]

    applyGamepadIndicatorVisibility(host, chips, [false, false])
    expect(host.hidden).toBe(true)
    expect(chips[0].hidden).toBe(true)
    expect(chips[1].hidden).toBe(true)
    expect(chips[0].textContent).toBe('P1')
    expect(chips[1].textContent).toBe('P2')

    applyGamepadIndicatorVisibility(host, chips, [true, false])
    expect(host.hidden).toBe(false)
    expect(chips[0].hidden).toBe(false)
    expect(chips[0].classList.contains('gamepad-indicator--on')).toBe(true)
    expect(chips[1].hidden).toBe(true)
    expect(chips[1].classList.contains('gamepad-indicator--on')).toBe(false)

    applyGamepadIndicatorVisibility(host, chips, [true, true])
    expect(host.hidden).toBe(false)
    expect(chips[0].hidden).toBe(false)
    expect(chips[1].hidden).toBe(false)
    expect(chips[1].classList.contains('gamepad-indicator--on')).toBe(true)

    applyGamepadIndicatorVisibility(host, chips, [null, null])
    expect(host.hidden).toBe(true)
    expect(chips[0].hidden).toBe(true)
    expect(chips[1].hidden).toBe(true)
    expect(chips[0].classList.contains('gamepad-indicator--on')).toBe(false)
    expect(chips[1].classList.contains('gamepad-indicator--on')).toBe(false)
  })
})

describe('gamepad chrome stays fully hidden', () => {
  it('forces display:none on hidden indicator, remote, and cursor nodes', () => {
    const css = readRepoFile('styles/overlays.css')
    const hiddenRule = css.match(/\.gamepad-indicators\[hidden\][\s\S]*?\.gamepad-cursor\[hidden\]\s*\{[^}]*\}/)
    expect(hiddenRule).not.toBeNull()
    expect(hiddenRule[0]).toMatch(/\.gamepad-indicator\[hidden\]/)
    expect(hiddenRule[0]).toMatch(/\.gamepad-remote\[hidden\]/)
    expect(hiddenRule[0]).toMatch(/display:\s*none\s*!important/)
    expect(css).not.toMatch(/\.gamepad-(?:indicators|indicator|remote|cursor)::(?:before|after)/)
  })

  it('ships the in-game chrome hidden until a pad connects', () => {
    const html = readRepoFile('index.html')
    for (const id of ['gamepadIndicators', 'gamepadIndicatorP1', 'gamepadIndicatorP2', 'gamepadRemoteIndicator', 'gamepadCursor']) {
      const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))
      expect(tag, id).not.toBeNull()
      expect(tag[0]).toMatch(/\shidden\b/)
    }
  })
})
