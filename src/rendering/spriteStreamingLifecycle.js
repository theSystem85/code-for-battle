function generation(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Invalid ${name}`)
  return value
}

export function createSpriteReservationToken({ tokenId, owner, byteClass, bytes, generation: value }) {
  if (typeof tokenId !== 'string' || !tokenId || typeof owner !== 'string' || !owner) throw new TypeError('Invalid reservation identity')
  if (typeof byteClass !== 'string' || !byteClass) throw new TypeError('Invalid reservation byte class')
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new RangeError('Invalid reservation bytes')
  return Object.freeze({ tokenId, owner, byteClass, bytes, generation: generation(value, 'reservation generation') })
}

export function createSpriteReleaseToken(reservation, reason) {
  if (!reservation?.tokenId || typeof reason !== 'string' || !reason) throw new TypeError('Invalid release token')
  return Object.freeze({ tokenId: reservation.tokenId, generation: reservation.generation, bytes: reservation.bytes, reason })
}

export function createVisibilityDemandSnapshot({ revision, capturedAt, moving, spriteIds, requestedTier }) {
  if (!Array.isArray(spriteIds)) throw new TypeError('Visibility demand spriteIds must be an array')
  if (!Number.isInteger(requestedTier) || requestedTier < 0) throw new RangeError('Invalid requested tier')
  return Object.freeze({
    revision: generation(revision, 'demand revision'),
    capturedAt: Number(capturedAt),
    moving: Boolean(moving),
    spriteIds: Object.freeze(spriteIds.map(String)),
    requestedTier
  })
}

export function createGenerationCancellation({ asset, map, density, reason }) {
  if (typeof reason !== 'string' || !reason) throw new TypeError('Invalid cancellation reason')
  return Object.freeze({
    asset: generation(asset, 'asset generation'),
    map: generation(map, 'map generation'),
    density: generation(density, 'density generation'),
    reason
  })
}

export function createSpritePublication({ spriteId, tier, revision, generations, resourceToken }) {
  if (typeof spriteId !== 'string' || !spriteId || !resourceToken?.tokenId) throw new TypeError('Invalid sprite publication')
  return Object.freeze({
    spriteId,
    tier: generation(tier, 'publication tier'),
    revision: generation(revision, 'publication revision'),
    generations: Object.freeze({
      asset: generation(generations?.asset, 'asset generation'),
      map: generation(generations?.map, 'map generation'),
      density: generation(generations?.density, 'density generation')
    }),
    resourceToken
  })
}
