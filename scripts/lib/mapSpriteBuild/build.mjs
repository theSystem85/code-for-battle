import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { ATLAS_VERSION, CATALOG_VERSION, collectGroups, metadataSignature, packShelf, sha256 } from './catalog.mjs'
import { applyDecorationCutout, applySheetPixelRules, PIXEL_RULES_VERSION } from './pixelRules.mjs'

export const BUILD_VERSION = 1
export const WEBP_QUALITY = 85
export const PADDING = 2
export const SELECTED_TIERS = Object.freeze([
  Object.freeze({ id: 'coarse', tier: 0, backingDensity: 0.5 }),
  Object.freeze({ id: 'final', tier: 2, backingDensity: 1 })
])

const scaleRect = (rect, density) => ({
  width: Math.max(1, Math.round(rect.width * density)),
  height: Math.max(1, Math.round(rect.height * density))
})

export async function prepareSheet({ imagePath, metadataPath }) {
  const [sourceBytes, metadataBytes] = await Promise.all([readFile(imagePath), readFile(metadataPath)])
  const metadata = JSON.parse(metadataBytes)
  const decoded = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = Buffer.from(decoded.data)
  const keyedPixels = applySheetPixelRules(pixels, decoded.info.width, decoded.info.height, metadata)
  const groups = collectGroups(metadata)
  const preparedGroups = []
  for (const group of groups) {
    const extracted = await sharp(pixels, { raw: { width: decoded.info.width, height: decoded.info.height, channels: 4 } })
      .extract({ left: group.rect.x, top: group.rect.y, width: group.rect.width, height: group.rect.height }).raw().toBuffer()
    let coverage = null
    // This is the runtime rule: native-alpha groups are already ready. A
    // non-alpha decorative group is cut out once, before every resize.
    if (metadata.blendMode !== 'alpha' && group.tags.includes('decorative')) {
      coverage = applyDecorationCutout(extracted, group.rect.width, group.rect.height, {
        cellSize: metadata.tileSize || 64,
        innerCuts: group.tags.includes('inner_cuts')
      }).coverage
    }
    preparedGroups.push({ ...group, pixels: extracted, coverage })
  }
  return {
    metadata,
    groups: preparedGroups,
    sourceHash: sha256(sourceBytes),
    metadataHash: sha256(metadataBytes),
    metadataSignature: metadataSignature(metadata),
    keyedPixels
  }
}

export async function buildSheetArtifacts({ name, imagePath, metadataPath }) {
  const prepared = await prepareSheet({ imagePath, metadataPath })
  const pages = []
  const spriteSources = new Map(prepared.groups.map(group => [group.id, []]))
  for (const tier of SELECTED_TIERS) {
    const items = prepared.groups.map(group => ({ id: group.id, ...scaleRect(group.rect, tier.backingDensity), group }))
    const packed = packShelf(items, PADDING)
    const composites = []
    for (const placement of packed.placements) {
      const resized = tier.backingDensity === 1
        ? placement.group.pixels
        : await sharp(placement.group.pixels, { raw: { width: placement.group.rect.width, height: placement.group.rect.height, channels: 4 } })
          .resize(placement.width, placement.height, { kernel: sharp.kernel.lanczos3 }).raw().toBuffer()
      composites.push({ input: resized, raw: { width: placement.width, height: placement.height, channels: 4 }, left: placement.x, top: placement.y })
      spriteSources.get(placement.id).push({ tier: tier.tier, tierName: tier.id, page: `${name}.${tier.id}.webp`, x: placement.x, y: placement.y,
        width: placement.width, height: placement.height, padding: PADDING, gutter: PADDING, backingDensity: tier.backingDensity })
    }
    const bytes = await sharp({ create: { width: packed.width, height: packed.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites).webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 4 }).toBuffer()
    pages.push({ name: `${name}.${tier.id}.webp`, bytes, sha256: sha256(bytes), width: packed.width, height: packed.height,
      decodedBytes: packed.width * packed.height * 4, compressedBytes: bytes.length, tier: tier.tier, tierName: tier.id, backingDensity: tier.backingDensity })
  }
  const sprites = prepared.groups.map(group => ({
    spriteId: `${name}:${group.id}`,
    groupId: group.id,
    savedIdentifiers: group.savedIdentifiers,
    logicalWidth: group.rect.width,
    logicalHeight: group.rect.height,
    anchorX: 0.5,
    anchorY: 0.5,
    sourceRect: group.rect,
    tileKeys: group.tiles.map(tile => tile.key),
    tags: group.tags,
    coverage: group.coverage,
    sources: spriteSources.get(group.id)
  }))
  const identity = {
    buildVersion: BUILD_VERSION, atlasVersion: ATLAS_VERSION, catalogVersion: CATALOG_VERSION,
    pixelRulesVersion: PIXEL_RULES_VERSION, webpQuality: WEBP_QUALITY, padding: PADDING,
    sourceHash: prepared.sourceHash, metadataHash: prepared.metadataHash, metadataSignature: prepared.metadataSignature,
    selectedBackingDensities: SELECTED_TIERS.map(tier => tier.backingDensity)
  }
  const manifest = {
    schemaVersion: 1,
    name,
    identity,
    signature: metadataSignature({ identity, sprites }),
    source: {
      image: imagePath.replace(/^.*public\//, ''),
      metadata: metadataPath.replace(/^.*public\//, ''),
      sourceMetadata: prepared.metadata.source || null,
      editorMetadata: {
        schemaVersion: prepared.metadata.schemaVersion,
        layoutVersion: prepared.metadata.layoutVersion,
        name: prepared.metadata.name,
        grid: prepared.metadata.grid,
        tags: prepared.metadata.tags,
        propLayout: prepared.metadata.propLayout,
        extension: prepared.metadata.extension
      }
    },
    upscaledBeyondMaster: false,
    omittedCandidateDensities: [2, 3],
    pages: pages.map(({ bytes: _bytes, ...page }) => page),
    sprites
  }
  return { manifest, pages }
}
