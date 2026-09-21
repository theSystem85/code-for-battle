import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const netlifyTomlPath = join(projectRoot, 'netlify.toml')
const netlifyToml = readFileSync(netlifyTomlPath, 'utf8')

/**
 * Primary Netlify site build command from the top-level [build] table.
 * Comments are ignored so the explanatory note can mention the broken pattern.
 */
export function readPrimaryBuildCommand(toml) {
  let section = ''
  for (const line of toml.split(/\r?\n/)) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (sectionMatch) {
      section = sectionMatch[1].trim()
      continue
    }
    if (section !== 'build') continue
    const commandMatch = line.match(/^\s*command\s*=\s*"([^"]*)"\s*$/)
    if (commandMatch) return commandMatch[1]
  }
  throw new Error('primary [build] command was not found in netlify.toml')
}

export function splitShellSteps(command) {
  return command.split(/\s*(?:&&|\|\||;)\s*/).map(step => step.trim()).filter(Boolean)
}

/**
 * Fail when a Netlify build command reintroduces the arborist crash:
 * deleting package-lock.json and/or resolving dependencies with a floating npm install.
 */
export function assertLockfileInstallCommand(command) {
  const errors = []
  const steps = splitShellSteps(command)
  const ciStep = steps.find(step => /(?:^|\s)npm ci(?:\s|$)/.test(step))
  if (!ciStep) {
    errors.push('Netlify build command must include npm ci')
  } else if (!/(?:^|\s)--include=dev(?:\s|$)/.test(ciStep)) {
    errors.push('npm ci must pass --include=dev so Vite and Vitest install when NODE_ENV=production')
  }
  if (/\brm\b[^&|;]*package-lock/.test(command)) {
    errors.push('Netlify build command must not delete package-lock.json')
  }
  if (steps.some(step => /(?:^|\s)npm install(?:\s|$)/.test(step))) {
    errors.push('Netlify build command must not use bare npm install as the install step')
  }
  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}

describe('netlify.toml deploy install guard', () => {
  const command = readPrimaryBuildCommand(netlifyToml)

  it('installs from the lockfile with npm ci --include=dev', () => {
    expect(command).toContain('npm ci')
    expect(() => assertLockfileInstallCommand(command)).not.toThrow()
    expect(splitShellSteps(command).some(step => /(?:^|\s)npm ci(?:\s|$)/.test(step) && /--include=dev/.test(step))).toBe(true)
  })

  it('does not delete package-lock.json', () => {
    expect(command).not.toMatch(/\brm\b[^&|;]*package-lock/)
  })

  it('does not use bare npm install as the install step', () => {
    const steps = splitShellSteps(command)
    expect(steps.some(step => /(?:^|\s)npm ci(?:\s|$)/.test(step))).toBe(true)
    expect(steps.some(step => /(?:^|\s)npm install(?:\s|$)/.test(step))).toBe(false)
  })

  it('keeps the lockfile crash explanation in netlify.toml', () => {
    expect(netlifyToml).toMatch(/Keep the committed lockfile/)
    expect(netlifyToml).toMatch(/floating `npm install`/)
    expect(netlifyToml).toMatch(/edgesOut/)
  })

  it('rejects the historical lockfile-deleting install', () => {
    const broken = 'rm -f package-lock.json && rm -rf node_modules && npm install && npm run build && npm run test:smoke'
    expect(broken).toMatch(/\brm\b[^&|;]*package-lock/)
    expect(() => assertLockfileInstallCommand(broken)).toThrow(/package-lock\.json/)
  })

  it('rejects a floating npm install that omits npm ci', () => {
    const broken = 'npm install && npm run build && npm run test:smoke'
    expect(() => assertLockfileInstallCommand(broken)).toThrow(/npm ci/)
  })

  it('rejects bare npm install even when npm ci is also present', () => {
    const broken = 'npm ci --include=dev && npm install && npm run build'
    expect(() => assertLockfileInstallCommand(broken)).toThrow(/bare npm install/)
  })
})
