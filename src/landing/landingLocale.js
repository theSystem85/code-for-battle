export const LANDING_LOCALE_STORAGE_KEY = 'cfb-landing-locale'
export const LANDING_LOCALES = ['en', 'de']

export function landingPath(locale) {
  return locale === 'de' ? '/de/landing' : '/en/landing'
}

export function normalizeLandingLocale(value) {
  const base = String(value || '').toLowerCase().split('-')[0]
  return LANDING_LOCALES.includes(base) ? base : null
}

export function readStoredLandingLocale(storage) {
  if (!storage) return null
  try {
    return normalizeLandingLocale(storage.getItem(LANDING_LOCALE_STORAGE_KEY))
  } catch {
    return null
  }
}

export function rememberLandingLocale(locale, storage) {
  const normalized = normalizeLandingLocale(locale)
  if (!normalized || !storage) return
  try {
    storage.setItem(LANDING_LOCALE_STORAGE_KEY, normalized)
  } catch {
    // Private mode and disabled storage still leave the explicit URL working.
  }
}

export function detectNavigatorLandingLocale(languages) {
  const list = Array.isArray(languages) ? languages : []
  for (const language of list) {
    const locale = normalizeLandingLocale(language)
    if (locale) return locale
  }
  return 'en'
}

export function resolveLandingLocale({ storage, languages } = {}) {
  return readStoredLandingLocale(storage) || detectNavigatorLandingLocale(languages)
}

export function translate(dict, key) {
  const value = String(key || '').split('.').reduce((current, part) => {
    if (!current || typeof current !== 'object') return undefined
    return current[part]
  }, dict)
  return typeof value === 'string' ? value : ''
}

export async function loadLandingDictionary(locale) {
  if (locale === 'de') {
    const module = await import('./locales/de.json')
    return module.default
  }
  const module = await import('./locales/en.json')
  return module.default
}

export function collectMessageKeys(dict, prefix = '') {
  if (!dict || typeof dict !== 'object') return []
  return Object.entries(dict).flatMap(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') return collectMessageKeys(value, next)
    return [next]
  })
}
