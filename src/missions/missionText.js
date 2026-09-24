import { resolveLandingLocale } from '../landing/landingLocale.js'
import en from './locales/en.json' with { type: 'json' }
import de from './locales/de.json' with { type: 'json' }

const DICTIONARIES = {
  en,
  de
}

export const MISSION_01_OBJECTIVE_KEYS = Object.freeze([
  'missions.mission01.objectives.power',
  'missions.mission01.objectives.economy',
  'missions.mission01.objectives.fight'
])

function lookup(dict, key) {
  const value = String(key || '').split('.').reduce((current, part) => {
    if (!current || typeof current !== 'object') return undefined
    return current[part]
  }, dict)
  return typeof value === 'string' ? value : ''
}

export function resolveMissionLocale(env = {}) {
  const storage = Object.prototype.hasOwnProperty.call(env, 'storage')
    ? env.storage
    : (typeof localStorage !== 'undefined' ? localStorage : null)
  const languages = Object.prototype.hasOwnProperty.call(env, 'languages')
    ? env.languages
    : (typeof navigator !== 'undefined' ? navigator.languages : ['en'])
  return resolveLandingLocale({ storage, languages })
}

export function missionText(key, locale = resolveMissionLocale()) {
  const primary = DICTIONARIES[locale] || DICTIONARIES.en
  return lookup(primary, key) || lookup(DICTIONARIES.en, key)
}

export function localizeMission(mission, locale = resolveMissionLocale()) {
  if (!mission || typeof mission !== 'object') return mission
  const label = mission.labelKey ? missionText(mission.labelKey, locale) : ''
  const description = mission.descriptionKey ? missionText(mission.descriptionKey, locale) : ''
  const objectives = Array.isArray(mission.objectiveKeys)
    ? mission.objectiveKeys.map(key => missionText(key, locale)).filter(Boolean)
    : []
  return {
    label: label || mission.label || '',
    description: description || mission.description || '',
    objectives
  }
}
