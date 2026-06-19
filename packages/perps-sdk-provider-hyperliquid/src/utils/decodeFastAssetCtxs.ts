import type { HlWsFastAssetCtx } from '../types/index.js'

/**
 * Decode a Hyperliquid `fastAssetCtxs` frame. HL sends the payload as a
 * base64-encoded, raw-DEFLATE-compressed (RFC 1951 — no zlib/gzip wrapper) JSON
 * object keyed by coin. Decoded via the web-standard `DecompressionStream`
 * (Node 18+, modern browsers), so no dependency is needed.
 *
 * @throws If the input is not valid base64 / raw-DEFLATE / JSON.
 */
export async function decodeFastAssetCtxs(
  base64: string
): Promise<Record<string, HlWsFastAssetCtx>> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  const text = await new Response(stream).text()
  return JSON.parse(text)
}
