// Bound browser operations that may never settle (including image decode and GPU APIs).
export function withTimeout(operation, timeoutMs = 10000, label = 'Asset operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    Promise.resolve(operation).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

export async function fetchAssetJson(url, { fetchImpl = globalThis.fetch, signal, timeoutMs = 10000 } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  try {
    return await withTimeout((async() => {
      const response = await fetchImpl(url, { signal: controller.signal, cache: 'no-cache' })
      if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
      return response.json()
    })(), timeoutMs, url)
  } finally {
    controller.abort()
    signal?.removeEventListener('abort', abort)
  }
}
