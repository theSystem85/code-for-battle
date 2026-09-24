import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import de from '../../src/landing/locales/de.json'
import en from '../../src/landing/locales/en.json'
import { ASSET_IDS, FEATURE_IDS, collectTechNodeIds } from '../../src/landing/landingContent.js'
import {
  applyLocaleChrome,
  applyTranslations,
  renderAssets,
  renderFeatures,
  renderTechTree
} from '../../src/landing/landingPage.js'
import {
  collectMessageKeys,
  detectNavigatorLandingLocale,
  landingPath,
  resolveLandingLocale,
  translate
} from '../../src/landing/landingLocale.js'
import { landingRedirectTarget } from '../../src/landing/redirect.js'
import { rewriteLandingUrl } from '../../src/landing/routes.js'
import { mountSidebarLandingLink } from '../../src/landing/sidebarLink.js'

const indexHtml = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')

describe('landing locales', () => {
  it('keeps English and German message keys aligned and filled', () => {
    const enKeys = collectMessageKeys(en).sort()
    const deKeys = collectMessageKeys(de).sort()
    expect(deKeys).toEqual(enKeys)
    enKeys.forEach(key => {
      expect(translate(en, key).trim().length).toBeGreaterThan(0)
      expect(translate(de, key).trim().length).toBeGreaterThan(0)
    })
  })

  it('names every tech node, feature, and asset kind in both locales', () => {
    collectTechNodeIds().forEach(id => {
      expect(translate(en, `landing.tech.nodes.${id}`)).not.toBe('')
      expect(translate(de, `landing.tech.nodes.${id}`)).not.toBe('')
    })
    FEATURE_IDS.forEach(id => {
      expect(translate(en, `landing.features.items.${id}.title`)).not.toBe('')
      expect(translate(de, `landing.features.items.${id}.body`)).not.toBe('')
    })
    ASSET_IDS.forEach(id => {
      expect(translate(en, `landing.assets.${id}.title`)).not.toBe('')
      expect(translate(de, `landing.assets.${id}.body`)).not.toBe('')
    })
  })
})

describe('landing locale selection', () => {
  it('prefers a stored choice, then the browser list, then English', () => {
    const storage = {
      value: 'de',
      getItem() { return this.value }
    }
    expect(resolveLandingLocale({ storage, languages: ['en-US'] })).toBe('de')
    expect(detectNavigatorLandingLocale(['fr-FR', 'de-AT', 'en'])).toBe('de')
    expect(detectNavigatorLandingLocale(['en-GB'])).toBe('en')
    expect(detectNavigatorLandingLocale(['fr'])).toBe('en')
    expect(detectNavigatorLandingLocale([])).toBe('en')
  })

  it('maps locales to stable paths and redirects /landing', () => {
    expect(landingPath('de')).toBe('/de/landing')
    expect(landingPath('en')).toBe('/en/landing')
    expect(landingRedirectTarget({
      languages: ['de'],
      pathname: '/landing'
    })).toBe('/de/landing')
    expect(landingRedirectTarget({
      languages: ['de'],
      pathname: '/de/landing'
    })).toBeNull()
    expect(rewriteLandingUrl('/en/landing?x=1', 'dev')).toBe('/src/landing/en.html?x=1')
    expect(rewriteLandingUrl('/de/landing/', 'preview')).toBe('/de/landing.html')
    expect(rewriteLandingUrl('/landing', 'dev')).toBe('/src/landing/index.html')
  })
})

describe('landing rendering', () => {
  it('fills visible copy from keys and renders the tech tree', () => {
    document.body.innerHTML = `
      <h1 data-i18n="landing.hero.title"></h1>
      <a data-locale-link="de" href="/de/landing"></a>
      <a data-legal-link="privacy" href="/privacy"></a>
      <div data-landing-features></div>
      <div data-landing-assets></div>
      <div data-landing-tech></div>
    `
    applyTranslations(document, de)
    renderFeatures(document.querySelector('[data-landing-features]'), de)
    renderAssets(document.querySelector('[data-landing-assets]'), de)
    renderTechTree(document.querySelector('[data-landing-tech]'), de)
    applyLocaleChrome(document, 'de')

    expect(document.querySelector('h1').textContent).toBe('Code for Battle')
    expect(document.querySelector('[data-legal-link="privacy"]').getAttribute('href')).toBe('/datenschutz')
    expect(document.querySelector('[data-locale-link="de"]').getAttribute('aria-current')).toBe('page')
    expect(document.querySelectorAll('.feature-card')).toHaveLength(FEATURE_IDS.length)
    expect(document.querySelectorAll('.asset-card')).toHaveLength(ASSET_IDS.length)
    expect(document.querySelector('[data-landing-tech]').textContent).toContain('Werft')
    expect(document.querySelector('[data-landing-tech]').textContent).toContain('Schlachtschiff')
    expect(document.body.textContent).not.toContain('landing.')
  })
})

describe('sidebar landing link', () => {
  it('places the link after Privacy and points it at the active locale', async() => {
    const privacyAt = indexHtml.indexOf('href="/privacy"')
    const landingAt = indexHtml.indexOf('id="sidebarLandingLink"')
    expect(privacyAt).toBeGreaterThan(-1)
    expect(landingAt).toBeGreaterThan(privacyAt)

    document.body.innerHTML = '<a id="sidebarLandingLink" href="/landing"></a>'
    const locale = await mountSidebarLandingLink(document.getElementById('sidebarLandingLink'), {
      storage: { getItem: () => 'de' },
      languages: ['en']
    })
    const link = document.getElementById('sidebarLandingLink')
    expect(locale).toBe('de')
    expect(link.getAttribute('href')).toBe('/de/landing')
    expect(link.textContent).toBe(translate(de, 'landing.nav.sidebar'))
  })
})
