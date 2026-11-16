// 512 x 512 RGBA atlas: bounded to 1 MiB decoded, shared by both backends.
export const FIRE_SHEET_PATH = '/images/effects/64x128_8x4_fire.webp'
let sheet = null
let preparation = null
export function prepareFireSprites() {
  if (!preparation) preparation = new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = async() => {
      try { await image.decode(); sheet = image; resolve() } catch (error) { reject(error) }
    }
    image.onerror = reject
    image.src = FIRE_SHEET_PATH
  })
  return preparation
}
export function getFireSprites() { return sheet }
