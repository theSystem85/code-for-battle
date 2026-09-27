import { STUN_HOST } from './signalling.js'

export function statsEndpoint(path, stunHost = STUN_HOST) {
  const base = stunHost ? String(stunHost).replace(/\/$/, '') : '/api'
  return `${base}${path}`
}

export async function postStats(path, body, fetchImpl = fetch) {
  const response = await fetchImpl(statsEndpoint(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const error = new Error('stats request failed')
    error.status = response.status
    throw error
  }
  return response.json()
}
