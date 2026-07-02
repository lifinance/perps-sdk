import { describe, expect, it } from 'vitest'
import {
  decodeCompressedJson,
  decodeFastAssetCtxs,
} from './decodeFastAssetCtxs.js'

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

// Naive-idiom reference decode (per-character base64 callback, Blob + Response
// plumbing); the production decode must match it byte for byte.
const referenceDecodeText = async (base64: string): Promise<string> => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

describe('decodeCompressedJson', () => {
  it('is byte-identical to the reference idiom across every code unit', async () => {
    // A payload that is a single JSON string makes the decoded value the
    // decompressed text itself, so string equality proves the base64 +
    // inflate pipeline is byte-identical. Cover every BMP code unit plus
    // supplementary-plane pairs (1–4-byte UTF-8 sequences).
    let text = ''
    for (let code = 0; code <= 0xffff; code++) {
      if (code >= 0xd800 && code <= 0xdfff) {
        continue
      }
      text += String.fromCharCode(code)
    }
    text += '\u{10000}\u{1f600}\u{10ffff}'
    const encoded = await encode(text)

    const decoded = await decodeCompressedJson<string>(encoded)
    expect(decoded).toBe(JSON.parse(await referenceDecodeText(encoded)))
    expect(decoded).toBe(text)
  })

  it('decodes a multi-chunk payload identically to the reference idiom', async () => {
    // Large enough that DecompressionStream emits multiple chunks.
    const payload = {
      ctxs: Array.from({ length: 20_000 }, (_, i) => ({
        coin: `COIN${i}`,
        markPx: `${i}.5`,
        midPx: `${i}.25`,
      })),
    }
    const encoded = await encode(payload)

    const decoded = await decodeCompressedJson<typeof payload>(encoded)
    expect(decoded).toEqual(JSON.parse(await referenceDecodeText(encoded)))
    expect(decoded.ctxs).toHaveLength(20_000)
    expect(decoded.ctxs[19_999]).toEqual({
      coin: 'COIN19999',
      markPx: '19999.5',
      midPx: '19999.25',
    })
  })
})
