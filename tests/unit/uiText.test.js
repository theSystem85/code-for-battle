import { describe, expect, it } from 'vitest'
import { uiText } from '../../src/ui/uiText.js'
import { formatHeavyBattlePhases, showHeavyBattleResults } from '../../src/ui/benchmarkModal.js'

describe('settings benchmark copy', () => {
  it('returns English and German benchmark labels', () => {
    expect(uiText('settings.benchmark.heavy', 'en')).toBe('Heavy battle (320 units)')
    expect(uiText('settings.benchmark.heavy', 'de')).toBe('Schwere Schlacht (320 Einheiten)')
    expect(uiText('settings.benchmark.standard', 'de')).toBe('Karten-Scroll-Benchmark')
  })

  it('names the multiplayer join field for a code or a link', () => {
    expect(uiText('multiplayer.joinLabel', 'en')).toBe('Invite code or link')
    expect(uiText('multiplayer.joinLabel', 'de')).toBe('Einladungscode oder Link')
    expect(uiText('multiplayer.joinInvalid', 'en')).toBe('Enter a valid invite code or link.')
    expect(uiText('multiplayer.joinInvalid', 'de')).toBe('Gib einen gültigen Einladungscode oder Link ein.')
    expect(uiText('multiplayer.joinNotFound', 'en')).toBe('That invite code was not found or has expired.')
    expect(uiText('multiplayer.joinNotFound', 'de')).toBe('Dieser Einladungscode wurde nicht gefunden oder ist abgelaufen.')
  })

  it('stacks heavy-battle phases in the existing results dialog', () => {
    document.body.innerHTML = `
      <div id="benchmarkModal">
        <p id="benchmarkModalStatus"></p>
        <div id="benchmarkResultsContainer" hidden>
          <span id="benchmarkMinFps"></span>
          <span id="benchmarkMaxFps"></span>
          <span id="benchmarkAvgFps"></span>
          <span id="benchmarkDuration"></span>
          <canvas id="benchmarkChart"></canvas>
          <pre id="benchmarkPhaseBreakdown" hidden></pre>
        </div>
        <button id="benchmarkRunAgainBtn"></button>
        <button id="benchmarkModalCloseBtn"></button>
        <button id="benchmarkModalCloseFooterBtn"></button>
      </div>
    `

    showHeavyBattleResults({
      durationMs: 8000,
      phases: {
        frame: { fps: 95, minMs: 8, maxMs: 20, averageMs: 10.5 },
        phases: {
          sim: { samples: 10, averageMs: 4, p95Ms: 6 },
          movement: { samples: 10, averageMs: 2, p95Ms: 3 }
        }
      }
    })

    expect(document.getElementById('benchmarkModalStatus').textContent).toBe('Heavy battle complete')
    expect(document.getElementById('benchmarkAvgFps').textContent).toBe('95.0')
    expect(document.getElementById('benchmarkChart').hidden).toBe(true)
    const phases = document.getElementById('benchmarkPhaseBreakdown')
    expect(phases.hidden).toBe(false)
    expect(phases.textContent).toContain('Sim: 4.0/6.0')
    expect(phases.textContent).toContain('Move: 2.0/3.0')
    expect(phases.textContent).not.toContain(' · ')
    expect(formatHeavyBattlePhases({ fog: { samples: 1, averageMs: 0.2, p95Ms: 0.4 } })).toContain('Fog: 0.2/0.4')
  })
})
