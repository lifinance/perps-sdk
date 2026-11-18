import * as starkWasm from '@x10xchange/stark-crypto-wrapper-wasm'
import { resolveEmittedBinaryUrl, starkWasmBinaryUrl } from './wasmBinaryUrl.js'

/** Extended's Stark signer, compiled from its Rust crypto library. @internal */
export type StarkWasm = Pick<
  typeof starkWasm,
  | 'generate_private_key_from_eth_signature'
  | 'sign_message'
  | 'get_order_msg'
  | 'get_transfer_msg'
  | 'get_withdraw_msg'
>

let cached: Promise<StarkWasm> | undefined

/**
 * Load the Stark signer from the binary shipped with this package, once per
 * process. A failed load is not cached, so the next call retries.
 *
 * @internal
 */
export function loadStarkWasm(): Promise<StarkWasm> {
  if (!cached) {
    const attempt = readWasmBinary(starkWasmBinaryUrl).then((bytes) => {
      starkWasm.initSync({ module: bytes })
      return starkWasm
    })
    cached = attempt
    void attempt.catch(() => {
      if (cached === attempt) {
        cached = undefined
      }
    })
  }
  return cached
}

// Node-only, reached for a `file://` URL. Without the ignore comments Next.js
// fails on the `node:` scheme and Vite warns while externalising it.
async function readNodeFile(url: URL): Promise<Uint8Array> {
  const { readFile } = await import(
    /* webpackIgnore: true */ /* @vite-ignore */ 'node:fs/promises'
  )
  return readFile(url)
}

// A dev server that misses the asset serves its SPA index.html instead of 404.
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d]

const isWasmModule = (bytes: ArrayBuffer): boolean => {
  const preamble = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  return WASM_MAGIC.every((byte, index) => preamble[index] === byte)
}

async function fetchWasmBinary(url: URL): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url.href}: ${response.status} ${response.statusText}`
    )
  }
  return response.arrayBuffer()
}

async function readWasmBinary(url: URL): Promise<ArrayBuffer> {
  if (url.protocol === 'file:') {
    const buffer = (await readNodeFile(url)).slice().buffer as ArrayBuffer
    if (!isWasmModule(buffer)) {
      throw new Error(`${url.href} is not a WebAssembly module.`)
    }
    return buffer
  }

  const bytes = await fetchWasmBinary(url)
  if (isWasmModule(bytes)) {
    return bytes
  }
  const emitted = await resolveEmittedBinaryUrl()
  if (emitted !== undefined) {
    const recovered = await fetchWasmBinary(emitted)
    if (isWasmModule(recovered)) {
      return recovered
    }
  }
  throw new Error(
    `The Extended Stark signer binary was not reachable at ${url.href}` +
      (emitted === undefined ? '.' : ` or ${emitted.href}.`)
  )
}
