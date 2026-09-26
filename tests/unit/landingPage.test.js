import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import de from '../../src/landing/locales/de.json'
import en from '../../src/landing/locales/en.json'
import { ASSET_IDS, FEATURE_IDS, collectTechNodeIds } from '../../src/landing/landingContent.js'
import {
  applyLocaleChrome,
  applyTranslations,
  mountLandingBackdrop,
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
import { GITHUB_REPO_URL, mountSidebarGithubLink, mountSidebarLandingLink } from '../../src/landing/sidebarLink.js'

const indexHtml = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')
const landingCss = readFileSync(path.join(process.cwd(), 'src/landing/landing.css'), 'utf8')
const landingEn = readFileSync(path.join(process.cwd(), 'src/landing/en.html'), 'utf8')
const landingDe = readFileSync(path.join(process.cwd(), 'src/landing/de.html'), 'utf8')

function expectGithubPlacement(html) {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
  const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'))
  const headerGithub = header.indexOf('class="landing-github"')
  expect(header.indexOf('landing.nav.gallery')).toBeLessThan(header.indexOf('landing.nav.features'))
  expect(header.indexOf('landing-lang')).toBeLessThan(headerGithub)
  expect(headerGithub).toBeLessThan(header.indexOf('landing.nav.play'))
  expect(header).toContain(`href="${GITHUB_REPO_URL}"`)
  expect(header).toContain('target="_blank"')
  expect(header).toContain('rel="noopener noreferrer"')
  expect(header).toContain('<svg')
  expect(header).toContain('data-i18n="landing.nav.github"')

  const imprint = footer.indexOf('landing.footer.imprint')
  const privacy = footer.indexOf('landing.footer.privacy')
  const contact = footer.indexOf('landing.footer.contact')
  const manual = footer.indexOf('landing.nav.manual')
  const play = footer.indexOf('landing.footer.play')
  const footerGithub = footer.indexOf('landing-github--footer')
  expect(imprint).toBeLessThan(privacy)
  expect(privacy).toBeLessThan(contact)
  expect(contact).toBeLessThan(manual)
  expect(manual).toBeLessThan(play)
  expect(play).toBeLessThan(footerGithub)
  expect(footer).toContain(`href="${GITHUB_REPO_URL}"`)
  expect(footer).toContain('target="_blank"')
  expect(footer).toContain('rel="noopener noreferrer"')
  expect(footer).toContain('<svg')
}

describe('landing locales', () => {
  it('keeps English and German message keys aligned and filled', () => {
    const enKeys = collectMessageKeys(en).sort()
    const deKeys = collectMessageKeys(de).sort()
    expect(deKeys).toEqual(enKeys)
    enKeys.forEach(key => {
      expect(translate(en, key).trim().length).toBeGreaterThan(0)
      expect(translate(de, key).trim().length).toBeGreaterThan(0)
    })
    expect(translate(en, 'landing.nav.github')).toBe('View on GitHub')
    expect(translate(de, 'landing.nav.github')).toBe('Auf GitHub ansehen')
    expect(translate(en, 'landing.nav.githubShort')).toBe('GitHub')
    expect(translate(de, 'landing.nav.githubShort')).toBe('GitHub')
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

  it('keeps the GitHub mark when filling the link label', () => {
    document.body.innerHTML = `
      <a class="landing-github" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">
        <svg class="landing-github__mark" aria-hidden="true"></svg>
        <span data-i18n="landing.nav.github"></span>
      </a>
    `
    applyTranslations(document, en)
    const link = document.querySelector('.landing-github')
    expect(link.querySelector('svg')).not.toBeNull()
    expect(link.querySelector('span').textContent).toBe('View on GitHub')
    expect(link.getAttribute('href')).toBe(GITHUB_REPO_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('places the repository link on the English and German landing pages', () => {
    expectGithubPlacement(landingEn)
    expectGithubPlacement(landingDe)
  })
})

describe('landing backdrop', () => {
  it('parallax follows scroll and stays still when motion is reduced', () => {
    document.body.innerHTML = '<div class="landing-backdrop__shift"></div>'
    const frames = []
    const listeners = {}
    const win = {
      scrollY: 400,
      innerHeight: 800,
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame(callback) {
        frames.push(callback)
        return frames.length
      },
      cancelAnimationFrame() {},
      addEventListener(name, fn) { listeners[name] = fn },
      removeEventListener() {}
    }
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2400 })
    const stop = mountLandingBackdrop(document, win)
    expect(document.querySelector('.landing-backdrop__shift').style.transform).toContain('translate3d')
    listeners.scroll()
    expect(frames.length).toBe(1)
    frames[0]()
    expect(document.querySelector('.landing-backdrop__shift').style.transform).toContain('translate3d')
    stop()

    document.querySelector('.landing-backdrop__shift').style.transform = ''
    const still = mountLandingBackdrop(document, {
      ...win,
      matchMedia: () => ({ matches: true }),
      addEventListener() { throw new Error('should not listen') }
    })
    expect(document.querySelector('.landing-backdrop__shift').style.transform).toBe('')
    still()
  })

  it('keeps the header outside the parallax layer and overscans the backdrop', () => {
    expect(landingCss).toMatch(/html\s*\{[^}]*scroll-behavior:\s*auto/)
    expect(landingCss).toMatch(/\.landing-backdrop__shift\s*\{[^}]*top:\s*-32%/)
    expect(landingCss).toMatch(/\.landing-bar\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/)
    expect(landingEn.indexOf('landing-backdrop')).toBeLessThan(landingEn.indexOf('class="landing-bar"'))
    expect(landingEn).toContain('shot--desktop')
    expect(landingEn).toContain('shot--landscape')
    expect(landingEn).toContain('shot--portrait')
    const header = landingEn.slice(landingEn.indexOf('<header'), landingEn.indexOf('</header>'))
    expect(header).not.toContain('landing-backdrop')
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

  it('places GitHub after Privacy and opens the repository in a new tab', async() => {
    const privacyAt = indexHtml.indexOf('href="/privacy"')
    const githubAt = indexHtml.indexOf('id="sidebarGithubLink"')
    const landingAt = indexHtml.indexOf('id="sidebarLandingLink"')
    expect(privacyAt).toBeGreaterThan(-1)
    expect(githubAt).toBeGreaterThan(privacyAt)
    expect(landingAt).toBeGreaterThan(githubAt)
    const githubTag = indexHtml.slice(githubAt, githubAt + 180)
    expect(githubTag).toContain(`href="${GITHUB_REPO_URL}"`)
    expect(githubTag).toContain('target="_blank"')
    expect(githubTag).toContain('rel="noopener noreferrer"')

    document.body.innerHTML = `<a id="sidebarGithubLink" href="${GITHUB_REPO_URL}">GitHub</a>`
    const locale = await mountSidebarGithubLink(document.getElementById('sidebarGithubLink'), {
      storage: { getItem: () => 'de' },
      languages: ['en']
    })
    const link = document.getElementById('sidebarGithubLink')
    expect(locale).toBe('de')
    expect(link.textContent).toBe(translate(de, 'landing.nav.githubShort'))
    expect(link.getAttribute('href')).toBe(GITHUB_REPO_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.lang).toBe('de')
  })
})
