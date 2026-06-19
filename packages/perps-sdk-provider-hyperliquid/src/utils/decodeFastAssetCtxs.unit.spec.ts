import { describe, expect, it } from 'vitest'
import { decodeFastAssetCtxs } from './decodeFastAssetCtxs.js'

/** Compress + base64 a payload exactly as HL frames `fastAssetCtxs`. */
const encode = async (obj: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  const buf = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (const b of buf) {
    bin += String.fromCharCode(b)
  }
  return btoa(bin)
}

describe('decodeFastAssetCtxs', () => {
  it('base64-decodes and raw-DEFLATE-inflates a fastAssetCtxs payload', async () => {
    const payload = {
      BTC: { markPx: '97500.5', midPx: '97499.0' },
      'xyz:NVDA': { markPx: '145.2' },
    }
    const encoded = await encode(payload)

    expect(encoded).not.toContain('BTC') // proves it is compressed, not raw JSON
    await expect(decodeFastAssetCtxs(encoded)).resolves.toEqual(payload)
  })

  it('preserves a null midPx (empty book)', async () => {
    const encoded = await encode({ BTC: { markPx: '97500.5', midPx: null } })
    await expect(decodeFastAssetCtxs(encoded)).resolves.toEqual({
      BTC: { markPx: '97500.5', midPx: null },
    })
  })

  it('rejects malformed input', async () => {
    await expect(decodeFastAssetCtxs('not-valid-deflate')).rejects.toThrow()
  })
})
