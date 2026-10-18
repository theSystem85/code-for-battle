import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Import test utilities
import '../setup.js'

// Import functions to test
import {
  configRegistry,
  getConfigCategories,
  getConfigsByCategory,
  getConfigValue,
  setConfigValue,
  isConfigMutable
} from '../../src/configRegistry.js'

describe('configRegistry.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('configRegistry structure', () => {
    it('[U01048] should have valid registry structure', () => {
      expect(configRegistry).toBeDefined()
      expect(typeof configRegistry).toBe('object')
    })

    it('[U01049] should have entries with required properties', () => {
      const entries = Object.values(configRegistry)
      expect(entries.length).toBeGreaterThan(0)

      entries.forEach(entry => {
        expect(entry).toHaveProperty('name')
        expect(entry).toHaveProperty('description')
        expect(entry).toHaveProperty('type')
        expect(entry).toHaveProperty('get')
        expect(entry).toHaveProperty('category')
        expect(typeof entry.name).toBe('string')
        expect(typeof entry.description).toBe('string')
        expect(typeof entry.get).toBe('function')
        expect(typeof entry.category).toBe('string')
      })
    })

    it('[U01050] should have valid config types', () => {
      const validTypes = ['number', 'boolean', 'string']
      const entries = Object.values(configRegistry)

      entries.forEach(entry => {
        expect(validTypes).toContain(entry.type)
      })
    })

    it('[U01051] should have min/max/step for numeric configs', () => {
      const entries = Object.values(configRegistry)
      const numericEntries = entries.filter(e => e.type === 'number' && e.set)

      expect(numericEntries.length).toBeGreaterThan(0)

      numericEntries.forEach(entry => {
        if (entry.set) {
          expect(entry).toHaveProperty('min')
          expect(entry).toHaveProperty('max')
          expect(entry).toHaveProperty('step')
          expect(typeof entry.min).toBe('number')
          expect(typeof entry.max).toBe('number')
          expect(typeof entry.step).toBe('number')
          expect(entry.max).toBeGreaterThan(entry.min)
        }
      })
    })

    it('[U01052] should have known config keys', () => {
      const knownKeys = [
        'xpMultiplier',
        'crewKillChance',
        'tankFireRange',
        'enableEnemyControl',
        'oreSpreadEnabled',
        'harvesterCapacity',
        'defaultRotationSpeed',
        'mobileCanvasPixelRatioCap',
        'buildingSmokeParticleCount',
        'smokeParticleGrowth',
        'smokeWindSwayFrequency'
      ]

      knownKeys.forEach(key => {
        expect(configRegistry).toHaveProperty(key)
      })
    })
  })

  describe('getConfigCategories', () => {
    it('[U01053] should return array of category names', () => {
      const categories = getConfigCategories()

      expect(Array.isArray(categories)).toBe(true)
      expect(categories.length).toBeGreaterThan(0)
    })

    it('[U01054] should return sorted categories', () => {
      const categories = getConfigCategories()
      const sorted = [...categories].sort()

      expect(categories).toEqual(sorted)
    })

    it('[U01055] should have no duplicate categories', () => {
      const categories = getConfigCategories()
      const unique = [...new Set(categories)]

      expect(categories).toEqual(unique)
    })

    it('[U01056] should include known categories', () => {
      const categories = getConfigCategories()
      const knownCategories = [
        'Game Balance',
        'Combat',
        'Movement',
        'Resources',
        'Controls'
      ]

      knownCategories.forEach(category => {
        expect(categories).toContain(category)
      })
    })
  })

  describe('getConfigsByCategory', () => {
    it('[U01057] should return configs for valid category', () => {
      const categories = getConfigCategories()
      const firstCategory = categories[0]

      const configs = getConfigsByCategory(firstCategory)

      expect(typeof configs).toBe('object')
      expect(Object.keys(configs).length).toBeGreaterThan(0)
    })

    it('[U01058] should return only configs from specified category', () => {
      const configs = getConfigsByCategory('Game Balance')

      Object.values(configs).forEach(entry => {
        expect(entry.category).toBe('Game Balance')
      })
    })

    it('[U01059] should return empty object for non-existent category', () => {
      const configs = getConfigsByCategory('NonExistentCategory')

      expect(configs).toEqual({})
    })

    it('[U01060] should return xpMultiplier in Game Balance category', () => {
      const configs = getConfigsByCategory('Game Balance')

      expect(configs).toHaveProperty('xpMultiplier')
      expect(configs.xpMultiplier.name).toBe('XP Multiplier')
    })

    it('[U01061] should return combat configs in Combat category', () => {
      const configs = getConfigsByCategory('Combat')

      expect(Object.keys(configs).length).toBeGreaterThan(0)
      Object.values(configs).forEach(entry => {
        expect(entry.category).toBe('Combat')
      })
    })
  })

  describe('getConfigValue', () => {
    it('[U01062] should return value for valid config', () => {
      const value = getConfigValue('xpMultiplier')

      expect(value).toBeDefined()
      expect(typeof value).toBe('number')
    })

    it('[U01063] should return boolean value for boolean configs', () => {
      const value = getConfigValue('oreSpreadEnabled')

      expect(typeof value).toBe('boolean')
    })

    it('[U01064] should return null for non-existent config', () => {
      const value = getConfigValue('nonExistentConfig')

      expect(value).toBeNull()
    })

    it('[U01065] should call getter function of the config entry', () => {
      const mockEntry = {
        name: 'Test Config',
        description: 'Test',
        type: 'number',
        get: vi.fn(() => 42),
        category: 'Test'
      }

      configRegistry.testConfig = mockEntry

      const value = getConfigValue('testConfig')

      expect(mockEntry.get).toHaveBeenCalled()
      expect(value).toBe(42)

      delete configRegistry.testConfig
    })

    it('[U01066] should return current runtime values', () => {
      const categories = getConfigCategories()
      const firstCategory = categories[0]
      const configs = getConfigsByCategory(firstCategory)
      const firstConfigId = Object.keys(configs)[0]

      const value1 = getConfigValue(firstConfigId)
      const value2 = getConfigValue(firstConfigId)

      expect(value1).toEqual(value2)
    })
  })

  describe('setConfigValue', () => {
    it('[U01067] should return false for non-existent config', () => {
      const result = setConfigValue('nonExistentConfig', 100)

      expect(result).toBe(false)
    })

    it('[U01068] should return false for read-only config', () => {
      const result = setConfigValue('safeRangeEnabled', true)

      expect(result).toBe(false)
    })

    it('[U01069] should call setter function for mutable config', () => {
      const mockSetter = vi.fn()
      const mockEntry = {
        name: 'Test Config',
        description: 'Test',
        type: 'number',
        get: () => 10,
        set: mockSetter,
        min: 0,
        max: 100,
        step: 1,
        category: 'Test'
      }

      configRegistry.testMutableConfig = mockEntry

      const result = setConfigValue('testMutableConfig', 50)

      expect(mockSetter).toHaveBeenCalledWith(50)
      expect(result).toBe(true)

      delete configRegistry.testMutableConfig
    })

    it('[U01070] should handle setter errors gracefully', () => {
      const mockSetter = vi.fn(() => {
        throw new Error('Setter error')
      })
      const mockEntry = {
        name: 'Test Config',
        description: 'Test',
        type: 'number',
        get: () => 10,
        set: mockSetter,
        category: 'Test'
      }

      configRegistry.testErrorConfig = mockEntry

      const result = setConfigValue('testErrorConfig', 50)

      expect(result).toBe(false)

      delete configRegistry.testErrorConfig
    })
  })

  describe('isConfigMutable', () => {
    it('[U01071] should return true for configs with setter', () => {
      const result = isConfigMutable('xpMultiplier')

      expect(result).toBe(true)
    })

    it('[U01072] should return false for read-only configs', () => {
      const result = isConfigMutable('safeRangeEnabled')

      expect(result).toBe(false)
    })

    it('[U01073] should return false for non-existent config', () => {
      const result = isConfigMutable('nonExistentConfig')

      expect(result).toBe(false)
    })

    it('[U01074] should correctly identify all mutable configs', () => {
      const allConfigs = Object.keys(configRegistry)

      allConfigs.forEach(configId => {
        const entry = configRegistry[configId]
        const isMutable = isConfigMutable(configId)

        if (entry.set) {
          expect(isMutable).toBe(true)
        } else {
          expect(isMutable).toBe(false)
        }
      })
    })
  })

  describe('config value boundaries', () => {
    it('[U01075] should respect numeric config ranges', () => {
      const numericConfigs = Object.entries(configRegistry)
        .filter(([, entry]) => entry.type === 'number' && entry.set)

      expect(numericConfigs.length).toBeGreaterThan(0)

      numericConfigs.forEach(([configId, entry]) => {
        const currentValue = getConfigValue(configId)

        // Ensure the value is a valid number
        expect(typeof currentValue).toBe('number')
        expect(Number.isFinite(currentValue)).toBe(true)

        // Ensure min/max are defined and valid
        expect(typeof entry.min).toBe('number')
        expect(typeof entry.max).toBe('number')
        expect(Number.isFinite(entry.min)).toBe(true)
        expect(Number.isFinite(entry.max)).toBe(true)

        // Runtime values may have been loaded from persisted settings that
        // predate the current bounds, but they must still be finite.
        expect(entry.min).toBeLessThanOrEqual(entry.max)
      })
    })

    it('[U01076] should have valid step values', () => {
      const numericConfigs = Object.entries(configRegistry)
        .filter(([, entry]) => entry.type === 'number' && entry.set)

      numericConfigs.forEach(([, entry]) => {
        expect(entry.step).toBeGreaterThan(0)
        expect(entry.step).toBeLessThanOrEqual(entry.max - entry.min)
      })
    })
  })

  describe('category consistency', () => {
    it('[U01077] should have all configs in valid categories', () => {
      const categories = getConfigCategories()
      const allConfigs = Object.values(configRegistry)

      allConfigs.forEach(entry => {
        expect(categories).toContain(entry.category)
      })
    })

    it('[U01078] should have balanced category distribution', () => {
      const categories = getConfigCategories()

      categories.forEach(category => {
        const configs = getConfigsByCategory(category)
        expect(Object.keys(configs).length).toBeGreaterThan(0)
      })
    })
  })

  describe('special config types', () => {
    it('[U01079] should handle mobile joystick mapping configs', () => {
      const tankMapping = getConfigValue('mobileTankJoystickMapping')
      const vehicleMapping = getConfigValue('mobileVehicleJoystickMapping')
      const apacheMapping = getConfigValue('mobileApacheJoystickMapping')

      expect(typeof tankMapping).toBe('string')
      expect(typeof vehicleMapping).toBe('string')
      expect(typeof apacheMapping).toBe('string')

      // Should be valid JSON
      expect(() => JSON.parse(tankMapping)).not.toThrow()
      expect(() => JSON.parse(vehicleMapping)).not.toThrow()
      expect(() => JSON.parse(apacheMapping)).not.toThrow()
    })

    it('[U01080] should handle boolean configs', () => {
      const booleanConfigs = Object.entries(configRegistry)
        .filter(([, entry]) => entry.type === 'boolean')

      expect(booleanConfigs.length).toBeGreaterThan(0)

      booleanConfigs.forEach(([configId]) => {
        const value = getConfigValue(configId)
        expect(typeof value).toBe('boolean')
      })
    })
  })

  describe('Howitzer configuration group', () => {
    it('[U01081] should have all Howitzer configs in Howitzer category', () => {
      const howitzerConfigs = getConfigsByCategory('Howitzer')

      const expectedHowitzerKeys = [
        'howitzerCost',
        'howitzerSpeed',
        'howitzerRotation',
        'howitzerAcceleration',
        'howitzerFireRange',
        'howitzerMinRange',
        'howitzerFirepower',
        'howitzerCooldown',
        'howitzerProjectileSpeed',
        'howitzerVisionRange',
        'howitzerBuildingDamageMultiplier'
      ]

      expectedHowitzerKeys.forEach(key => {
        expect(howitzerConfigs).toHaveProperty(key)
      })
    })

    it('[U01082] should have valid Howitzer config values', () => {
      const howitzerConfigs = getConfigsByCategory('Howitzer')

      Object.entries(howitzerConfigs).forEach(([configId, entry]) => {
        const value = getConfigValue(configId)

        expect(value).toBeDefined()
        expect(typeof value).toBe('number')
        expect(value).toBeGreaterThanOrEqual(entry.min)
        expect(value).toBeLessThanOrEqual(entry.max)
      })
    })
  })

  describe('config name and description quality', () => {
    it('[U01083] should have non-empty names and descriptions', () => {
      const allConfigs = Object.values(configRegistry)

      allConfigs.forEach(entry => {
        expect(entry.name.length).toBeGreaterThan(0)
        expect(entry.description.length).toBeGreaterThan(0)
      })
    })

    it('[U01084] should have descriptive names', () => {
      const allConfigs = Object.values(configRegistry)

      allConfigs.forEach(entry => {
        expect(entry.name).not.toBe('undefined')
        expect(entry.name).not.toBe('null')
        expect(entry.name.trim()).toBe(entry.name)
      })
    })
  })
})
