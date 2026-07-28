import type { HlWsFastAssetCtx } from '../types/index.js'

/**
 * Decode a base64-encoded raw-DEFLATE payload and parse its UTF-8 JSON body.
 * @typeParam T - Expected shape of the decoded JSON value.
 * @throws If decompression or JSON parsing fails.
 * @public
 */
export async function decodeCompressedJson<T>(base64: string): Promise<T> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const stream = new DecompressionStream('deflate-raw')
  const text = new Response(stream.readable).text()
  const writer = stream.writable.getWriter()
  // Write-side failures (bad DEFLATE) also error the readable and reject
  // `text`; detach these rejections to avoid unhandled duplicates.
  writer.write(bytes).catch(() => undefined)
  writer.close().catch(() => undefined)
  return JSON.parse(await text) as T
}

/**
 * Decode a Hyperliquid `fastAssetCtxs` frame. HL sends the payload as a
 * base64-encoded, raw-DEFLATE-compressed (RFC 1951 — no zlib/gzip wrapper) JSON
 * object keyed by coin. Decoded via the web-standard `DecompressionStream`
 * (Node 18+, modern browsers), so no dependency is needed.
 *
 * @throws If the input is not valid base64 / raw-DEFLATE / JSON.
 * @public
 */
export async function decodeFastAssetCtxs(
  base64: string
): Promise<Record<string, HlWsFastAssetCtx>> {
  return decodeCompressedJson<Record<string, HlWsFastAssetCtx>>(base64)
}
