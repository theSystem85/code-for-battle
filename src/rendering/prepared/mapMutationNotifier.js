import {
  RenderRevisionStore,
  RENDER_REVISION_DOMAINS
} from './renderRevisionStore.js'

export const M10_MUTATION_PRODUCERS = Object.freeze([
  'src/mapEditor.js',
  'src/buildings.js',
  'src/factories.js',
  'src/game/harvesterLogic.js',
  'src/game/gameStateManager.js',
  'src/game/tileDecals.js',
  'src/game/mapBiomes.js',
  'src/gameSetup.js',
  'src/saveGame.js',
  'src/network/stateSync.js',
  'src/game/gameOrchestrator.js'
])

export const M10_RENDER_DEPENDENCIES = Object.freeze({
  topology: Object.freeze(['type', 'airstripStreet']),
  surface: Object.freeze([
    'biome',
    'shorelineBiome',
    'biomeBlend.biome',
    'biomeBlend.alpha',
    'biomeBlend.angle',
    'biomeBlend.cornerWeights',
    'biomeBlend.featherPixels',
    'building'
  ]),
  resource: Object.freeze(['ore', 'oreDensity', 'seedCrystal', 'seedCrystalDensity']),
  decal: Object.freeze([
    'decal.tag',
    'decal.variantSeed',
    'decal.groupWidth',
    'decal.groupHeight',
    'decal.groupOriginX',
    'decal.groupOriginY'
  ]),
  excluded: Object.freeze(['noBuild', 'decalCounter'])
})

export const MAP_MUTATION_HALOS = Object.freeze({
  topology: 10,
  surface: 2,
  resource: 0,
  decal: 0
})

const BULK_DOMAINS = Object.freeze([
  RENDER_REVISION_DOMAINS.TOPOLOGY,
  RENDER_REVISION_DOMAINS.WATER,
  RENDER_REVISION_DOMAINS.SURFACE,
  RENDER_REVISION_DOMAINS.RESOURCE,
  RENDER_REVISION_DOMAINS.DECAL
])

let revisionStore = null
let pendingTopologyBounds = null
let pendingSurfaceBounds = null
let mutationEpoch = 0

function getDimensions(source) {
  if (Array.isArray(source)) {
    const height = source.length
    const width = Array.isArray(source[0]) ? source[0].length : 0
    return width > 0 && height > 0 ? { width, height } : null
  }

  const width = Number(source?.width)
  const height = Number(source?.height)
  return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
    ? { width, height }
    : null
}

function ensureRevisionStore(source) {
  const dimensions = getDimensions(source)
  if (!dimensions) return revisionStore

  if (
    revisionStore &&
    (revisionStore.width !== dimensions.width || revisionStore.height !== dimensions.height)
  ) {
    if (revisionStore.transactionDepth > 0) {
      throw new Error('Cannot resize the render revision store during a map mutation transaction')
    }
    revisionStore.dispose()
    revisionStore = null
  }

  if (!revisionStore) {
    revisionStore = new RenderRevisionStore(dimensions)
  }
  return revisionStore
}

function fullMapBounds(store) {
  return { left: 0, top: 0, right: store.width, bottom: store.height }
}

function tileBounds(tileX, tileY) {
  return { left: tileX, top: tileY, right: tileX + 1, bottom: tileY + 1 }
}

function recordPendingBounds(domain, oldBounds, newBounds, halo) {
  const store = revisionStore
  if (!store) return
  const merged = {
    left: Math.min(oldBounds.left, newBounds.left) - halo,
    top: Math.min(oldBounds.top, newBounds.top) - halo,
    right: Math.max(oldBounds.right, newBounds.right) + halo,
    bottom: Math.max(oldBounds.bottom, newBounds.bottom) + halo
  }
  if (domain === RENDER_REVISION_DOMAINS.TOPOLOGY || domain === RENDER_REVISION_DOMAINS.WATER) {
    pendingTopologyBounds = pendingTopologyBounds
      ? {
        left: Math.min(pendingTopologyBounds.left, merged.left),
        top: Math.min(pendingTopologyBounds.top, merged.top),
        right: Math.max(pendingTopologyBounds.right, merged.right),
        bottom: Math.max(pendingTopologyBounds.bottom, merged.bottom)
      }
      : merged
  }
  if (domain === RENDER_REVISION_DOMAINS.SURFACE) {
    pendingSurfaceBounds = pendingSurfaceBounds
      ? {
        left: Math.min(pendingSurfaceBounds.left, merged.left),
        top: Math.min(pendingSurfaceBounds.top, merged.top),
        right: Math.max(pendingSurfaceBounds.right, merged.right),
        bottom: Math.max(pendingSurfaceBounds.bottom, merged.bottom)
      }
      : merged
  }
}

