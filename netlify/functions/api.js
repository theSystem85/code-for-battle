import { getStore } from '@netlify/blobs'
import { countCandidateSummaries, safeAlias, summarizeIceCandidate } from '../../src/network/iceSummary.js'
import { buildIceServerPayload } from '../../src/network/turnCredentials.js'

// Session storage using Netlify Blobs
// Uses separate keys for offer, answer, and candidates to avoid race conditions
const STORE_NAME = 'signalling-sessions'

async function getSessionStore() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong'
  })
}

async function getBlob(store, key) {
  try {
    const data = await store.get(key, { type: 'json' })
    return data || null
  } catch {
    return null
  }
}

async function setBlob(store, key, value) {
  await store.setJSON(key, value)
}

function readFunctionEnv(name) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function') {
      const value = Netlify.env.get(name)
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  } catch {
    // Netlify.env.get throws when a key was never configured.
  }
  return ''
}

function logSignalling(event, fields) {
  console.log(JSON.stringify({
    scope: 'signalling',
    event,
    ...fields
  }))
}

function getPendingLogCache() {
  if (!getPendingLogCache.cache) getPendingLogCache.cache = new Map()
  return getPendingLogCache.cache
}

function candidatePrefix(inviteToken, peerId) {
  return `cand:${inviteToken}:${peerId}:`
}

async function listCandidateRecords(store, inviteToken, peerId) {
  const records = []
  const prefix = candidatePrefix(inviteToken, peerId)
  try {
    const page = await store.list({ prefix })
    const blobs = page?.blobs || []
    for (const blob of blobs) {
      const data = await getBlob(store, blob.key)
      if (data?.candidate) records.push(data)
    }
  } catch (err) {
    logSignalling('candidate.list_failed', { message: err?.message || 'list failed' })
  }

  const legacy = await getBlob(store, `candidates:${inviteToken}:${peerId}`)
  if (Array.isArray(legacy?.candidates)) {
    records.push(...legacy.candidates)
  }
  records.sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0))
  return records
}

function loadTurnEnv() {
  return {
    TURN_URLS: readFunctionEnv('TURN_URLS'),
    TURN_SECRET: readFunctionEnv('TURN_SECRET'),
    TURN_USERNAME: readFunctionEnv('TURN_USERNAME'),
    TURN_CREDENTIAL: readFunctionEnv('TURN_CREDENTIAL')
  }
}

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache'
}

