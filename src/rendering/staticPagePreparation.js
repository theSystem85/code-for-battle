import { SPRITE_TIER_NAMES } from './spriteStreamingGeometry.js'

function requireText(value, name) {
  if (typeof value !== 'string' || !value) throw new TypeError(`Invalid ${name}`)
  return value
}

function requireRevision(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Invalid ${name}`)
  return value
}

export function createStaticPagePreparationJob({
  pageKey,
  mapGeneration,
  densityGeneration,
  tier,
  pageRevision,
  bounds,
  assetRevisions = []
}) {
  if (!Number.isInteger(tier) || tier < 0 || tier >= SPRITE_TIER_NAMES.length) {
    throw new RangeError('Invalid page tier')
  }
  if (!bounds || !Number.isInteger(bounds.startX) || !Number.isInteger(bounds.startY) ||
      !Number.isInteger(bounds.endX) || !Number.isInteger(bounds.endY)) {
    throw new TypeError('Invalid page bounds')
  }
  const frozenAssets = assetRevisions.map(({ assetId, revision }) => Object.freeze({
    assetId: requireText(assetId, 'asset id'),
    revision: requireRevision(revision, 'asset revision')
  }))
  return Object.freeze({
    pageKey: requireText(pageKey, 'page key'),
    mapGeneration: requireRevision(mapGeneration, 'map generation'),
    densityGeneration: requireRevision(densityGeneration, 'density generation'),
    tier,
    pageRevision: requireRevision(pageRevision, 'page revision'),
    bounds: Object.freeze({ ...bounds }),
    assetRevisions: Object.freeze(frozenAssets)
  })
}

// A page-local reverse index keeps a sheet completion from invalidating the
// whole terrain cache. Both sides are bounded by the resident page cache.
export class StaticPageDependencyIndex {
  constructor() {
    this.assetsByPage = new Map()
    this.pagesByAsset = new Map()
    this.revisionsByAssetTier = new Map()
  }

  replacePage(pageKey, assetIds) {
    this.removePage(pageKey)
    const assets = new Set([...assetIds].filter(Boolean).map(String))
    if (!assets.size) return
    this.assetsByPage.set(pageKey, assets)
    for (const assetId of assets) {
      let pages = this.pagesByAsset.get(assetId)
      if (!pages) this.pagesByAsset.set(assetId, (pages = new Set()))
      pages.add(pageKey)
    }
  }

  removePage(pageKey) {
    const assets = this.assetsByPage.get(pageKey)
    if (!assets) return
    for (const assetId of assets) {
      const pages = this.pagesByAsset.get(assetId)
      pages?.delete(pageKey)
      if (!pages?.size) this.pagesByAsset.delete(assetId)
    }
    this.assetsByPage.delete(pageKey)
  }

  publishAssetTier(assetId, tier, revision) {
    requireText(assetId, 'asset id')
    if (!Number.isInteger(tier) || tier < 0 || tier >= SPRITE_TIER_NAMES.length) throw new RangeError('Invalid asset tier')
    requireRevision(revision, 'asset revision')
    const key = `${assetId}\u0000${tier}`
    const previous = this.revisionsByAssetTier.get(key) ?? -1
    if (revision <= previous) return Object.freeze([])
    this.revisionsByAssetTier.set(key, revision)
    return Object.freeze([...(this.pagesByAsset.get(assetId) || [])])
  }

  snapshotForPage(pageKey, tier) {
    return Object.freeze([...(this.assetsByPage.get(pageKey) || [])]
      .sort()
      .map(assetId => Object.freeze({
        assetId,
        revision: this.revisionsByAssetTier.get(`${assetId}\u0000${tier}`) ?? 0
      })))
  }

  clear() {
    this.assetsByPage.clear()
    this.pagesByAsset.clear()
  }
}
