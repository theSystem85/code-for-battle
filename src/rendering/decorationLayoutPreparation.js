import { buildDecorationLayout, getDecorationPoolSelectors } from './decorationLayout.js'

function freezeLayout(layout) {
  for (const key of ['cells', 'groundDetails']) {
    if (!Array.isArray(layout[key])) continue
    layout[key].forEach(cell => { if (cell && !Object.isFrozen(cell)) Object.freeze(cell) })
    Object.freeze(layout[key])
  }
  layout.placements?.forEach(placement => { if (!Object.isFrozen(placement)) Object.freeze(placement) })
  if (Array.isArray(layout.placements)) Object.freeze(layout.placements)
  if (Array.isArray(layout.cityStreets)) Object.freeze(layout.cityStreets)
  return Object.freeze(layout)
}

/**
 * Lifecycle-owned decoration preparation. `read()` is intentionally incapable
 * of constructing a layout; callers must publish through `prepare()` during a
 * startup, edit or configuration phase first.
 */
export class DecorationLayoutPreparation {
  #published = null
  #generation = 0

  prepare({ mapGrid, pools, mapRevision, catalogRevision, configRevision, options = {}, applySimulationEffects }) {
    if (!Array.isArray(mapGrid) || !mapGrid.length) {
      this.#published = null
      return null
    }
    const selectors = getDecorationPoolSelectors(pools)
    const layout = buildDecorationLayout(mapGrid, pools, options)
    // City buildings and collision occupancy remain an authoritative main-side
    // effect and must be applied before the render-facing snapshot is frozen.
    applySimulationEffects?.(mapGrid, layout)
    const state = Object.freeze({
      generation: ++this.#generation,
      mapGrid,
      mapRevision,
      catalogRevision,
      configRevision,
      placementSignature: selectors?.placementSignature || '',
      layout: freezeLayout(layout)
    })
    this.#published = state
    return state
  }

  read({ mapGrid, mapRevision, catalogRevision, configRevision }) {
    const state = this.#published
    if (!state || state.mapGrid !== mapGrid || state.mapRevision !== mapRevision ||
      state.catalogRevision !== catalogRevision || state.configRevision !== configRevision) return null
    return state.layout
  }

  invalidate() {
    this.#published = null
    this.#generation++
  }

  get generation() { return this.#generation }
  get published() { return this.#published }
}
