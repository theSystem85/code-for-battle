export const GRAPHICS_TUNER_PARAM = 'graphics-tuner'

export function isGraphicsTunerFrame() {
  return typeof window !== 'undefined' && window.parent !== window &&
    new URLSearchParams(window.location.search).has(GRAPHICS_TUNER_PARAM)
}
