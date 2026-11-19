import { graphicsTunerAvailable } from '../benchmark/graphicsTunerRunner.js'
import { GRAPHICS_TUNER_FEATURES, formatGraphicsValue } from '../benchmark/graphicsTunerModel.js'
import { applyGraphicsTunerSettings } from './graphicsTunerSettings.js'
import { openBenchmarkModal, setBenchmarkRunningState, showBenchmarkStatus } from './benchmarkModal.js'

function cell(tag, content) {
  const element = document.createElement(tag)
  element.textContent = content
  return element
}

function describeMetrics(metrics) {
  return `${metrics.fps.toFixed(1)} FPS · p95 ${metrics.p95.toFixed(1)} ms`
}

export function showGraphicsTunerReport(report) {
  showBenchmarkStatus(report.meetsGoal ? 'Recommended settings met the 60 FPS benchmark goal.' :
    report.refreshHz < 59.5 ? 'Display cadence was below 60 Hz. Showing the fastest measured settings.' :
      'No tested combination sustained the 60 FPS goal. Showing the fastest measured settings.')
  const root = document.getElementById('benchmarkGraphicsReport')
  const apply = document.getElementById('benchmarkApplyGraphicsBtn')
  const { recommendation } = report
  const info = cell('p', `Recommended · ${describeMetrics(recommendation.metrics)} · ${recommendation.backend} · ${recommendation.backing.width}×${recommendation.backing.height} render pixels`)
  const scene = cell('p', `Base view ${describeMetrics(recommendation.stationary)}. First scroll ${describeMetrics(recommendation.firstTraversal)}. Repeated scroll ${describeMetrics(recommendation.repeatedTraversal)}.`)
  const details = cell('p', `Frame time p99 ${recommendation.metrics.p99.toFixed(1)} ms, max ${recommendation.metrics.max.toFixed(1)} ms. ${recommendation.metrics.missed} intervals above 16.67 ms and ${recommendation.metrics.cadenceMisses} estimated refresh misses (over ${report.deadline.toFixed(1)} ms). CPU update ${recommendation.metrics.update.toFixed(1)} ms and render submission ${recommendation.metrics.render.toFixed(1)} ms per frame.`)
  const table = document.createElement('table')
  table.caption = cell('caption', 'Settings ranked by measured savings')
  const head = table.createTHead().insertRow()
  for (const title of ['Setting', 'Measured variants', 'Saving', 'Recommended']) {
    const heading = cell('th', title)
    heading.scope = 'col'
    head.append(heading)
  }
  const body = table.createTBody()
  report.ranking.forEach(({ key, variants, saving }) => {
    const label = GRAPHICS_TUNER_FEATURES.find(feature => feature.key === key).label
    const row = body.insertRow()
    const name = cell('th', label)
    name.scope = 'row'
    const measurements = variants.map(variant => `${formatGraphicsValue(variant.value)} · ${describeMetrics(variant)}`).join('\n')
    row.append(name, cell('td', measurements), cell('td', saving > 0.35 ? `${saving.toFixed(1)} ms` : 'Within noise'),
      cell('td', formatGraphicsValue(recommendation.settings[key])))
  })
  const note = cell('small', `Each setting was compared twice with the others fixed. Savings use p95 frame time, then CPU work when frames are display-capped. Estimated display cadence ${report.refreshHz.toFixed(1)} Hz. Recorded ${new Date(report.recordedAt).toLocaleString()}.`)
  root.replaceChildren(info, scene, details, table, note)
  if (!report.ranking.some(feature => feature.key === 'coastalShallows')) {
    root.append(cell('p', 'This report predates the Coastal Shallows test. Run the tuner again to measure it.'))
  }
  root.hidden = false
  apply.hidden = false
  apply.disabled = !graphicsTunerAvailable()
  apply.textContent = 'Apply settings'
  apply.onclick = async() => {
    if (!graphicsTunerAvailable()) {
      document.getElementById('benchmarkModalStatus').textContent = 'Apply the recommendation after leaving the connected match.'
      return
    }
    apply.disabled = true
    apply.textContent = 'Applying…'
    setBenchmarkRunningState(true)
    try {
      await applyGraphicsTunerSettings(recommendation.settings)
      apply.textContent = 'Applied'
      document.getElementById('benchmarkModalStatus').textContent = 'Recommended graphics settings applied.'
    } catch (error) {
      apply.disabled = false
      apply.textContent = 'Apply settings'
      document.getElementById('benchmarkModalStatus').textContent = error.message
    } finally {
      setBenchmarkRunningState(false)
    }
  }
  openBenchmarkModal()
}
