import { describe, expect, it } from 'vitest'
import { applyGamepadIndicatorVisibility, gamepadIndicatorVisibility } from '../../src/input/gamepad/gamepadIndicators.js'

describe('in-game gamepad player overlay', () => {
  it('hides the overlay when no pad is connected', () => {
    expect(gamepadIndicatorVisibility([false, false])).toEqual({
      overlay: false,
      chips: [false, false]
    })
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
  })
})
