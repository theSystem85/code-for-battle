import { afterEach, expect, it } from 'vitest'
import { fitMapActionLabels } from '../../src/ui/mapActions/mapActionLabels.js'

afterEach(() => { document.body.innerHTML = '' })

// jsdom has no layout, so fake one: line boxes grow with font size around the button center.
function button(widthAt) {
  const el = document.createElement('button')
  el.className = 'radial-menu__button has-text'
  const text = document.createElement('span')
  text.className = 'radial-menu__text'
  text.textContent = 'Automation on arrival'
  el.appendChild(text)
  document.body.appendChild(el)
  Object.defineProperty(el, 'offsetWidth', { value: 48 })
  Object.defineProperty(el, 'clientWidth', { value: 44 })
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 48, height: 48 })
  const createRange = document.createRange.bind(document)
  document.createRange = () => {
    const range = createRange()
    range.getClientRects = () => {
      const half = widthAt(parseFloat(text.style.fontSize)) / 2
      return [{ left: 24 - half, right: 24 + half, top: 20, bottom: 28 }]
    }
    return range
  }
  return text
}

it('keeps the 7 px label when it already fits inside the circle', () => {
  const text = button(size => size * 5)
  fitMapActionLabels(document.body)
  expect(text.style.fontSize).toBe('7px')
})

it('shrinks long labels until every line box is inside the circle', () => {
  const text = button(size => size * 6.5)
  fitMapActionLabels(document.body)
  expect(parseFloat(text.style.fontSize)).toBeLessThan(7)
  const half = parseFloat(text.style.fontSize) * 6.5 / 2
  expect(Math.hypot(half, 4)).toBeLessThanOrEqual(22 - 1.5)
})

it('allows a mid-word break only when the minimum size still overflows', () => {
  const text = button(() => 60)
  fitMapActionLabels(document.body)
  expect(text.style.fontSize).toBe('5px')
  expect(text.style.overflowWrap).toBe('anywhere')
})
