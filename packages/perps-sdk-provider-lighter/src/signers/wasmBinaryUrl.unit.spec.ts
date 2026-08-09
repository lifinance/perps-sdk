import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  lighterWasmBinaryUrl,
  resolveEmittedBinaryUrl,
} from './wasmBinaryUrl.js'

const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d])
const packageRoot = join(import.meta.dirname, '..', '..')

describe('packaged signer binary resolvers', () => {
  it('points Node ESM at the packaged binary', () => {
    expect(lighterWasmBinaryUrl.protocol).toBe('file:')
    expect(lighterWasmBinaryUrl.pathname).toBe(
      join(packageRoot, 'wasm', 'lighter-signer.wasm')
    )
    expect(readFileSync(lighterWasmBinaryUrl).subarray(0, 4)).toEqual(
      WASM_MAGIC
    )
  })

  it('resolves the same binary from the CommonJS twin', () => {
    const { lighterWasmBinaryUrl: fromCjs } = createRequire(import.meta.url)(
      './wasmBinaryUrl.cjs'
    ) as { lighterWasmBinaryUrl: URL }

    expect(fromCjs.href).toBe(lighterWasmBinaryUrl.href)
  })

  it('offers no emitted-asset recovery under CommonJS', async () => {
    const { resolveEmittedBinaryUrl: fromCjs } = createRequire(import.meta.url)(
      './wasmBinaryUrl.cjs'
    ) as { resolveEmittedBinaryUrl: () => Promise<URL | undefined> }

    await expect(fromCjs()).resolves.toBeUndefined()
  })

  it('keeps the recovery import behind webpack and Turbopack ignore comments', () => {
    // Both bundlers rewrite the static URL correctly and cannot compile Vite's
    // `?url` query, so following this import would break their builds.
    const source = readFileSync(
      join(packageRoot, 'src', 'signers', 'wasmBinaryUrl.js'),
      'utf8'
    )

    expect(source).toContain(
      "import(\n    /* webpackIgnore: true */ /* turbopackIgnore: true */ './wasmBinaryUrl.vite.js'\n  )"
    )
  })

  it('recovers Vite emitted asset URLs when the bundler provides one', async () => {
    // Vitest resolves `?url` the same way Vite does, so the recovery twin loads
    // here and yields the packaged binary rather than the cache-relative path.
    const emitted = await resolveEmittedBinaryUrl()

    expect(emitted).toBeInstanceOf(URL)
    expect(emitted?.pathname).toContain('lighter-signer')
  })
})
