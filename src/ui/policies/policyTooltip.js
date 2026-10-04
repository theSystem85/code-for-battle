// Custom tooltip for the policy UI. The native `title` attribute is never used:
// one shared, styled element follows the pointer instead. Touch has no hover,
// so every tooltip text is also exposed through aria-label.

import { h } from './policyDom.js'

let tip = null

function ensureTip() {
  if (!tip || !tip.isConnected) {
    tip = h('div', { class: 'policy-tooltip', role: 'tooltip' })
    document.body.appendChild(tip)
  }
  return tip
}

export function hidePolicyTooltip() {
  if (tip) tip.classList.remove('is-visible')
}

function showPolicyTooltip(text, x, y) {
  const el = ensureTip()
  el.replaceChildren(...String(text).split('\n').map((line, index) =>
    h(index === 0 ? 'strong' : 'div', { text: line })))
  el.classList.add('is-visible')
  const width = el.offsetWidth
  const height = el.offsetHeight
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x + 14))}px`
  el.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, y + 18))}px`
}

/** Attach a custom tooltip. `getText` may return a string or an empty value. */
export function attachPolicyTooltip(element, getText) {
  const read = typeof getText === 'function' ? getText : () => getText
  element.setAttribute('aria-label', String(read() || '').replace(/\n/g, '. '))
  element.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return
    const text = read()
    if (text) showPolicyTooltip(text, event.clientX, event.clientY)
  })
  element.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return
    const text = read()
    if (text) showPolicyTooltip(text, event.clientX, event.clientY)
  })
  element.addEventListener('pointerleave', hidePolicyTooltip)
  element.addEventListener('pointerdown', hidePolicyTooltip)
  return element
}
