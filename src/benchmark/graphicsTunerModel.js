export const GRAPHICS_TUNER_FEATURES = Object.freeze([
  { key: 'shadows', label: 'Unit shadows', control: 'settingsUnitShadowsToggle' },
  { key: 'selectionHud', label: 'Detailed selection HUD', control: 'settingsDetailedSelectionHud' },
  { key: 'density', label: 'Render pixel density', control: 'settingsRenderPixelDensity' },
  { key: 'customSprites', label: 'Custom map sprites', control: 'integratedSpriteSheetModeCheckbox' },
  { key: 'smoke', label: 'Smoke particles', control: 'settingsSmokeToggle' },
  { key: 'oceanWater', label: 'Ocean Surface Water', control: 'settingsOceanWaterToggle' },
  { key: 'coastalShallows', label: 'Coastal Shallows', control: 'settingsCoastalShallowsToggle' }
])

export const TARGET_FRAME_MS = 1000 / 60
const TIMESTAMP_TOLERANCE_MS = 0.5
const MIN_COMPARABLE_SAVING_MS = 0.35

export function graphicsCadenceDeadline(refreshHz) {
  // Half a display interval separates a late callback from a missed refresh.
  return TARGET_FRAME_MS + 500 / Math.max(60, refreshHz)
}

export function buildGraphicsProfiles(deviceDensity, customSprites = true) {
  const density = Math.min(3, Math.max(1, Math.floor(deviceDensity) || 1))
  const reference = { shadows: true, selectionHud: true, density, customSprites, smoke: true, oceanWater: true, coastalShallows: true }
  const profiles = [{ id: 'reference', settings: reference }]
  for (const { key } of GRAPHICS_TUNER_FEATURES) {
    const values = key === 'density' ? [1, 2, 3] : [!reference[key]]
    for (const value of values) {
      if (value !== reference[key]) profiles.push({ id: `${key}:${value}`, settings: { ...reference, [key]: value } })
    }
  }
  return profiles
}

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0
}

export function summarizeGraphicsFrames(samples, deadline = graphicsCadenceDeadline(60)) {
  if (!samples.length) throw new Error('No graphics frames were recorded')
  const intervals = samples.map(sample => sample.interval).sort((a, b) => a - b)
  const work = samples.map(sample => sample.update + sample.render).sort((a, b) => a - b)
  const sum = key => samples.reduce((total, sample) => total + sample[key], 0)
  return {
    frames: samples.length,
    fps: samples.length * 1000 / sum('interval'),
    p95: percentile(intervals, 0.95),
    p99: percentile(intervals, 0.99),
    max: intervals.at(-1),
    missed: intervals.filter(value => value > TARGET_FRAME_MS).length,
    cadenceMisses: intervals.filter(value => value > deadline).length,
    workP95: percentile(work, 0.95),
    update: sum('update') / samples.length,
    render: sum('render') / samples.length
  }
}

export function reachesGraphicsGoal(result, refreshHz) {
  return refreshHz >= 59.5 && result.metrics.fps >= 59.5 &&
    result.metrics.p95 <= TARGET_FRAME_MS + 2 * TIMESTAMP_TOLERANCE_MS &&
    result.metrics.cadenceMisses === 0 && result.metrics.workP95 <= TARGET_FRAME_MS &&
    (!result.stationary || result.stationary.fps >= 59.5) && (!result.scrolling || result.scrolling.fps >= 59.5)
}

export function rankGraphicsCosts(results) {
  const reference = results.find(result => result.id === 'reference')
  return GRAPHICS_TUNER_FEATURES.map(feature => {
    const comparable = results.filter(result => result.id === 'reference' || result.id.startsWith(`${feature.key}:`))
    const variants = comparable.map(({ settings, metrics }) => ({ value: settings[feature.key], ...metrics }))
    variants.sort((a, b) => Number(b.value) - Number(a.value))
    // Use the selected workload's tail latency. CPU submission time breaks ties when both runs hit vsync.
    const muchFaster = (fastest, candidate) => costSaving(fastest, candidate) > MIN_COMPARABLE_SAVING_MS ? candidate : fastest
    const fastest = variants.reduce(muchFaster)
    const slowest = variants.reduce((slow, candidate) => costSaving(candidate, slow) > MIN_COMPARABLE_SAVING_MS ? candidate : slow)
    const eligible = feature.key === 'density' ? variants.filter(variant => variant.value <= reference.settings.density) : variants
    const best = eligible.reduce(muchFaster)
    return {
      key: feature.key, variants, best: best.value, saving: Math.max(0, costSaving(slowest, fastest)),
      reduction: costSaving(reference.metrics, best)
    }
  }).sort((a, b) => b.saving - a.saving)
}

function costSaving(before, after) {
  if (!before.cadenceMisses && !after.cadenceMisses && Math.abs(before.fps - after.fps) < 0.5) {
    return before.workP95 - after.workP95
  }
  const intervalSaving = before.p95 - after.p95
  return Math.abs(intervalSaving) >= MIN_COMPARABLE_SAVING_MS ? intervalSaving : before.workP95 - after.workP95
}

export async function recommendGraphicsProfile(results, ranking, refreshHz, measure) {
  const reference = results.find(result => result.id === 'reference')
  if (reachesGraphicsGoal(reference, refreshHz)) return reference
  const qualityLoss = candidate => GRAPHICS_TUNER_FEATURES.reduce((loss, { key }) => {
    if (key === 'density') return loss + (reference.settings.density - candidate.settings.density) / 2
    return loss + Number(candidate.settings[key] !== reference.settings[key])
  }, 0)
  const highestQuality = results.filter(candidate =>
    candidate.settings.density <= reference.settings.density && reachesGraphicsGoal(candidate, refreshHz)
  ).sort((a, b) => qualityLoss(a) - qualityLoss(b) || a.metrics.workP95 - b.metrics.workP95)[0]
  if (highestQuality) return highestQuality
  const settings = { ...reference.settings }
  const candidates = [...results]
  for (const feature of ranking) {
    if (feature.reduction < MIN_COMPARABLE_SAVING_MS) continue
    settings[feature.key] = feature.best
    const existing = candidates.find(candidate => GRAPHICS_TUNER_FEATURES.every(({ key }) => candidate.settings[key] === settings[key]))
    const result = existing || await measure({ id: `combined:${feature.key}`, settings: { ...settings } })
    if (!existing) candidates.push(result)
    if (reachesGraphicsGoal(result, refreshHz)) return result
  }
  // Also measure the low-quality endpoint when individual costs were hidden by the frame cap.
  const lean = { shadows: false, selectionHud: false, density: 1, customSprites: false, smoke: false, oceanWater: false, coastalShallows: false }
  const low = candidates.find(candidate => GRAPHICS_TUNER_FEATURES.every(({ key }) => candidate.settings[key] === lean[key])) ||
    await measure({ id: 'combined:lean', settings: lean })
  if (reachesGraphicsGoal(low, refreshHz)) return low
  candidates.push(low)
  const eligible = candidates.filter(candidate => candidate.settings.density <= reference.settings.density)
  const peakFps = Math.max(...eligible.map(candidate => candidate.metrics.fps))
  return eligible.filter(candidate => candidate.metrics.fps >= peakFps - 0.5)
    .sort((a, b) => a.metrics.cadenceMisses / a.metrics.frames - b.metrics.cadenceMisses / b.metrics.frames ||
      a.metrics.p95 - b.metrics.p95 || qualityLoss(a) - qualityLoss(b))[0]
}

export function formatGraphicsValue(value) {
  return typeof value === 'boolean' ? (value ? 'On' : 'Off') : `${value}×`
}
