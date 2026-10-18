#!/usr/bin/env node
// Netlify `ignore` command (netlify.toml [build].ignore).
// Exit 0 = skip this build, exit 1 = build.
//
// - production (main): always build
// - branch deploys: build only the `dev` branch
// - deploy previews: build PRs into main, skip PRs whose base branch is `dev`
//   (dev itself deploys once the PR is merged). Netlify does not expose the
//   PR base branch, so it is read from the public GitHub API. Any lookup
//   failure builds, so a GitHub hiccup never silently drops a main preview.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const DEV_BRANCH = 'dev'
export const REPO = 'theSystem85/code-for-battle'

export async function decideNetlifyBuild(env, { fetchImpl = globalThis.fetch, repo = REPO } = {}) {
  const context = env.CONTEXT || ''
  if (context === 'branch-deploy') {
    return env.BRANCH === DEV_BRANCH
      ? { build: true, reason: 'dev branch deploy' }
      : { build: false, reason: `branch deploys are limited to ${DEV_BRANCH} (got ${env.BRANCH || 'unknown'})` }
  }
  if (context === 'deploy-preview') {
    const reviewId = String(env.REVIEW_ID || '').trim()
    if (!/^\d+$/.test(reviewId)) return { build: true, reason: 'deploy preview without a PR number' }
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${repo}/pulls/${reviewId}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'code-for-battle-netlify-ignore' }
      })
      if (!response.ok) return { build: true, reason: `GitHub API ${response.status}; building to be safe` }
      const pull = await response.json()
      const base = pull?.base?.ref
      return base === DEV_BRANCH
        ? { build: false, reason: `PR #${reviewId} targets ${DEV_BRANCH}; ${DEV_BRANCH} deploys after merge` }
        : { build: true, reason: `PR #${reviewId} targets ${base || 'unknown'}` }
    } catch (error) {
      return { build: true, reason: `GitHub lookup failed (${error?.message || error}); building to be safe` }
    }
  }
  return { build: true, reason: `${context || 'unknown'} context` }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const decision = await decideNetlifyBuild(process.env)
  console.log(`netlify-ignore: ${decision.build ? 'build' : 'skip'} (${decision.reason})`)
  process.exit(decision.build ? 1 : 0)
}