// Main handler using Netlify Functions v2 format
export default async(request, _context) => {
  const url = new URL(request.url)
  let path = url.pathname

  // Normalize path - remove function path prefixes
  if (path.startsWith('/.netlify/functions/api')) {
    path = path.replace('/.netlify/functions/api', '')
  }
  if (path.startsWith('/api')) {
    path = path.replace(/^\/api/, '')
  }
  if (!path.startsWith('/')) {
    path = '/' + path
  }

  const method = request.method

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const store = await getSessionStore()

    // POST /signalling/offer
    if (path === '/signalling/offer' && method === 'POST') {
      const { inviteToken, alias, peerId, offer, offerRevision: offerRevisionRaw } = await request.json()

      if (!inviteToken || !peerId || !offer || !alias) {
        return new Response(
          JSON.stringify({ error: 'inviteToken, alias, peerId, and offer are required' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // Store offer in its own key (won't conflict with answer or candidates)
      const offerKeyName = `offer:${inviteToken}:${peerId}`
      const offerRevision = Number.isFinite(Number(offerRevisionRaw)) ? Number(offerRevisionRaw) : null
      await setBlob(store, offerKeyName, {
        offer,
        alias,
        offerRevision,
        createdAt: Date.now()
      })
      logSignalling('offer', {
        alias: safeAlias(alias),
        peerId,
        inviteSuffix: String(inviteToken).slice(-8),
        offerRevision,
        bytes: typeof offer === 'string' ? offer.length : 0
      })

      // Also store metadata to help with listing
      const metaKeyName = `meta:${inviteToken}:${peerId}`
      await setBlob(store, metaKeyName, { inviteToken, peerId, alias, createdAt: Date.now() })

      // Maintain an index of peerIds for this inviteToken (avoids relying on list prefix search)
      const indexKeyName = `index:${inviteToken}`
      let indexData = await getBlob(store, indexKeyName)
      if (!indexData) {
        indexData = { peerIds: [] }
      }
      if (!indexData.peerIds.includes(peerId)) {
        indexData.peerIds.push(peerId)
        await setBlob(store, indexKeyName, indexData)
      }

      return new Response(
        JSON.stringify({ message: 'offer stored' }),
        { status: 200, headers: corsHeaders }
      )
    }

    // POST /signalling/answer
    if (path === '/signalling/answer' && method === 'POST') {
      const { inviteToken, peerId, answer, offerRevision } = await request.json()

      if (!inviteToken || !peerId || !answer) {
        return new Response(
          JSON.stringify({ error: 'inviteToken, peerId, and answer are required' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // Store answer in its own key (completely independent, no race condition)
      const answerKeyName = `answer:${inviteToken}:${peerId}`
      const revision = Number.isFinite(Number(offerRevision)) ? Number(offerRevision) : null
      await setBlob(store, answerKeyName, { answer, offerRevision: revision, createdAt: Date.now() })
      logSignalling('answer', {
        peerId,
        inviteSuffix: String(inviteToken).slice(-8),
        offerRevision: revision,
        bytes: typeof answer === 'string' ? answer.length : 0
      })

      return new Response(
        JSON.stringify({ message: 'answer stored' }),
        { status: 200, headers: corsHeaders }
      )
    }

    // POST /signalling/candidate
    if (path === '/signalling/candidate' && method === 'POST') {
      const { inviteToken, peerId, candidate, origin, alias } = await request.json()

      if (!inviteToken || !peerId || !candidate) {
        return new Response(
          JSON.stringify({ error: 'inviteToken, peerId, and candidate are required' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // One blob per candidate so concurrent host/client posts cannot overwrite each other.
      const summary = summarizeIceCandidate(candidate)
      const record = {
        candidate,
        origin: origin || 'peer',
        timestamp: Date.now(),
        summary: {
          type: summary.type,
          protocol: summary.protocol,
          mdns: summary.mdns,
          privateOrLoopback: summary.privateOrLoopback
        }
      }
      const candidateId = `${record.timestamp.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      await setBlob(store, `${candidatePrefix(inviteToken, peerId)}${candidateId}`, record)
      logSignalling('candidate', {
        alias: safeAlias(alias),
        peerId,
        inviteSuffix: String(inviteToken).slice(-8),
        origin: record.origin,
        type: summary.type,
        protocol: summary.protocol,
        mdns: summary.mdns,
        privateOrLoopback: summary.privateOrLoopback
      })

      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // GET /signalling/pending/:inviteToken
    const pendingMatch = path.match(/^\/signalling\/pending\/([^/]+)$/)
    if (pendingMatch && method === 'GET') {
      const inviteToken = decodeURIComponent(pendingMatch[1])

      // Use the index to find peerIds (more reliable than prefix listing)
      const indexKeyName = `index:${inviteToken}`
      const indexData = await getBlob(store, indexKeyName)

      // Return empty array with 200 if no sessions (avoids browser console 404 errors)
      if (!indexData || !indexData.peerIds || !indexData.peerIds.length) {
        return new Response(
          JSON.stringify([]),
          { status: 200, headers: corsHeaders }
        )
      }

      const sessions = []
      for (const peerId of indexData.peerIds) {
        // Fetch offer, answer, and candidates from their separate keys
        const offerData = await getBlob(store, `offer:${inviteToken}:${peerId}`)
        const answerData = await getBlob(store, `answer:${inviteToken}:${peerId}`)
        const candidates = await listCandidateRecords(store, inviteToken, peerId)
        const metaData = await getBlob(store, `meta:${inviteToken}:${peerId}`)

        sessions.push({
          peerId,
          alias: metaData?.alias || offerData?.alias || 'Unknown',
          offer: offerData?.offer || null,
          offerRevision: offerData?.offerRevision || null,
          answer: answerData?.answer || null,
          answerRevision: answerData?.offerRevision || null,
          candidates,
          connectionState: answerData?.answer ? 'connected' : 'pending'
        })
      }

      const pendingSignature = sessions.map((session) => [
        session.peerId,
        session.alias,
        Boolean(session.answer),
        session.offerRevision,
        session.answerRevision,
        session.candidates.length
      ].join(':')).join('|')
      const pendingCache = getPendingLogCache()
      if (pendingCache.get(inviteToken) !== pendingSignature) {
        pendingCache.set(inviteToken, pendingSignature)
        logSignalling('pending', {
          inviteSuffix: String(inviteToken).slice(-8),
          sessions: sessions.map((session) => ({
            alias: safeAlias(session.alias),
            peerId: session.peerId,
            hasOffer: Boolean(session.offer),
            hasAnswer: Boolean(session.answer),
            offerRevision: session.offerRevision,
            answerRevision: session.answerRevision,
            candidates: countCandidateSummaries(session.candidates)
          }))
        })
      }

      return new Response(
        JSON.stringify(sessions),
        { status: 200, headers: corsHeaders }
      )
    }

    // GET /signalling/session/:inviteToken/:peerId
    const sessionMatch = path.match(/^\/signalling\/session\/([^/]+)\/([^/]+)$/)
    if (sessionMatch && method === 'GET') {
      const inviteToken = decodeURIComponent(sessionMatch[1])
      const peerId = decodeURIComponent(sessionMatch[2])

      // Fetch from separate keys
      const offerData = await getBlob(store, `offer:${inviteToken}:${peerId}`)
      const answerData = await getBlob(store, `answer:${inviteToken}:${peerId}`)
      const candidates = await listCandidateRecords(store, inviteToken, peerId)

      // Session exists if we have either an offer or candidates
      if (!offerData && !candidates.length) {
        return new Response(
          JSON.stringify({ error: 'session not found' }),
          { status: 404, headers: corsHeaders }
        )
      }

      return new Response(
        JSON.stringify({
          offer: offerData?.offer || null,
          offerRevision: offerData?.offerRevision || null,
          answer: answerData?.answer || null,
          answerRevision: answerData?.offerRevision || null,
          candidates
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // POST /game-instance/:instanceId/invite-regenerate
    const regenerateMatch = path.match(/^\/game-instance\/([^/]+)\/invite-regenerate$/)
    if (regenerateMatch && method === 'POST') {
      const instanceId = decodeURIComponent(regenerateMatch[1])
      const { partyId } = await request.json()

      if (!partyId) {
        return new Response(
          JSON.stringify({ error: 'partyId is required' }),
          { status: 400, headers: corsHeaders }
        )
      }

      const inviteToken = `${instanceId}-${partyId}-${Date.now()}`
      return new Response(
        JSON.stringify({ inviteToken }),
        { status: 200, headers: corsHeaders }
      )
    }

    if (path === '/signalling/ice-servers' && method === 'GET') {
      const payload = buildIceServerPayload(loadTurnEnv())
      logSignalling('ice-servers', {
        turnConfigured: payload.turnConfigured,
        credentialMode: payload.credentialMode,
        ttlSeconds: payload.ttlSeconds,
        turnHosts: payload.turnHosts
      })
      return new Response(JSON.stringify(payload), { status: 200, headers: corsHeaders })
    }

    // 404 for unmatched routes
    return new Response(
      JSON.stringify({ error: 'Not found', path }),
      { status: 404, headers: corsHeaders }
    )

  } catch (error) {
    console.error('API error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: corsHeaders }
    )
  }
}

// Note: Routing is handled via netlify.toml redirects
// The redirect forwards /api/* to /.netlify/functions/api
