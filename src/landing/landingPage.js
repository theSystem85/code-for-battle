import { ASSET_IDS, FEATURE_IDS, LEGAL_HREFS, TECH_ICONS, TECH_TREE } from './landingContent.js'
import { loadLandingDictionary, rememberLandingLocale, translate } from './landingLocale.js'

function createNode(token, dict) {
  const el = document.createElement('span')
  el.className = `tech-node tech-node--${token.kind}`
  const icon = TECH_ICONS[token.id]
  if (icon) {
    const img = document.createElement('img')
    img.src = icon
    img.alt = ''
    img.width = 28
    img.height = 28
    img.loading = 'lazy'
    img.decoding = 'async'
    el.append(img)
  }
  const label = document.createElement('span')
  label.textContent = translate(dict, `landing.tech.nodes.${token.id}`)
  el.append(label)
  if (token.suffix) {
    const suffix = document.createElement('span')
    suffix.className = 'tech-suffix'
    suffix.textContent = translate(dict, `landing.tech.suffix.${token.suffix}`)
    el.append(suffix)
  }
  return el
}

function appendToken(parent, token, dict) {
  if (token.type === 'node') {
    parent.append(createNode(token, dict))
    return
  }

  if (token.type === 'joiner') {
    const el = document.createElement('span')
    el.className = 'tech-joiner'
    el.textContent = translate(dict, `landing.tech.${token.id}`)
    parent.append(el)
    return
  }

  if (token.type === 'arrow') {
    const el = document.createElement('span')
    el.className = 'tech-arrow'
    el.setAttribute('aria-hidden', 'true')
    el.textContent = '→'
    parent.append(el)
    return
  }

  if (token.type === 'group') {
    const el = document.createElement('span')
    el.className = 'tech-group'
    token.nodes.forEach((child, index) => {
      if (index > 0) appendToken(el, { type: 'joiner', id: token.joiner }, dict)
      appendToken(el, child, dict)
    })
    parent.append(el)
  }
}

function tokenText(token, dict) {
  if (token.type === 'node') {
    const name = translate(dict, `landing.tech.nodes.${token.id}`)
    if (!token.suffix) return name
    return `${name} ${translate(dict, `landing.tech.suffix.${token.suffix}`)}`
  }
  if (token.type === 'joiner') return translate(dict, `landing.tech.${token.id}`)
  if (token.type === 'arrow') return translate(dict, 'landing.tech.arrow')
  if (token.type === 'group') {
    return token.nodes.map((child, index) => {
      const piece = tokenText(child, dict)
      return index === 0 ? piece : `${translate(dict, `landing.tech.${token.joiner}`)} ${piece}`
    }).join(' ')
  }
  return ''
}

export function applyTranslations(root, dict) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = translate(dict, el.getAttribute('data-i18n'))
  })
  root.querySelectorAll('[data-i18n-alt]').forEach(el => {
    el.alt = translate(dict, el.getAttribute('data-i18n-alt'))
  })
  root.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', translate(dict, el.getAttribute('data-i18n-aria')))
  })
  root.querySelectorAll('[data-i18n-content]').forEach(el => {
    el.setAttribute('content', translate(dict, el.getAttribute('data-i18n-content')))
  })
  const title = translate(dict, 'landing.meta.title')
  const doc = root.nodeType === 9 ? root : root.ownerDocument
  if (title && doc) {
    const titleEl = doc.querySelector('title')
    if (titleEl) titleEl.textContent = title
  }
}

export function renderFeatures(container, dict) {
  if (!container) return
  container.replaceChildren()
  FEATURE_IDS.forEach(id => {
    const article = document.createElement('article')
    article.className = 'hud-panel feature-card'
    const title = document.createElement('h3')
    title.textContent = translate(dict, `landing.features.items.${id}.title`)
    const body = document.createElement('p')
    body.textContent = translate(dict, `landing.features.items.${id}.body`)
    article.append(title, body)
    container.append(article)
  })
}

export function renderAssets(container, dict) {
  if (!container) return
  container.replaceChildren()
  ASSET_IDS.forEach(id => {
    const article = document.createElement('article')
    article.className = 'asset-card'
    const title = document.createElement('h3')
    title.textContent = translate(dict, `landing.assets.${id}.title`)
    const body = document.createElement('p')
    body.textContent = translate(dict, `landing.assets.${id}.body`)
    article.append(title, body)
    container.append(article)
  })
}

export function renderTechTree(container, dict) {
  if (!container) return
  container.replaceChildren()
  TECH_TREE.forEach(section => {
    const block = document.createElement('section')
    block.className = 'tech-section'
    const title = document.createElement('h3')
    title.textContent = translate(dict, section.titleKey)
    const lead = document.createElement('p')
    lead.textContent = translate(dict, section.leadKey)
    const tree = document.createElement('div')
    tree.className = 'tech-tree'
    tree.setAttribute('role', 'list')
    section.rows.forEach(rowTokens => {
      const row = document.createElement('div')
      row.className = 'tech-row'
      row.setAttribute('role', 'listitem')
      rowTokens.forEach(token => appendToken(row, token, dict))
      row.setAttribute('aria-label', rowTokens.map(token => tokenText(token, dict)).join(' '))
      tree.append(row)
    })
    block.append(title, lead, tree)
    container.append(block)
  })
}

export function applyLocaleChrome(root, locale) {
  const normalized = locale === 'de' ? 'de' : 'en'
  root.querySelectorAll('[data-locale-link]').forEach(link => {
    const active = link.getAttribute('data-locale-link') === normalized
    if (active) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  const hrefs = LEGAL_HREFS[normalized]
  root.querySelectorAll('[data-legal-link]').forEach(link => {
    const key = link.getAttribute('data-legal-link')
    if (hrefs[key]) link.href = hrefs[key]
  })
  root.querySelectorAll('[data-play-link]').forEach(link => {
    link.href = '/'
  })
}

export async function bootLandingPage(doc = document, storage) {
  const locale = doc.body?.dataset?.landingLocale === 'de' ? 'de' : 'en'
  rememberLandingLocale(locale, storage || (typeof localStorage !== 'undefined' ? localStorage : null))
  const dict = await loadLandingDictionary(locale)
  applyTranslations(doc, dict)
  renderFeatures(doc.querySelector('[data-landing-features]'), dict)
  renderAssets(doc.querySelector('[data-landing-assets]'), dict)
  renderTechTree(doc.querySelector('[data-landing-tech]'), dict)
  applyLocaleChrome(doc, locale)
  return dict
}

const isLandingDocument = typeof document !== 'undefined' && document.body?.dataset?.landingPage === 'true'

if (isLandingDocument) {
  bootLandingPage(document)
}
