#!/usr/bin/env node
// Netlify `ignore` command (netlify.toml [build].ignore).
// Exit 0 = skip this build, exit 1 = build.
//
// - production (main): always build
// - branch deploys: build only the `dev` branch, skipping backlog-only updates
// - deploy previews: always build, including PRs targeting dev
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { todoRangeOnly } from './todo-paths.mjs'

export const DEV_BRANCH = 'dev'
export async function decideNetlifyBuild(env, cwd) {
  const context = env.CONTEXT || ''
  if (context === 'branch-deploy') {
    if (env.BRANCH === DEV_BRANCH && todoRangeOnly(env.CACHED_COMMIT_REF, env.COMMIT_REF, cwd)) {
      return { build: false, reason: 'TODO-only commits; backlog is served directly from Git' }
    }
    return env.BRANCH === DEV_BRANCH
      ? { build: true, reason: 'dev branch deploy' }
      : { build: false, reason: `branch deploys are limited to ${DEV_BRANCH} (got ${env.BRANCH || 'unknown'})` }
  }
  if (context === 'deploy-preview') {
    return { build: true, reason: 'PR deploy preview (including dev)' }
  }
  return { build: true, reason: `${context || 'unknown'} context` }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const decision = await decideNetlifyBuild(process.env)
  console.log(`netlify-ignore: ${decision.build ? 'build' : 'skip'} (${decision.reason})`)
  process.exit(decision.build ? 1 : 0)
}
