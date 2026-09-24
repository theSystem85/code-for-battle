import { landingPath, resolveLandingLocale } from './landingLocale.js'

export function landingRedirectTarget({ storage, languages, pathname } = {}) {
  const locale = resolveLandingLocale({ storage, languages })
  const target = landingPath(locale)
  const current = String(pathname || '')
  if (current === target || current === `${target}/`) return null
  return target
}

const isRedirectDocument = typeof document !== 'undefined' && document.body?.dataset?.landingRedirect === 'true'

if (isRedirectDocument && typeof window !== 'undefined') {
  const target = landingRedirectTarget({
    storage: localStorage,
    languages: navigator.languages,
    pathname: window.location.pathname
  })
  if (target) window.location.replace(target)
}
