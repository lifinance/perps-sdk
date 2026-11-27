import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StorageAdapter } from './types.js'

/** Stores credentials as plaintext JSON. Use one writer per file. */
export class LocalJSONFileAdapter implements StorageAdapter {
  private readonly file: string
  private pending = Promise.resolve()

  constructor(file: string | URL) {
    this.file = resolve(typeof file === 'string' ? file : fileURLToPath(file))
  }

  async get(key: string): Promise<string | null> {
    await this.pending
    return (await this.read()).get(key) ?? null
  }

  set(key: string, value: string): Promise<void> {
    return this.update((values) => {
      values.set(key, value)
    })
  }

  remove(key: string): Promise<void> {
    return this.update((values) => values.delete(key))
  }

  private async read(): Promise<Map<string, string>> {
    let contents: string
    try {
      contents = await readFile(this.file, 'utf8')
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return new Map()
      }
      throw error
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      throw new Error('Credential storage contains invalid JSON.')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Credential storage must contain a JSON object.')
    }
    const values = new Map<string, string>()
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new Error('Credential storage values must be strings.')
      }
      values.set(key, value)
    }
    return values
  }

  private update(change: (values: Map<string, string>) => void): Promise<void> {
    const operation = this.pending.then(async () => {
      const values = await this.read()
      change(values)
      const temp = `${this.file}.${randomUUID()}.tmp`
      try {
        await writeFile(temp, JSON.stringify(Object.fromEntries(values)), {
          flag: 'wx',
          mode: 0o600,
        })
        await rename(temp, this.file)
      } finally {
        await rm(temp, { force: true })
      }
    })
    this.pending = operation.catch(() => {})
    return operation
  }
}
