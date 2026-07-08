import type { StorageAdapter } from './types.js'

const DB_NAME = 'lifi-perps-sdk'
const OBJECT_STORE = 'keys'
const MASTER_KEY_ID = 'storage-master-key'
const IV_BYTE_LENGTH = 12
const AES_KEY_PARAMS = { name: 'AES-GCM', length: 256 } as const

let masterKeyPromise: Promise<CryptoKey | null> | undefined

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(OBJECT_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Resolve the AES-GCM master key, generating and persisting one on first use.
 * The key is non-extractable and lives as a structured-cloned handle in
 * IndexedDB — the raw bytes never leave the browser's crypto layer. Resolves
 * `null` when IndexedDB or WebCrypto is unavailable so callers degrade to
 * no-op writes / null reads rather than persisting plaintext.
 */
async function loadMasterKey(): Promise<CryptoKey | null> {
  if (
    typeof indexedDB === 'undefined' ||
    typeof crypto === 'undefined' ||
    !crypto.subtle
  ) {
    return null
  }
  try {
    const db = await openDb()
    try {
      const existing = await requestToPromise(
        db
          .transaction(OBJECT_STORE, 'readonly')
          .objectStore(OBJECT_STORE)
          .get(MASTER_KEY_ID)
      )
      if (existing instanceof CryptoKey) {
        return existing
      }
      const key = await crypto.subtle.generateKey(AES_KEY_PARAMS, false, [
        'encrypt',
        'decrypt',
      ])
      await requestToPromise(
        db
          .transaction(OBJECT_STORE, 'readwrite')
          .objectStore(OBJECT_STORE)
          .put(key, MASTER_KEY_ID)
      )
      return key
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

function getMasterKey(): Promise<CryptoKey | null> {
  masterKeyPromise ??= loadMasterKey()
  return masterKeyPromise
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Default storage adapter: persists AES-GCM-256 ciphertext to browser
 * `localStorage`, keyed by a non-extractable master {@link CryptoKey} held in
 * IndexedDB. Each `set` uses a fresh 12-byte IV and
 * stores `base64(iv ‖ ciphertext)`. Falls back to a no-op / `null` when
 * `localStorage`, `indexedDB`, or `crypto.subtle` is unavailable (e.g. SSR) —
 * never writing plaintext.
 *
 * `get` resolves `null` on any failure (missing master key, tampered or
 * truncated ciphertext, malformed value), matching the poisoned-record
 * eviction philosophy so callers treat undecryptable data as absent.
 *
 * @security Encryption at rest defeats generic browser-storage/disk scanning
 * and raw key exfiltration, not malware targeting this SDK or a fully
 * compromised page — a same-origin script can still drive this adapter to
 * decrypt.
 *
 * @public
 */
export const localStorageAdapter: StorageAdapter = {
  async get(key: string): Promise<string | null> {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) {
        return null
      }
      const masterKey = await getMasterKey()
      if (!masterKey) {
        return null
      }
      const combined = base64ToBytes(raw)
      const iv = combined.slice(0, IV_BYTE_LENGTH)
      const ciphertext = combined.slice(IV_BYTE_LENGTH)
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        masterKey,
        ciphertext
      )
      return new TextDecoder().decode(plaintext)
    } catch {
      return null
    }
  },

  async set(key: string, value: string): Promise<void> {
    try {
      const masterKey = await getMasterKey()
      if (!masterKey) {
        return
      }
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH))
      const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          masterKey,
          new TextEncoder().encode(value)
        )
      )
      const combined = new Uint8Array(iv.length + ciphertext.length)
      combined.set(iv, 0)
      combined.set(ciphertext, iv.length)
      localStorage.setItem(key, bytesToBase64(combined))
    } catch {
      // localStorage/crypto unavailable or encryption failed — never persist plaintext
    }
  },

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key)
    } catch {
      // localStorage not available
    }
  },
}
