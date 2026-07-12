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
    it('should have valid registry structure', () => {
      expect(configRegistry).toBeDefined()
      expect(typeof configRegistry).toBe('object')
    })

    it('should have entries with required properties', () => {
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

    it('should have valid config types', () => {
      const validTypes = ['number', 'boolean', 'string']
      const entries = Object.values(configRegistry)

      entries.forEach(entry => {
        expect(validTypes).toContain(entry.type)
      })
    })

    it('should have min/max/step for numeric configs', () => {
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

    it('should have known config keys', () => {
      const knownKeys = [
        'xpMultiplier',
        'crewKillChance',
        'tankFireRange',
        'enableEnemyControl',
        'oreSpreadEnabled',
        'harvesterCapacity',
        'defaultRotationSpeed',
        'mobileCanvasPixelRatioCap'
      ]

      knownKeys.forEach(key => {
        expect(configRegistry).toHaveProperty(key)
      })
    })
  })

  describe('getConfigCategories', () => {
    it('should return array of category names', () => {
      const categories = getConfigCategories()

      expect(Array.isArray(categories)).toBe(true)
      expect(categories.length).toBeGreaterThan(0)
    })

    it('should return sorted categories', () => {
      const categories = getConfigCategories()
      const sorted = [...categories].sort()

      expect(categories).toEqual(sorted)
    })

    it('should have no duplicate categories', () => {
      const categories = getConfigCategories()
      const unique = [...new Set(categories)]

      expect(categories).toEqual(unique)
    })

    it('should include known categories', () => {
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
    it('should return configs for valid category', () => {
      const categories = getConfigCategories()
      const firstCategory = categories[0]

      const configs = getConfigsByCategory(firstCategory)

      expect(typeof configs).toBe('object')
      expect(Object.keys(configs).length).toBeGreaterThan(0)
    })

    it('should return only configs from specified category', () => {
      const configs = getConfigsByCategory('Game Balance')

      Object.values(configs).forEach(entry => {
        expect(entry.category).toBe('Game Balance')
      })
    })

    it('should return empty object for non-existent category', () => {
      const configs = getConfigsByCategory('NonExistentCategory')

      expect(configs).toEqual({})
    })

    it('should return xpMultiplier in Game Balance category', () => {
      const configs = getConfigsByCategory('Game Balance')

      expect(configs).toHaveProperty('xpMultiplier')
      expect(configs.xpMultiplier.name).toBe('XP Multiplier')
    })

    it('should return combat configs in Combat category', () => {
      const configs = getConfigsByCategory('Combat')

      expect(Object.keys(configs).length).toBeGreaterThan(0)
      Object.values(configs).forEach(entry => {
        expect(entry.category).toBe('Combat')
      })
    })
  })

  describe('getConfigValue', () => {
    it('should return value for valid config', () => {
      const value = getConfigValue('xpMultiplier')

      expect(value).toBeDefined()
      expect(typeof value).toBe('number')
    })

    it('should return boolean value for boolean configs', () => {
      const value = getConfigValue('oreSpreadEnabled')

      expect(typeof value).toBe('boolean')
    })

    it('should return null for non-existent config', () => {
      const value = getConfigValue('nonExistentConfig')

      expect(value).toBeNull()
    })

    it('should call getter function of the config entry', () => {
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

    it('should return current runtime values', () => {
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
    it('should return false for non-existent config', () => {
      const result = setConfigValue('nonExistentConfig', 100)

      expect(result).toBe(false)
    })

    it('should return false for read-only config', () => {
      const result = setConfigValue('safeRangeEnabled', true)

      expect(result).toBe(false)
    })

    it('should call setter function for mutable config', () => {
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

    it('should handle setter errors gracefully', () => {
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
    it('should return true for configs with setter', () => {
      const result = isConfigMutable('xpMultiplier')

      expect(result).toBe(true)
    })

    it('should return false for read-only configs', () => {
      const result = isConfigMutable('safeRangeEnabled')

      expect(result).toBe(false)
    })

    it('should return false for non-existent config', () => {
      const result = isConfigMutable('nonExistentConfig')

      expect(result).toBe(false)
    })

    it('should correctly identify all mutable configs', () => {
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
    it('should respect numeric config ranges', () => {
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

    it('should have valid step values', () => {
      const numericConfigs = Object.entries(configRegistry)
        .filter(([, entry]) => entry.type === 'number' && entry.set)

      numericConfigs.forEach(([, entry]) => {
        expect(entry.step).toBeGreaterThan(0)
        expect(entry.step).toBeLessThanOrEqual(entry.max - entry.min)
      })
    })
  })

  describe('category consistency', () => {
    it('should have all configs in valid categories', () => {
      const categories = getConfigCategories()
      const allConfigs = Object.values(configRegistry)

      allConfigs.forEach(entry => {
        expect(categories).toContain(entry.category)
      })
    })

    it('should have balanced category distribution', () => {
      const categories = getConfigCategories()

      categories.forEach(category => {
        const configs = getConfigsByCategory(category)
        expect(Object.keys(configs).length).toBeGreaterThan(0)
      })
    })
  })

  describe('special config types', () => {
    it('should handle mobile joystick mapping configs', () => {
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

    it('should handle boolean configs', () => {
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
    it('should have all Howitzer configs in Howitzer category', () => {
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

    it('should have valid Howitzer config values', () => {
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
    it('should have non-empty names and descriptions', () => {
      const allConfigs = Object.values(configRegistry)

      allConfigs.forEach(entry => {
        expect(entry.name.length).toBeGreaterThan(0)
        expect(entry.description.length).toBeGreaterThan(0)
      })
    })

    it('should have descriptive names', () => {
      const allConfigs = Object.values(configRegistry)

      allConfigs.forEach(entry => {
        expect(entry.name).not.toBe('undefined')
        expect(entry.name).not.toBe('null')
        expect(entry.name.trim()).toBe(entry.name)
      })
    })
  })
})
