import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AUDIO_CATALOGUE, AUDIO_CATALOGUE_SECTIONS } from '../../src/audio/audioCatalogue.js'
import { PRECACHE_GLOB_IGNORES } from '../../src/pwa/precachePolicy.js'
import { computeWaveformPeaks, dominantFrequencyBin } from '../../src/ui/audioCatalogueVisual.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const AUDIO_EXT = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.webm'])

function shippedAudioFiles(dir, prefix = '') {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...shippedAudioFiles(abs, rel))
    else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) found.push(rel)
  }
  return found
}

describe('audio catalogue', () => {
  it('[U07254] lists every shipped audio file exactly once', () => {
    const shipped = shippedAudioFiles(path.join(root, 'public')).sort()
    const listed = AUDIO_CATALOGUE.flatMap(entry => entry.legacyFile ? [entry.file, entry.legacyFile] : [entry.file]).sort()
    const missing = shipped.filter(file => !listed.includes(file))
    const extra = listed.filter(file => !shipped.includes(file))
    expect(missing, 'add these files to src/audio/audioCatalogue.js').toEqual([])
    expect(extra, 'catalogue entries point at files that are not shipped').toEqual([])
    expect(new Set(listed).size, 'a shipped file is listed more than once').toBe(listed.length)
    expect(new Set(AUDIO_CATALOGUE.map(entry => entry.id)).size).toBe(AUDIO_CATALOGUE.length)
  })

  it('[U07255] gives every entry a section, a description and a real file', () => {
    const sections = new Set(AUDIO_CATALOGUE_SECTIONS.map(section => section.id))
    for (const entry of AUDIO_CATALOGUE) {
      expect(sections.has(entry.section), entry.file).toBe(true)
      expect(entry.name.trim().length, entry.file).toBeGreaterThan(0)
      expect(entry.description.trim().length, entry.file).toBeGreaterThan(12)
      expect(fs.existsSync(path.join(root, 'public', entry.file)), entry.file).toBe(true)
    }
  })

  it('[U07257] keeps the catalogue chunk out of the install precache', () => {
    const ignores = PRECACHE_GLOB_IGNORES.join(' ')
    expect(ignores).toContain('audioCatalogue*.js')
    expect(ignores).toContain('audioCatalogue*.css')
  })

  it('[U07256] peaks a waveform bucket and a pure sine', () => {
    const channel = new Float32Array(8)
    channel[4] = 1
    const peaks = computeWaveformPeaks(channel, 4)
    expect(peaks[2]).toBe(1)
    expect(peaks[0]).toBe(0)
    const fftSize = 256
    const bin = 8
    const sine = new Float32Array(fftSize)
    for (let i = 0; i < fftSize; i++) sine[i] = Math.sin((2 * Math.PI * bin * i) / fftSize)
    expect(dominantFrequencyBin(sine, fftSize)).toBe(bin)
  })
})
