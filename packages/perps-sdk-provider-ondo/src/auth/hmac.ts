/** @internal */
export interface OndoHmacRequest {
  /** Milliseconds since epoch; Ondo enforces a 30-second signing window. */
  timestampMs: number
  method: string
  /** Venue-relative path including any query string. */
  pathWithQuery: string
  /** Pre-serialized body, signed verbatim; empty for bodyless requests. */
  body?: string
}

const encoder = new TextEncoder()

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

/**
 * Compute Ondo's per-request HMAC-SHA256 signature, hex-encoded. The signed
 * message concatenates timestamp, upper-cased method, path-with-query, and the
 * verbatim body with no separators.
 *
 * @param apiSecret - the API key's secret, used as the HMAC key.
 * @internal
 */
export async function hmacSignRequest(
  apiSecret: string,
  request: OndoHmacRequest
): Promise<string> {
  const message = `${request.timestampMs}${request.method.toUpperCase()}${request.pathWithQuery}${request.body ?? ''}`
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  )
  return toHex(signature)
}
