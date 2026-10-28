import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { decideNetlifyBuild } from '../../scripts/netlify-ignore.mjs'

describe('netlify ignore command', () => {
  it('[U05181] always builds production', async() => {
    expect((await decideNetlifyBuild({ CONTEXT: 'production', BRANCH: 'main' })).build).toBe(true)
  })

  it('[U05182] builds the dev branch deploy and skips every other branch deploy', async() => {
    expect((await decideNetlifyBuild({ CONTEXT: 'branch-deploy', BRANCH: 'dev' })).build).toBe(true)
    expect((await decideNetlifyBuild({ CONTEXT: 'branch-deploy', BRANCH: 'feat/x' })).build).toBe(false)
  })

  it('[U05183] always builds PR previews without depending on a GitHub lookup', async() => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    try {
      for (const reviewId of ['789', '790', '', 'unknown']) {
        expect((await decideNetlifyBuild({ CONTEXT: 'deploy-preview', REVIEW_ID: reviewId, BRANCH: 'fix/recovery-apache-retina' })).build).toBe(true)
      }
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('[U05184] exits with Netlify build or skip codes for previews, dev and production', () => {
    for (const [context, branch, expectedStatus] of [
      ['deploy-preview', 'fix/recovery-apache-retina', 1],
      ['branch-deploy', 'dev', 1],
      ['branch-deploy', 'feat/x', 0],
      ['production', 'main', 1]
    ]) {
      const result = spawnSync(process.execPath, [resolve('scripts/netlify-ignore.mjs')], {
        env: { ...process.env, CONTEXT: context, BRANCH: branch, REVIEW_ID: '789' },
        encoding: 'utf8'
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(expectedStatus)
      expect(result.stdout).toContain(`netlify-ignore: ${expectedStatus === 1 ? 'build' : 'skip'}`)
    }
  })
})
