function abortError(reason = 'Image preparation aborted') {
  if (reason instanceof DOMException && reason.name === 'AbortError') return reason
  return new DOMException(String(reason), 'AbortError')
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal.reason)
}

export async function decodePreparedImage(image, { signal } = {}) {
  throwIfAborted(signal)
  if (!image) throw new TypeError('A source image is required')
  if (typeof image.decode === 'function') {
    await image.decode()
    throwIfAborted(signal)
  }
  if (('naturalWidth' in image && !image.naturalWidth) || ('naturalHeight' in image && !image.naturalHeight)) {
    throw new Error('Image decoded without usable dimensions')
  }
  return image
}

export function loadPreparedImage(src, {
  signal,
  imageFactory = () => new Image(),
  crossOrigin
} = {}) {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const image = imageFactory()
    let settled = false

    const cleanup = () => {
      signal?.removeEventListener?.('abort', onAbort)
      if (image.removeEventListener) {
        image.removeEventListener('load', onLoad)
        image.removeEventListener('error', onError)
      } else {
        image.onload = null
        image.onerror = null
      }
    }
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const onAbort = () => settle(reject, abortError(signal.reason))
    const onError = () => settle(reject, new Error(`Failed to load image: ${src}`))
    const onLoad = async() => {
      try {
        await decodePreparedImage(image, { signal })
        settle(resolve, image)
      } catch (error) {
        settle(reject, error)
      }
    }

    signal?.addEventListener?.('abort', onAbort, { once: true })
    if (image.addEventListener) {
      image.addEventListener('load', onLoad, { once: true })
      image.addEventListener('error', onError, { once: true })
    } else {
      image.onload = onLoad
      image.onerror = onError
    }
    if (crossOrigin !== undefined) image.crossOrigin = crossOrigin
    image.src = src
  })
}

export function estimateDecodedImageBytes(image) {
  const width = Number(image?.naturalWidth || image?.width || 0)
  const height = Number(image?.naturalHeight || image?.height || 0)
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return 0
  const bytes = width * height * 4
  return Number.isSafeInteger(bytes) ? bytes : 0
}
