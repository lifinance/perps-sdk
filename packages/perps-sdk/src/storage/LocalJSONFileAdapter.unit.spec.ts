import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalJSONFileAdapter } from './LocalJSONFileAdapter.js'

describe('LocalJSONFileAdapter', () => {
  let directory: string
  let file: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'perps-storage-'))
    file = join(directory, 'storage.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('retains opaque credentials across instances and removes only the selected key', async () => {
    const storage = new LocalJSONFileAdapter(file)
    await expect(storage.get('agent')).resolves.toBeNull()
    await storage.remove('agent')
    await storage.set('agent', 'first')
    await storage.set('agent', '  second\n')
    await storage.set('__proto__', 'another credential')

    const reopened = new LocalJSONFileAdapter(file)
    await expect(reopened.get('agent')).resolves.toBe('  second\n')
    await reopened.remove('agent')
    await expect(storage.get('agent')).resolves.toBeNull()
    await expect(storage.get('__proto__')).resolves.toBe('another credential')
    if (process.platform !== 'win32') {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
  })

  it('preserves both credentials when writes overlap on one adapter', async () => {
    const storage = new LocalJSONFileAdapter(file)
    await Promise.all([
      storage.set('first', 'one'),
      storage.set('second', 'two'),
    ])
    await expect(storage.get('first')).resolves.toBe('one')
    await expect(storage.get('second')).resolves.toBe('two')
  })

  it('does not overwrite a corrupt file or include its contents in the error', async () => {
    const contents = 'sensitive-credential-not-valid-json'
    await writeFile(file, contents)
    const storage = new LocalJSONFileAdapter(file)

    await expect(storage.set('agent', 'new')).rejects.toThrow(/invalid JSON/i)
    await expect(storage.get('agent')).rejects.not.toThrow(contents)
    await expect(readFile(file, 'utf8')).resolves.toBe(contents)
  })
})
