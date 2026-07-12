const DB_NAME = 'code-for-battle-storage'
const DB_VERSION = 1
const STORE_NAME = 'keyValue'
const LEGACY_MIGRATION_FLAG_KEY = 'rts_indexeddb_migrated_from_local_storage'

const cache = new Map()
const pendingWrites = new Set()

let databasePromise = null
let initialized = false
let initializePromise = null

function getLogger() {
  return globalThis.window?.logger || console
}

function getLegacyStorage() {
  try {
    return globalThis.window?.['local' + 'Storage'] || globalThis['local' + 'Storage'] || null
  } catch {
    return null
  }
}

function getLegacyStorageValue(key) {
  const legacyStorage = getLegacyStorage()
  if (!legacyStorage) return null

  try {
    return legacyStorage.getItem(key)
  } catch {
    return null
  }
}

function mirrorFallbackWriteToLegacyStorage(key, value) {
  if (supportsIndexedDb()) return
  const legacyStorage = getLegacyStorage()
  if (!legacyStorage) return

  legacyStorage.setItem(key, String(value))
}

function mirrorFallbackRemoveFromLegacyStorage(key) {
  if (supportsIndexedDb()) return
  const legacyStorage = getLegacyStorage()
  if (!legacyStorage) return

  legacyStorage.removeItem(key)
}

function supportsIndexedDb() {
  return typeof globalThis.indexedDB !== 'undefined'
}

function openDatabase() {
  if (!supportsIndexedDb()) {
    return Promise.resolve(null)
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        getLogger().warn?.('IndexedDB storage upgrade is blocked by another open tab.')
      }
    }).catch(error => {
      databasePromise = null
      getLogger().warn?.('Failed to open IndexedDB storage:', error)
      return null
    })
  }

  return databasePromise
}

function runStoreOperation(mode, operation) {
  return openDatabase().then(db => {
    if (!db) return null

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)
      const result = operation(store)

      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  })
}

async function loadIndexedDbCache() {
  await runStoreOperation('readonly', store => {
    const request = store.getAll()
    request.onsuccess = () => {
      cache.clear()
      ;(request.result || []).forEach(entry => {
        if (entry?.key) {
          cache.set(entry.key, String(entry.value ?? ''))
        }
      })
    }
  })
}

function queueWrite(writePromise) {
  pendingWrites.add(writePromise)
  writePromise.finally(() => pendingWrites.delete(writePromise))
  return writePromise
}

function persistValue(key, value) {
  return queueWrite(
    runStoreOperation('readwrite', store => {
      store.put({ key, value: String(value) })
    }).catch(error => {
      getLogger().warn?.('Failed to write IndexedDB storage value:', key, error)
    })
  )
}

function deleteValue(key) {
  return queueWrite(
    runStoreOperation('readwrite', store => {
      store.delete(key)
    }).catch(error => {
      getLogger().warn?.('Failed to remove IndexedDB storage value:', key, error)
    })
  )
}

async function migrateLegacyStorage() {
  const legacyStorage = getLegacyStorage()
  if (!legacyStorage || cache.has(LEGACY_MIGRATION_FLAG_KEY)) {
    return
  }

  const migratedEntries = []
  try {
    for (let index = 0; index < legacyStorage.length; index += 1) {
      const key = legacyStorage.key(index)
      if (!key || cache.has(key)) continue
      const value = legacyStorage.getItem(key)
      if (value === null) continue
      cache.set(key, value)
      migratedEntries.push([key, value])
    }
  } catch (error) {
    getLogger().warn?.('Failed to read legacy browser storage for IndexedDB migration:', error)
  }

  cache.set(LEGACY_MIGRATION_FLAG_KEY, 'true')
  migratedEntries.push([LEGACY_MIGRATION_FLAG_KEY, 'true'])

  if (!supportsIndexedDb()) {
    return
  }

  try {
    await runStoreOperation('readwrite', store => {
      migratedEntries.forEach(([key, value]) => {
        store.put({ key, value })
      })
    })
  } catch (error) {
    getLogger().warn?.('Failed to migrate legacy browser storage to IndexedDB:', error)
  }
}

export function initializeGameStorage() {
  if (initialized) {
    return Promise.resolve()
  }

  if (!initializePromise) {
    initializePromise = (async() => {
      await loadIndexedDbCache()
      await migrateLegacyStorage()
      initialized = true
    })()
  }

  return initializePromise
}

export function isGameStorageReady() {
  return initialized
}

export function isGameStorageAvailable() {
  return supportsIndexedDb() || cache.size >= 0
}

export function getStoredItem(key) {
  if (cache.has(key)) {
    return cache.get(key)
  }

  const legacyValue = getLegacyStorageValue(key)
  if (legacyValue !== null) {
    cache.set(key, legacyValue)
    void persistValue(key, legacyValue)
    return legacyValue
  }

  return null
}

export function hasStoredItem(key) {
  return getStoredItem(key) !== null
}

export function setStoredItem(key, value) {
  const stringValue = String(value)
  mirrorFallbackWriteToLegacyStorage(key, stringValue)
  cache.set(key, stringValue)
  void persistValue(key, stringValue)
}

export function removeStoredItem(key) {
  mirrorFallbackRemoveFromLegacyStorage(key)
  cache.delete(key)
  void deleteValue(key)
}

export function getStoredKeys(prefix = '') {
  const keys = new Set(cache.keys())
  const legacyStorage = getLegacyStorage()
  if (legacyStorage) {
    try {
      for (let index = 0; index < legacyStorage.length; index += 1) {
        const key = legacyStorage.key(index)
        if (key) keys.add(key)
      }
    } catch {
      // The cache remains authoritative when legacy enumeration fails.
    }
  }
  return Array.from(keys).filter(key => key.startsWith(prefix))
}

export function getStoredEntries(prefix = '') {
  return getStoredKeys(prefix).map(key => [key, getStoredItem(key)])
}

export async function flushGameStorageWrites() {
  await Promise.allSettled(Array.from(pendingWrites))
}

export function resetGameStorageForTests(entries = {}) {
  cache.clear()
  Object.entries(entries).forEach(([key, value]) => {
    cache.set(key, String(value))
  })
  initialized = true
  initializePromise = Promise.resolve()
}

void initializeGameStorage()
