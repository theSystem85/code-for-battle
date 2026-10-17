const LABEL_FONT_PX = 7
const LABEL_MIN_FONT_PX = 5
const LABEL_INSET_PX = 1.5

// True when every rendered text line box lies inside the button's inner circle.
// Measured in layout pixels, so the fly-out scale transform does not matter.
function labelFits(button, text) {
  const outer = button.getBoundingClientRect()
  const scale = button.offsetWidth ? outer.width / button.offsetWidth : 0
  if (!scale || typeof document.createRange !== 'function') return true
  const range = document.createRange()
  range.selectNodeContents(text)
  const lines = typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : []
  if (!lines.length) return true
  const radius = button.clientWidth / 2 - LABEL_INSET_PX
  const cx = outer.left + outer.width / 2
  const cy = outer.top + outer.height / 2
  return lines.every(line => [[line.left, line.top], [line.right, line.top], [line.left, line.bottom], [line.right, line.bottom]]
    .every(([x, y]) => Math.hypot((x - cx) / scale, (y - cy) / scale) <= radius))
}

// Runs once per menu open (event-driven, a handful of buttons); never in the frame loop.
export function fitMapActionLabels(root) {
  for (const button of root.querySelectorAll('.radial-menu__button.has-text')) {
    const text = button.querySelector('.radial-menu__text')
    if (!text) continue
    let size = LABEL_FONT_PX
    text.style.fontSize = `${size}px`
    text.style.overflowWrap = ''
    while (size > LABEL_MIN_FONT_PX && !labelFits(button, text)) {
      size -= 0.5
      text.style.fontSize = `${size}px`
    }
    // A single word longer than the button may still break as a last resort.
    if (!labelFits(button, text)) text.style.overflowWrap = 'anywhere'
  }
}