function invalidate(source, domain, oldBounds, newBounds, halo) {
  const store = ensureRevisionStore(source)
  if (!store || !oldBounds || !newBounds) return
  store.invalidate(domain, oldBounds, newBounds, halo)
  recordPendingBounds(domain, oldBounds, newBounds, halo)
  mutationEpoch++
}

export function getMapMutationRevisionStore() {
  return revisionStore
}

export function resetMapMutationRevisionStore() {
  revisionStore?.dispose()
  revisionStore = null
  pendingTopologyBounds = null
  pendingSurfaceBounds = null
  mutationEpoch = 0
}

export function consumePendingTerrainSync() {
  const snapshot = {
    store: revisionStore,
    mutationEpoch,
    topologyBounds: pendingTopologyBounds,
    surfaceBounds: pendingSurfaceBounds
  }
  pendingTopologyBounds = null
  pendingSurfaceBounds = null
  return snapshot
}

export function beginMapMutationTransaction(source, { replace = false } = {}) {
  const store = ensureRevisionStore(source)
  if (!store) return null

  store.beginTransaction()
  if (replace) {
    const bounds = fullMapBounds(store)
    BULK_DOMAINS.forEach(domain => {
      store.invalidate(domain, bounds)
      recordPendingBounds(domain, bounds, bounds, 0)
    })
    mutationEpoch++
  }
  return store
}

export function commitMapMutationTransaction(store) {
  if (!store) return
  if (store !== revisionStore) {
    throw new Error('Cannot commit a stale map mutation transaction')
  }
  store.commitTransaction()
  mutationEpoch++
}

export function cancelMapMutationTransaction(store) {
  if (!store || store !== revisionStore || store.transactionDepth === 0) return
  store.cancelTransaction()
}

export function notifyTopologyMutation(source, oldBounds, newBounds = oldBounds) {
  invalidate(
    source,
    RENDER_REVISION_DOMAINS.TOPOLOGY,
    oldBounds,
    newBounds,
    MAP_MUTATION_HALOS.topology
  )
  invalidate(
    source,
    RENDER_REVISION_DOMAINS.WATER,
    oldBounds,
    newBounds,
    MAP_MUTATION_HALOS.topology
  )
}

export function notifySurfaceMutation(source, oldBounds, newBounds = oldBounds) {
  invalidate(
    source,
    RENDER_REVISION_DOMAINS.SURFACE,
    oldBounds,
    newBounds,
    MAP_MUTATION_HALOS.surface
  )
}

export function notifyResourceMutation(source, oldBounds, newBounds = oldBounds) {
  invalidate(
    source,
    RENDER_REVISION_DOMAINS.RESOURCE,
    oldBounds,
    newBounds,
    MAP_MUTATION_HALOS.resource
  )
}

export function notifyDecalMutation(source, oldBounds, newBounds = oldBounds) {
  invalidate(
    source,
    RENDER_REVISION_DOMAINS.DECAL,
    oldBounds,
    newBounds,
    MAP_MUTATION_HALOS.decal
  )
}

export function notifyTopologyTileMutation(source, tileX, tileY) {
  notifyTopologyMutation(source, tileBounds(tileX, tileY))
}

export function notifySurfaceTileMutation(source, tileX, tileY) {
  notifySurfaceMutation(source, tileBounds(tileX, tileY))
}

export function notifyResourceTileMutation(source, tileX, tileY) {
  notifyResourceMutation(source, tileBounds(tileX, tileY))
}

export function notifyDecalTileMutation(source, tileX, tileY) {
  notifyDecalMutation(source, tileBounds(tileX, tileY))
}
