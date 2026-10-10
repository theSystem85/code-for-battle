import { applyBlackKey } from './blackKeyPixels.js'

globalThis.onmessage = ({ data: { image } }) => {
  try {
    const canvas = new globalThis.OffscreenCanvas(image.width, image.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Explosion preparation context unavailable')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    applyBlackKey(pixels.data)
    context.putImageData(pixels, 0, 0)
    const texture = canvas.transferToImageBitmap()
    globalThis.postMessage({ texture }, [texture])
  } catch (error) {
    globalThis.postMessage({ error: error.message })
  } finally {
    image.close()
  }
}
