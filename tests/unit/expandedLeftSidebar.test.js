import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

const html = readFileSync(resolve('index.html'), 'utf8')
const sidebarCss = readFileSync(resolve('styles/sidebar.css'), 'utf8')
const { document } = new JSDOM(html).window

function formControlCount(row) {
  return row.querySelectorAll('input, select, textarea').length
}

describe('expanded left sidebar markup', () => {
  it('collapses multiplayer and save game with the map settings accordion pattern', () => {
    const sidebar = document.querySelector('#sidebar.expanded-left-sidebar')
    expect(sidebar).toBeTruthy()

    for (const [toggleId, contentId] of [
      ['mapSettingsToggle', 'mapSettingsContent'],
      ['multiplayerToggle', 'multiplayerContent'],
      ['saveLoadToggle', 'saveLoadContent']
    ]) {
      const toggle = document.getElementById(toggleId)
      const content = document.getElementById(contentId)
      expect(toggle?.getAttribute('data-sidebar-accordion-toggle')).not.toBeNull()
      expect(toggle?.getAttribute('aria-controls')).toBe(contentId)
      expect(toggle?.getAttribute('aria-expanded')).toBe('false')
      expect(toggle?.querySelector('[data-sidebar-accordion-icon]')?.textContent).toBe('▼')
      expect(content?.style.display).toBe('none')
    }
  })

  it('shows a Statistics headline', () => {
    expect(document.querySelector('#stats #statsHeading')?.textContent).toBe('Statistics')
  })

  it('keeps form rows on a two-column grid, including the biome controls', () => {
    const biomeRow = document.getElementById('mapBiomeRegionCount')?.closest('.sidebar-form-row')
    expect(biomeRow).toBeTruthy()
    expect(formControlCount(biomeRow)).toBe(3)

    const rows = document.querySelectorAll('#sidebar .sidebar-form-row')
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach((row) => {
      expect(row.getAttribute('style') || '').not.toMatch(/grid-template-columns\s*:\s*([^;]*1fr){3,}/)
      expect(row.getAttribute('style') || '').not.toMatch(/display\s*:\s*flex/i)
    })

    expect(sidebarCss).toMatch(/#sidebar\.expanded-left-sidebar \.sidebar-form-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expect(sidebarCss).toMatch(/#sidebar\.expanded-left-sidebar \.sidebar-form-row > :last-child:nth-child\(odd\)/)
  })
})
