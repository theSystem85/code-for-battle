import { describe, expect, it } from 'vitest'
import { isBulkAssetPath, isNetworkFirstMapDataPath } from '../../src/pwa/serviceWorkerCachePolicy.js'

describe('service worker sprite sheet caching', () => {
  it('serves sprite sheet index, metadata and images network-first', () => {
    for (const path of ['/images/map/sprite_sheets/index.json', '/images/map/sprite_sheets/dtv2_soil.json', '/images/map/sprite_sheets/dtv3_ground_detail.webp']) {
      expect(isNetworkFirstMapDataPath(path)).toBe(true)
    }
    expect(isNetworkFirstMapDataPath('/images/map/units/tank.webp')).toBe(false)
    expect(isNetworkFirstMapDataPath('/sounds/boom.mp3')).toBe(false)
    expect(isBulkAssetPath('/images/map/units/tank.webp')).toBe(true)
  })
})
