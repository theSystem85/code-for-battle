import { resolveLandingLocale } from '../landing/landingLocale.js'
import en from './locales/en.json' with { type: 'json' }
import de from './locales/de.json' with { type: 'json' }

const DICTIONARIES = { en, de }

function lookup(dict, key) {
  const value = String(key || '').split('.').reduce((current, part) => {
    if (!current || typeof current !== 'object') return undefined
    return current[part]
  }, dict)
  return typeof value === 'string' ? value : ''
}

export function resolveUiLocale(env = {}) {
  const storage = Object.prototype.hasOwnProperty.call(env, 'storage')
    ? env.storage
    : (typeof localStorage !== 'undefined' ? localStorage : null)
  const languages = Object.prototype.hasOwnProperty.call(env, 'languages')
    ? env.languages
    : (typeof navigator !== 'undefined' ? navigator.languages : ['en'])
  return resolveLandingLocale({ storage, languages })
}

export function uiText(key, locale = resolveUiLocale()) {
  const primary = DICTIONARIES[locale] || DICTIONARIES.en
  return lookup(primary, key) || lookup(DICTIONARIES.en, key)
}
