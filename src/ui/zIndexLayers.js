/**
 * Document stacking layers.
 *
 * The numbers are mirrored by the `--z-*` custom properties in `styles/base.css`.
 * HUD chrome (notification bell, status pills, mobile controls) must stay above
 * the game canvas and strictly below every modal backdrop.
 */
export const Z_LAYERS = Object.freeze({
  canvas: 0,
  hud: 2000,
  hudFloat: 2200,
  hudPopover: 2400,
  modal: 5000,
  modalRaised: 5200,
  modalPopover: 5400,
  takeover: 8000,
  takeoverRaised: 8100,
  takeoverTop: 8400,
  loading: 14000
})

/** CSS custom property names paired with `Z_LAYERS`. */
export const Z_LAYER_CSS_VARS = Object.freeze({
  '--z-canvas': Z_LAYERS.canvas,
  '--z-hud': Z_LAYERS.hud,
  '--z-hud-float': Z_LAYERS.hudFloat,
  '--z-hud-popover': Z_LAYERS.hudPopover,
  '--z-modal': Z_LAYERS.modal,
  '--z-modal-raised': Z_LAYERS.modalRaised,
  '--z-modal-popover': Z_LAYERS.modalPopover,
  '--z-takeover': Z_LAYERS.takeover,
  '--z-takeover-raised': Z_LAYERS.takeoverRaised,
  '--z-takeover-top': Z_LAYERS.takeoverTop,
  '--z-loading': Z_LAYERS.loading
})

const HUD_LAYER_KEYS = Object.freeze(['canvas', 'hud', 'hudFloat', 'hudPopover'])

/**
 * True when canvas/HUD layers stay ordered and every one of them is below the modal backdrop.
 * @param {typeof Z_LAYERS} [layers]
 * @returns {boolean}
 */
export function hudLayersStayBelowModals(layers = Z_LAYERS) {
  const hudValues = HUD_LAYER_KEYS.map((key) => layers[key])
  const hudOrdered = hudValues.every((value, index) => index === 0 || value > hudValues[index - 1])
  const modalOrdered = layers.modal < layers.modalRaised
    && layers.modalRaised < layers.modalPopover
    && layers.modalPopover < layers.takeover
    && layers.takeover < layers.takeoverRaised
    && layers.takeoverRaised < layers.takeoverTop
    && layers.takeoverTop < layers.loading
  return hudOrdered && Math.max(...hudValues) < layers.modal && modalOrdered
}
