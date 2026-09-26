import { landingPath, loadLandingDictionary, resolveLandingLocale, translate } from './landingLocale.js'

export const GITHUB_REPO_URL = 'https://github.com/theSystem85/code-for-battle'

function localeContext(storage, languages) {
  return {
    storage: storage || (typeof localStorage !== 'undefined' ? localStorage : null),
    languages: languages || (typeof navigator !== 'undefined' ? navigator.languages : ['en'])
  }
}

async function messagesFor({ storage, languages, locale, dict }) {
  const resolved = locale || resolveLandingLocale(localeContext(storage, languages))
  const messages = dict || await loadLandingDictionary(resolved)
  return { resolved, messages }
}

export async function mountSidebarLandingLink(anchor, options = {}) {
  if (!anchor) return null
  const { resolved, messages } = await messagesFor(options)
  anchor.href = landingPath(resolved)
  anchor.textContent = translate(messages, 'landing.nav.sidebar')
  anchor.lang = resolved
  anchor.setAttribute('hreflang', resolved)
  return resolved
}

export async function mountSidebarGithubLink(anchor, options = {}) {
  if (!anchor) return null
  const { resolved, messages } = await messagesFor(options)
  anchor.href = GITHUB_REPO_URL
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.textContent = translate(messages, 'landing.nav.githubShort')
  anchor.lang = resolved
  return resolved
}

const sidebarAnchor = typeof document !== 'undefined'
  ? document.getElementById('sidebarLandingLink')
  : null

const sidebarGithubAnchor = typeof document !== 'undefined'
  ? document.getElementById('sidebarGithubLink')
  : null

if (sidebarAnchor || sidebarGithubAnchor) {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null
  const languages = typeof navigator !== 'undefined' ? navigator.languages : ['en']
  const locale = resolveLandingLocale({ storage, languages })
  loadLandingDictionary(locale).then(dict => {
    if (sidebarAnchor) mountSidebarLandingLink(sidebarAnchor, { locale, dict })
    if (sidebarGithubAnchor) mountSidebarGithubLink(sidebarGithubAnchor, { locale, dict })
  })
}
