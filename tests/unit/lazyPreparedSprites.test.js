import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  disposePreparedSpriteRegistry,
  getPreparedSprite,
  prepareSpriteRegistry,
  publishPreparedSpriteRegistry
} from '../../src/rendering/prepared/preparedSpritePipeline.js'

function fixture() {
  const requested = []
  const entry = (type, category) => ({
    id: `${category}:${type}:base`, category,
    source: '/unused-source.webp', sourceWidth: 32, sourceHeight: 32,
    logicalWidth: 32, logicalHeight: 32,
    variants: [1, 2, 3].map(density => ({ density, path: `/${type}@${density}x.webp` }))
  })
  const manifest = { schemaVersion: 1, assetVersion: 'lazy-test', entries: [
    entry('constructionYard', 'building'), entry('harvester', 'unit'), entry('ambulance', 'unit')
  ] }
  return {
    requested,
    options: {
      density: 2, deferUnits: true,
      fetchImpl: async() => ({ ok: true, json: async() => manifest }),
      imageFactory: () => {
        const image = { naturalWidth: 64, naturalHeight: 64, decode: async() => {} }
        let source = ''
        Object.defineProperty(image, 'src', { get: () => source, set(url) {
          source = url
          if (!url) return
          requested.push(url.split('?')[0])
          globalThis.queueMicrotask(() => image.onload?.())
        } })
        return image
      }
    }
  }
}

afterEach(() => disposePreparedSpriteRegistry())

describe('deferred prepared sprite loading', () => {
  it('[U02345] boots without unit requests and deduplicates a high priority on-demand load', async() => {
    const { options, requested } = fixture()
    const prepared = await prepareSpriteRegistry(options)
    publishPreparedSpriteRegistry(prepared)
    expect(requested).toEqual(['/constructionYard@2x.webp'])
    expect(getPreparedSprite('unit:harvester:base')).toBeNull()
    expect(getPreparedSprite('unit:harvester:base')).toBeNull()
    await vi.waitFor(() => expect(getPreparedSprite('unit:harvester:base')).not.toBeNull())
    expect(requested.filter(url => url === '/harvester@2x.webp')).toHaveLength(1)
    expect(requested).not.toContain('/ambulance@2x.webp')
    await prepared.preloadRemaining(['ambulance'])
    expect(getPreparedSprite('unit:ambulance:base')).not.toBeNull()
    expect(requested.every(url => url.endsWith('@2x.webp'))).toBe(true)
  })

  it('[U06210] re-requesting an already prepared entry is idempotent without duplicate-register warnings', async() => {
    const { options, requested } = fixture()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const prepared = await prepareSpriteRegistry({ ...options, initialUnitTypes: ['harvester'] })
      publishPreparedSpriteRegistry(prepared)
      const first = getPreparedSprite('unit:harvester:base')
      expect(first).not.toBeNull()
      await prepared.request('unit:harvester:base')
      await Promise.all([prepared.request('unit:ambulance:base'), prepared.request('unit:ambulance:base')])
      await prepared.request('unit:ambulance:base')
      expect(getPreparedSprite('unit:harvester:base')).toBe(first)
      expect(requested.filter(url => url === '/harvester@2x.webp')).toHaveLength(1)
      expect(warn.mock.calls.filter(([message]) => String(message).includes('Prepared sprite'))).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })

  it('[U02346] includes units already present in the initial state', async() => {
    const { options, requested } = fixture()
    const prepared = await prepareSpriteRegistry({ ...options, initialUnitTypes: ['harvester'] })
    publishPreparedSpriteRegistry(prepared)
    expect(getPreparedSprite('unit:harvester:base')).not.toBeNull()
    expect(requested).toEqual(['/constructionYard@2x.webp', '/harvester@2x.webp'])
  })

  it('[U02347] publishes working sprites when a single image fails', async() => {
    const { options } = fixture()
    const imageFactory = options.imageFactory
    options.imageFactory = () => {
      const image = imageFactory()
      image.decode = async() => {
        if (image.src.includes('constructionYard')) throw new Error('decode failed')
      }
      return image
    }
    const prepared = await prepareSpriteRegistry({ ...options, initialUnitTypes: ['harvester'] })
    publishPreparedSpriteRegistry(prepared)
    expect(getPreparedSprite('building:constructionYard:base')).toBeNull()
    expect(getPreparedSprite('unit:harvester:base')).not.toBeNull()
  })
})
