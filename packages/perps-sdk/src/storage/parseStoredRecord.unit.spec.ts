import { describe, expect, it, vi } from 'vitest'
import { parseStoredRecord, readValidatedRecord } from './parseStoredRecord.js'
import { createMemoryStorage } from './storage.js'
import type { StorageAdapter } from './types.js'

interface Sample {
  id: number
  name: string
}

const isSample = (v: unknown): v is Sample =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Sample).id === 'number' &&
  Number.isFinite((v as Sample).id) &&
  typeof (v as Sample).name === 'string'

const VALID: Sample = { id: 1, name: 'ok' }

describe('parseStoredRecord', () => {
  it('returns null for an absent (null) record', () => {
    expect(parseStoredRecord(null, isSample)).toBeNull()
  })

  it('returns the parsed value when it satisfies the guard', () => {
    expect(parseStoredRecord(JSON.stringify(VALID), isSample)).toEqual(VALID)
  })

  it('returns null for unparseable JSON instead of throwing', () => {
    expect(parseStoredRecord('{not json', isSample)).toBeNull()
  })

  it('returns null for a structurally-valid JSON that fails the guard', () => {
    expect(parseStoredRecord(JSON.stringify({ id: 'x' }), isSample)).toBeNull()
  })

  it('returns null for a partial record missing a required field', () => {
    expect(parseStoredRecord(JSON.stringify({ id: 1 }), isSample)).toBeNull()
  })
})

describe('readValidatedRecord', () => {
  const KEY = 'k'

  it('returns the validated value and leaves storage intact', async () => {
    const storage = createMemoryStorage()
    await storage.set(KEY, JSON.stringify(VALID))

    const removeSpy = vi.spyOn(storage, 'remove')
    expect(await readValidatedRecord(storage, KEY, isSample)).toEqual(VALID)
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('returns null without evicting when the key is genuinely absent', async () => {
    const storage = createMemoryStorage()
    const removeSpy = vi.spyOn(storage, 'remove')

    expect(await readValidatedRecord(storage, KEY, isSample)).toBeNull()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('evicts a present-but-poisoned record and returns null', async () => {
    const storage = createMemoryStorage()
    await storage.set(KEY, '{corrupt')
    const removeSpy = vi.spyOn(storage, 'remove')

    expect(await readValidatedRecord(storage, KEY, isSample)).toBeNull()
    expect(removeSpy).toHaveBeenCalledWith(KEY)
    expect(await storage.get(KEY)).toBeNull()
  })

  it('evicts a present record that fails the guard', async () => {
    const storage: StorageAdapter = createMemoryStorage()
    await storage.set(KEY, JSON.stringify({ id: 1 }))

    expect(await readValidatedRecord(storage, KEY, isSample)).toBeNull()
    expect(await storage.get(KEY)).toBeNull()
  })
})
