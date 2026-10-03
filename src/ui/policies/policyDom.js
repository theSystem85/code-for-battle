export function h(tag, props, ...children) {
  const el = document.createElement(tag)
  if (props) {
    Object.entries(props).forEach(([key, value]) => {
      if (value == null || value === false) return
      if (key === 'class') el.className = value
      else if (key === 'text') el.textContent = value
      else if (key === 'dataset') Object.entries(value).forEach(([k, v]) => { el.dataset[k] = v })
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value)
      else if (key === 'value') el.value = value
      else if (key === 'checked' || key === 'selected' || key === 'disabled') el[key] = Boolean(value)
      else el.setAttribute(key, value === true ? '' : String(value))
    })
  }
  children.flat().forEach(child => {
    if (child == null || child === false) return
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  })
  return el
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  if (props) {
    Object.entries(props).forEach(([key, value]) => {
      if (value == null || value === false) return
      if (key === 'text') el.textContent = value
      else el.setAttribute(key, String(value))
    })
  }
  children.flat().forEach(child => child && el.appendChild(child))
  return el
}

export function option(value, label, selected) {
  return h('option', { value, text: label, selected })
}
