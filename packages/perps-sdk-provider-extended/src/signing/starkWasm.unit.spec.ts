import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const sha256 = (path: string | URL): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

const manifest = JSON.parse(
  readFileSync(
    new URL('../../wasm/extended-stark.manifest.json', import.meta.url),
    'utf8'
  )
)
const require = createRequire(import.meta.url)

describe('vendored Stark signer binary', () => {
  it('matches its manifest', () => {
    expect(
      sha256(new URL('../../wasm/extended-stark.wasm', import.meta.url))
    ).toBe(manifest.sha256)
  })

  it('comes from the installed JS glue version (run scripts/sync-stark-wasm.mjs after a bump)', () => {
    const upstream = require.resolve(`${manifest.package}/package.json`)
    expect(JSON.parse(readFileSync(upstream, 'utf8')).version).toBe(
      manifest.version
    )
    expect(
      sha256(
        upstream.replace(/package\.json$/, 'stark_crypto_wrapper_wasm_bg.wasm')
      )
    ).toBe(manifest.sha256)
  })
})
