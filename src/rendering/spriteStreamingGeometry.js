export const SPRITE_TIER_IDS = Object.freeze({ COARSE: 0, INTERMEDIATE: 1, FINAL: 2 })
export const SPRITE_TIER_NAMES = Object.freeze(['coarse', 'intermediate', 'final'])

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`Invalid ${name}`)
  return value
}

function dimension(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`Invalid ${name}`)
  return value
}

export function createStableSpriteGeometry({ spriteId, logicalWidth, logicalHeight, anchorX = 0.5, anchorY = 0.5 }) {
  if (typeof spriteId !== 'string' || !spriteId) throw new TypeError('Invalid stable sprite id')
  return Object.freeze({
    spriteId,
    logicalWidth: dimension(logicalWidth, 'logical width'),
    logicalHeight: dimension(logicalHeight, 'logical height'),
    anchorX: finite(anchorX, 'anchor x'),
    anchorY: finite(anchorY, 'anchor y')
  })
}

export function createSpriteTierSourceRect({ tier, x, y, width, height, padding = 0, gutter = 0, backingDensity }) {
  if (!Number.isInteger(tier) || tier < 0 || tier >= SPRITE_TIER_NAMES.length) throw new RangeError('Invalid sprite tier')
  if (!Number.isInteger(x) || x < 0 || !Number.isInteger(y) || y < 0) throw new RangeError('Invalid source origin')
  if (!Number.isInteger(padding) || padding < 0 || !Number.isInteger(gutter) || gutter < 0) throw new RangeError('Invalid source padding')
  return Object.freeze({
    tier,
    x,
    y,
    width: dimension(width, 'source width'),
    height: dimension(height, 'source height'),
    padding,
    gutter,
    backingDensity: finite(backingDensity, 'backing density')
  })
}

// Progressive tiers are the sole non-native sampling exception. Draw them into
// stable logical geometry; never use their pixel dimensions for simulation.
export function createProgressiveSpriteDescriptor({ geometry, sources }) {
  if (!geometry?.spriteId || !Array.isArray(sources) || sources.length === 0) throw new TypeError('Invalid progressive sprite descriptor')
  const tiers = sources.slice().sort((left, right) => left.tier - right.tier)
  for (let index = 0; index < tiers.length; index++) {
    if (tiers[index].tier !== index) throw new RangeError('Sprite tiers must be contiguous and unique')
  }
  return Object.freeze({ geometry, sources: Object.freeze(tiers) })
}
