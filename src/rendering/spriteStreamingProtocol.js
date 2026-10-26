export const SPRITE_WORKER_PROTOCOL_VERSION = 1

export const SPRITE_WORKER_OPERATIONS = Object.freeze({
  PREPARE_SHEET: 'prepare-sheet',
  PREPARE_ROTATIONS: 'prepare-rotations',
  CANCEL_GENERATION: 'cancel-generation',
  CAPABILITIES: 'capabilities'
})

export const SPRITE_WORKER_RESULT_KINDS = Object.freeze({
  CAPABILITIES: 'capabilities',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled',
  ERROR: 'error'
})

export const SPRITE_WORKER_FALLBACKS = Object.freeze({
  PREBUILT: 'prebuilt-derivative',
  CONTROLLED_LOADING: 'controlled-loading-state',
  COOPERATIVE: 'cooperative-bounded-preparation',
  UNAVAILABLE: 'unavailable'
})

export function createSpriteWorkerCapabilities({
  worker = false,
  offscreenCanvas = false,
  imageBitmap = false,
  transferableImageBitmap = false,
  fallback = SPRITE_WORKER_FALLBACKS.UNAVAILABLE
} = {}) {
  if (!Object.values(SPRITE_WORKER_FALLBACKS).includes(fallback)) throw new TypeError('Invalid sprite worker fallback')
  return Object.freeze({
    protocolVersion: SPRITE_WORKER_PROTOCOL_VERSION,
    worker: Boolean(worker),
    offscreenCanvas: Boolean(offscreenCanvas),
    imageBitmap: Boolean(imageBitmap),
    transferableImageBitmap: Boolean(transferableImageBitmap),
    fallback
  })
}

function requireGeneration(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Invalid ${name}`)
  return value
}

export function createSpriteWorkerRequest({ requestId, operation, generations, payload = null }) {
  if (typeof requestId !== 'string' || !requestId) throw new TypeError('Invalid worker request id')
  if (!Object.values(SPRITE_WORKER_OPERATIONS).includes(operation)) throw new TypeError('Invalid worker operation')
  const frozenGenerations = Object.freeze({
    asset: requireGeneration(generations?.asset, 'asset generation'),
    map: requireGeneration(generations?.map, 'map generation'),
    density: requireGeneration(generations?.density, 'density generation')
  })
  return Object.freeze({ protocolVersion: SPRITE_WORKER_PROTOCOL_VERSION, requestId, operation, generations: frozenGenerations, payload })
}

export function createSpriteWorkerResult({ requestId, kind, generations, payload = null, errorCode = null }) {
  if (!Object.values(SPRITE_WORKER_RESULT_KINDS).includes(kind)) throw new TypeError('Invalid worker result kind')
  const request = createSpriteWorkerRequest({ requestId, operation: SPRITE_WORKER_OPERATIONS.CAPABILITIES, generations })
  return Object.freeze({
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    kind,
    generations: request.generations,
    payload,
    errorCode: errorCode === null ? null : String(errorCode)
  })
}
