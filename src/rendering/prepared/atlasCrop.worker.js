export function createAtlasCropper({ fetch, createImageBitmap }) {
  let atlas
  let atlasUrl
  return async({ url, rect, width, height, maxSourceBytes }) => {
    if (url !== atlasUrl) {
      atlas?.close()
      atlas = atlasUrl = undefined
      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`Atlas fetch failed: ${response.status}`)
      const decoded = await createImageBitmap(await response.blob())
      if (decoded.width * decoded.height * 4 > maxSourceBytes) {
        decoded.close()
        throw new Error('Decoded atlas exceeds the worker source budget')
      }
      atlas = decoded
      atlasUrl = url
    }
    return createImageBitmap(atlas, rect.x, rect.y, rect.width, rect.height, {
      resizeWidth: width, resizeHeight: height, resizeQuality: 'high'
    })
  }
}

if (typeof globalThis.WorkerGlobalScope !== 'undefined' && globalThis instanceof globalThis.WorkerGlobalScope) {
  const crop = createAtlasCropper({
    fetch: globalThis.fetch.bind(globalThis),
    createImageBitmap: globalThis.createImageBitmap.bind(globalThis)
  })
  let queue = Promise.resolve()
  globalThis.onmessage = ({ data }) => {
    queue = queue.then(async() => {
      try {
        const bitmap = await crop(data)
        globalThis.postMessage({ id: data.id, bitmap }, [bitmap])
      } catch (error) {
        globalThis.postMessage({ id: data.id, error: error.message })
      }
    })
  }
}
