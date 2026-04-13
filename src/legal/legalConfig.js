import exampleLegalConfig from './legalConfig.example.json'

const DEFAULT_LEGAL_CONFIG = {
  fullName: '',
  businessName: '',
  addressLine1: '',
  street: '',
  houseNumber: '',
  postalCode: '',
  city: '',
  country: '',
  email: '',
  phone: '',
  contactFormUrl: '',
  website: '',
  vatId: '',
  responsiblePerson: '',
  privacyEmail: '',
  representative: '',
  hostingProviderName: 'Netlify, Inc.',
  hostingProviderAddress: '44 Montgomery Street, Suite 300, San Francisco, CA 94104, USA',
  lastUpdatedDe: '30.03.2026',
  lastUpdatedEn: '2026-03-30'
}

function sanitizeConfig(config = {}) {
  return Object.keys(DEFAULT_LEGAL_CONFIG).reduce((acc, key) => {
    const value = config[key]
    acc[key] = typeof value === 'string' ? value.trim() : DEFAULT_LEGAL_CONFIG[key]
    return acc
  }, { ...DEFAULT_LEGAL_CONFIG })
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`)
  }
  return response.json()
}

export async function loadLegalConfig() {
  try {
    const localConfig = await fetchJson('/impressum.config.json')
    return sanitizeConfig(localConfig)
  } catch {
    return sanitizeConfig(exampleLegalConfig)
  }
}
