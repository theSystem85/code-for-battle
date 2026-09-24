import { landingPath, loadLandingDictionary, resolveLandingLocale, translate } from './landingLocale.js'

export async function mountSidebarLandingLink(anchor, { storage, languages } = {}) {
  if (!anchor) return null
  const locale = resolveLandingLocale({
    storage: storage || (typeof localStorage !== 'undefined' ? localStorage : null),
    languages: languages || (typeof navigator !== 'undefined' ? navigator.languages : ['en'])
  })
  const dict = await loadLandingDictionary(locale)
  anchor.href = landingPath(locale)
  anchor.textContent = translate(dict, 'landing.nav.sidebar')
  anchor.lang = locale
  anchor.setAttribute('hreflang', locale)
  return locale
}

const sidebarAnchor = typeof document !== 'undefined'
  ? document.getElementById('sidebarLandingLink')
  : null

if (sidebarAnchor) {
  mountSidebarLandingLink(sidebarAnchor)
}
