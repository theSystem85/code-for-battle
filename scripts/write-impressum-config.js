import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { loadEnv } from 'vite'

const rootDir = process.cwd()
const distDir = resolve(rootDir, 'dist')
const distConfigPath = resolve(distDir, 'impressum.config.json')
const localConfigPath = resolve(rootDir, 'impressum.config.json')

function parseConfigValue(rawValue) {
  const firstPass = JSON.parse(rawValue)
  const parsedValue = typeof firstPass === 'string'
    ? JSON.parse(firstPass)
    : firstPass

  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    throw new Error('IMPRESSUM_CONFIG_JSON must resolve to a JSON object')
  }

  return parsedValue
}

function resolveEnvConfig() {
  const env = loadEnv('production', rootDir, '')
  return env.IMPRESSUM_CONFIG_JSON || process.env.IMPRESSUM_CONFIG_JSON || ''
}

function ensureDistDir() {
  mkdirSync(distDir, { recursive: true })
}

try {
  const rawEnvConfig = resolveEnvConfig().trim()

  ensureDistDir()

  if (rawEnvConfig) {
    const parsedConfig = parseConfigValue(rawEnvConfig)
    writeFileSync(distConfigPath, `${JSON.stringify(parsedConfig, null, 2)}\n`)
    console.log('Wrote dist/impressum.config.json from IMPRESSUM_CONFIG_JSON')
    process.exit(0)
  }

  if (existsSync(localConfigPath)) {
    copyFileSync(localConfigPath, distConfigPath)
    console.log('Copied local impressum.config.json to dist/impressum.config.json')
    process.exit(0)
  }

  console.log('No IMPRESSUM_CONFIG_JSON provided and no local impressum.config.json found; runtime fallback will use the example legal config.')
} catch (error) {
  console.error('Failed to generate dist/impressum.config.json:', error)
  process.exit(1)
}