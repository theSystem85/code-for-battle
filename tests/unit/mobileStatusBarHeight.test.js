import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'styles/base.css'), 'utf8')

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `missing rule ${selector}`).toBeTruthy()
  return match[1]
}

const portrait = 'body.mobile-portrait.sidebar-condensed.pwa-standalone'

describe('mobile money and power bars fill their status bar', () => {
  it('[U05209] stretches the portrait PWA bars to the full status bar height above the home indicator', () => {
    const bar = rule(`${portrait} #mobileBuildMenuContainer #mobileStatusBar`)
    expect(bar).toMatch(/align-items:\s*stretch/)
    expect(bar).toMatch(/padding:\s*3px 12px var\(--portrait-status-bar-bottom-reserve, 3px\)/)
    expect(rule(`${portrait} #mobileBuildMenuContainer #mobileStatusBar .mobile-resource-row`)).toMatch(/align-items:\s*stretch/)
    for (const id of ['mobileMoneyTrack', 'mobileEnergyTrack']) {
      const track = rule(`${portrait} #${id}`)
      expect(track).toMatch(/height:\s*100%/)
      expect(track).not.toMatch(/height:\s*\d+px/)
    }
    expect(rule(`${portrait} #mobileMoneyValue`)).toMatch(/align-items:\s*center/)
    // Larger, bolder labels for the taller bars.
    for (const id of ['mobileMoneyValue', 'mobileEnergyValue']) {
      expect(rule(`${portrait} #${id}`)).toMatch(/font-size:\s*12px/)
      expect(rule(`${portrait} #${id}`)).toMatch(/font-weight:\s*600/)
    }
    expect(rule(`${portrait} #mobileEnergyValue`)).toMatch(/align-items:\s*center/)
    expect(rule('body.is-touch')).toMatch(/--portrait-status-bar-bottom-reserve:\s*max\(3px, calc\(var\(--safe-area-bottom\) - 21px\)\)/)
  })

  it('[U05210] lets the landscape money and power rows share the status bar height', () => {
    expect(rule('body.mobile-landscape #mobileBuildMenuContainer #mobileStatusBar .mobile-resource-row')).toMatch(/flex:\s*1 1 0/)
    expect(rule('body.mobile-landscape #mobileEnergyBarContainer')).toMatch(/height:\s*auto/)
    expect(rule('body.mobile-landscape #mobileMoneyTrack')).toMatch(/height:\s*100%/)
    expect(rule('body.mobile-landscape #mobileEnergyTrack')).toMatch(/height:\s*100%/)
  })
})
