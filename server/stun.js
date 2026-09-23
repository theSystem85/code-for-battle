import express from 'express'

import cors from 'cors'
import { summarizeIceCandidate } from '../src/network/iceSummary.js'
import { buildIceServerPayload } from '../src/network/turnCredentials.js'

const PORT = process.env.STUN_PORT ?? 3333
const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

const sessions = new Map()

const sessionKey = (inviteToken, peerId) => `${inviteToken}-${peerId}`

app.post('/signalling/offer', (req, res) => {
  const { inviteToken, alias, peerId, offer } = req.body
  if (!inviteToken || !peerId || !offer || !alias) {
    return res.status(400).json({ error: 'inviteToken, alias, peerId, and offer are required' })
  }

  const offerRevision = Number.isFinite(Number(req.body.offerRevision)) ? Number(req.body.offerRevision) : null
  sessions.set(sessionKey(inviteToken, peerId), {
    inviteToken,
    peerId,
    alias,
    offer,
    offerRevision,
    answer: null,
    answerRevision: null,
    candidates: [],
    createdAt: Date.now()
  })

  console.log(JSON.stringify({
    scope: 'signalling',
    event: 'offer',
    peerId,
    inviteSuffix: String(inviteToken).slice(-8),
    offerRevision
  }))

  res.status(200).json({ message: 'offer stored' })
})

app.post('/signalling/answer', (req, res) => {
  const { inviteToken, peerId, answer } = req.body
  if (!inviteToken || !peerId || !answer) {
    return res.status(400).json({ error: 'inviteToken, peerId, and answer are required' })
  }

  const session = sessions.get(sessionKey(inviteToken, peerId))
  if (!session) {
    return res.status(404).json({ error: 'session not found' })
  }

  session.answer = answer
  session.answerRevision = Number.isFinite(Number(req.body.offerRevision)) ? Number(req.body.offerRevision) : null
  console.log(JSON.stringify({
    scope: 'signalling',
    event: 'answer',
    peerId,
    inviteSuffix: String(inviteToken).slice(-8),
    offerRevision: session.answerRevision
  }))
  res.status(200).json({ message: 'answer stored' })
})

app.post('/signalling/candidate', (req, res) => {
  const { inviteToken, peerId, candidate } = req.body
  if (!inviteToken || !peerId || !candidate) {
    return res.status(400).json({ error: 'inviteToken, peerId, and candidate are required' })
  }

  const key = sessionKey(inviteToken, peerId)
  let session = sessions.get(key)
  if (!session) {
    session = {
      inviteToken,
      peerId,
      alias: req.body.alias || null,
      offer: null,
      offerRevision: null,
      answer: null,
      answerRevision: null,
      candidates: [],
      createdAt: Date.now()
    }
    sessions.set(key, session)
  }

  const summary = summarizeIceCandidate(candidate)
  session.candidates.push({
    candidate,
    origin: req.body.origin || 'peer',
    timestamp: Date.now()
  })
  console.log(JSON.stringify({
    scope: 'signalling',
    event: 'candidate',
    peerId,
    origin: req.body.origin || 'peer',
    type: summary.type,
    protocol: summary.protocol,
    mdns: summary.mdns,
    privateOrLoopback: summary.privateOrLoopback
  }))
  res.sendStatus(204)
})

app.get('/signalling/pending/:inviteToken', (req, res) => {
  const { inviteToken } = req.params
  const matches = Array.from(sessions.values()).filter(
    (session) => session.inviteToken === inviteToken
  )

  if (!matches.length) {
    return res.status(404).json({ error: 'no pending sessions' })
  }

  const payload = matches.map((session) => ({
    peerId: session.peerId,
    alias: session.alias,
    offer: session.offer,
    offerRevision: session.offerRevision || null,
    answer: session.answer,
    answerRevision: session.answerRevision || null,
    candidates: session.candidates,
    connectionState: session.answer ? 'connected' : 'pending'
  }))

  res.json(payload)
})
app.get('/signalling/session/:inviteToken/:peerId', (req, res) => {
  const { inviteToken, peerId } = req.params
  const session = sessions.get(sessionKey(inviteToken, peerId))
  if (!session) {
    return res.status(404).json({ error: 'session not found' })
  }

  res.json({
    offer: session.offer,
    offerRevision: session.offerRevision || null,
    answer: session.answer,
    answerRevision: session.answerRevision || null,
    candidates: session.candidates
  })
})

app.get('/signalling/ice-servers', (_req, res) => {
  const payload = buildIceServerPayload({
    ICE_SERVERS: process.env.ICE_SERVERS,
    TURN_URLS: process.env.TURN_URLS,
    TURN_SECRET: process.env.TURN_SECRET,
    TURN_USERNAME: process.env.TURN_USERNAME,
    TURN_CREDENTIAL: process.env.TURN_CREDENTIAL
  })
  console.log(JSON.stringify({
    scope: 'signalling',
    event: 'ice-servers',
    turnConfigured: payload.turnConfigured,
    credentialMode: payload.credentialMode,
    ttlSeconds: payload.ttlSeconds,
    turnHosts: payload.turnHosts
  }))
  res.json(payload)
})

app.post('/game-instance/:instanceId/invite-regenerate', (req, res) => {
  const { instanceId } = req.params
  const { partyId } = req.body
  if (!partyId) {
    return res.status(400).json({ error: 'partyId is required' })
  }

  const inviteToken = `${instanceId}-${partyId}-${Date.now()}`
  res.status(200).json({ inviteToken })
})

app.listen(PORT, () => {
  console.log(`Express STUN helper listening on http://localhost:${PORT}`)
})
