import { describe, expect, it, vi } from 'vitest'
import { decideNetlifyBuild } from '../../scripts/netlify-ignore.mjs'

const pull = base => vi.fn(async() => new Response(JSON.stringify({ base: { ref: base } }), { status: 200 }))

describe('netlify ignore command', () => {
  it('[U05181] always builds production', async() => {
    expect((await decideNetlifyBuild({ CONTEXT: 'production', BRANCH: 'main' })).build).toBe(true)
  })

  it('[U05182] builds the dev branch deploy and skips every other branch deploy', async() => {
    expect((await decideNetlifyBuild({ CONTEXT: 'branch-deploy', BRANCH: 'dev' })).build).toBe(true)
    expect((await decideNetlifyBuild({ CONTEXT: 'branch-deploy', BRANCH: 'feat/x' })).build).toBe(false)
  })

  it('[U05183] skips deploy previews for PRs into dev and builds PRs into main', async() => {
    const intoDev = pull('dev')
    expect((await decideNetlifyBuild({ CONTEXT: 'deploy-preview', REVIEW_ID: '760' }, { fetchImpl: intoDev })).build).toBe(false)
    expect(intoDev.mock.calls[0][0]).toBe('https://api.github.com/repos/theSystem85/code-for-battle/pulls/760')
    expect((await decideNetlifyBuild({ CONTEXT: 'deploy-preview', REVIEW_ID: '761' }, { fetchImpl: pull('main') })).build).toBe(true)
  })

  it('[U05184] builds when the PR base cannot be determined', async() => {
    const down = vi.fn(async() => new Response('rate limited', { status: 403 }))
    expect((await decideNetlifyBuild({ CONTEXT: 'deploy-preview', REVIEW_ID: '762' }, { fetchImpl: down })).build).toBe(true)
    const offline = vi.fn(async() => { throw new Error('offline') })
    expect((await decideNetlifyBuild({ CONTEXT: 'deploy-preview', REVIEW_ID: '763' }, { fetchImpl: offline })).build).toBe(true)
    expect((await decideNetlifyBuild({ CONTEXT: 'deploy-preview' }, { fetchImpl: offline })).build).toBe(true)
  })
})
