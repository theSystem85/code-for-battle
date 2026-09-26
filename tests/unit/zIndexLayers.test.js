import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Z_LAYER_CSS_VARS, Z_LAYERS, hudLayersStayBelowModals } from '../../src/ui/zIndexLayers.js'

function readRepoFile(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function readCssLayerVariables(css) {
  const vars = {}
  const pattern = /(--z-[a-z0-9-]+):\s*(\d+)\s*;/g
  let match = pattern.exec(css)
  while (match) {
    vars[match[1]] = Number(match[2])
    match = pattern.exec(css)
  }
  return vars
}

describe('z-index layers', () => {
  it('keeps HUD chrome, including the bell layer, below every modal backdrop', () => {
    expect(hudLayersStayBelowModals()).toBe(true)
    expect(Z_LAYERS.hudFloat).toBeLessThan(Z_LAYERS.modal)
    expect(Z_LAYERS.hudPopover).toBeLessThan(Z_LAYERS.modal)
    expect(Z_LAYERS.hud).toBeGreaterThan(Z_LAYERS.canvas)
  })

  it('mirrors the CSS custom properties in base.css', () => {
    const vars = readCssLayerVariables(readRepoFile('styles/base.css'))
    expect(vars).toEqual(Z_LAYER_CSS_VARS)
  })

  it('pins the notification bell, history panel, and status pills to HUD layers', () => {
    const history = readRepoFile('styles/notificationHistory.css')
    const overlays = readRepoFile('styles/overlays.css')
    expect(history).toMatch(/\.notif-badge\s*\{[^}]*z-index:\s*var\(--z-hud-float\)/)
    expect(history).toMatch(/\.notif-history\s*\{[^}]*z-index:\s*var\(--z-hud-popover\)/)
    expect(overlays).toMatch(/\.gamepad-indicators\s*\{[^}]*z-index:\s*var\(--z-hud-float\)/)
    expect(overlays).toMatch(/\.gamepad-remote\s*\{[^}]*z-index:\s*var\(--z-hud-float\)/)
    expect(overlays).toMatch(/\.benchmark-countdown\s*\{[^}]*z-index:\s*var\(--z-hud-float\)/)
  })

  it('puts modal backdrops on the modal layer or above', () => {
    const overlays = readRepoFile('styles/overlays.css')
    const modals = readRepoFile('styles/modals.css')
    const sidebar = readRepoFile('styles/sidebar.css')
    const cheat = readRepoFile('src/input/cheatSystem.js')
    const runtime = readRepoFile('src/ui/runtimeConfigDialog.js')

    expect(overlays).toMatch(/\.config-modal\s*\{[^}]*z-index:\s*var\(--z-modal\)/)
    expect(overlays).toMatch(/\.mission-intro\s*\{[^}]*z-index:\s*var\(--z-takeover\)/)
    expect(overlays).toMatch(/\.performance-dialog\s*\{[^}]*z-index:\s*var\(--z-modal\)/)
    expect(modals).toMatch(/\.keybinding-conflict-overlay\s*\{[^}]*z-index:\s*var\(--z-modal-raised\)/)
    expect(modals).toMatch(/\.kicked-modal\s*\{[^}]*z-index:\s*var\(--z-modal\)/)
    expect(modals).toMatch(/\.benchmark-modal\s*\{[^}]*z-index:\s*var\(--z-modal\)/)
    expect(modals).toMatch(/\.mobile-sidebar-modal\s*\{[^}]*z-index:\s*var\(--z-modal\)/s)
    expect(modals).toMatch(/\.user-docs-modal\s*\{[^}]*z-index:\s*var\(--z-takeover-top\)/)
    expect(sidebar).toMatch(/\.performance-monitor-dialog\s*\{[^}]*z-index:\s*var\(--z-modal\)/)
    expect(cheat).toContain('z-index: var(--z-modal-raised)')
    expect(runtime).toContain('z-index: var(--z-modal-raised)')
  })
})
