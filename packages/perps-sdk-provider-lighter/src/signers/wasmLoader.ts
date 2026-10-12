// The Go runtime installs the `_`-prefixed signer functions onto `globalThis`
// when `go.run(instance)` starts the main goroutine.

import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { createGoRuntime } from './generated/wasmExecRuntime.js'
import {
  lighterWasmBinaryUrl,
  resolveEmittedBinaryUrl,
} from './wasmBinaryUrl.js'

/**
 * Pending result of a signer export. lighter-go `web-wasm` returns a function
 * that starts the work and returns a Promise; an export may also return the
 * Promise itself.
 *
 * @public
 */
export type LighterWasmPending<T> =
  | (() => Promise<T | LighterWasmError>)
  | Promise<T | LighterWasmError>

/** @public */
export interface LighterWasmError {
  error: string
}

/**
 * L1 message an Ethereum wallet must sign before the matching `_sign*` call.
 * `pubKeySuccess` is false when the Go side could not build `body`.
 *
 * @public
 */
export interface LighterWasmL1Body {
  body: string
  pubKeySuccess: boolean
}

/**
 * Client created from a seed or a private key. `pk` and `prv` are hex without
 * a `0x` prefix; `body` is the ChangePubKey L1 message for the creation nonce.
 *
 * @public
 */
export interface LighterWasmClient extends LighterWasmL1Body {
  pk: string
  prv: string
}

/** @public */
export interface LighterWasmTx {
  txHash: string
  txInfo: string
}

/** Auth token with a one-hour deadline that the Go side sets. @public */
export interface LighterWasmAuthToken {
  token: string
  deadline: number
}

/**
 * A transfer memo: 32 byte values. The Go side ignores a memo that is not a
 * JS Array, and signs a zero memo instead.
 *
 * @public
 */
export type LighterWasmMemo = number[]

/**
 * Function table that lighter-go `web-wasm` installs. The Go side holds one
 * client per account index, so every export after `_createClient` /
 * `_createClientByPrv` signs with the latest client for its account. A
 * non-number where Go reads an integer panics and stops the Go runtime.
 * Amounts that the Go side parses as text must be decimal integer strings.
 *
 * @public
 */
export interface LighterWasmExports {
  _createClient: (
    seed: string,
    chainId: number,
    accountIndex: number,
    nonce: number,
    apiKeyIndex: number,
    skipNonce: boolean
  ) => LighterWasmPending<LighterWasmClient>
  _createClientByPrv: (
    privateKey: string,
    chainId: number,
    accountIndex: number,
    nonce: number,
    apiKeyIndex: number,
    skipNonce: boolean
  ) => LighterWasmPending<LighterWasmClient>
  _createAuthToken: (
    accountIndex: number,
    apiKeyIndex: number
  ) => LighterWasmPending<LighterWasmAuthToken>
  _getChangePubKeyTransaction: (
    accountIndex: number,
    nonce: number,
    apiKeyIndex: number
  ) => LighterWasmPending<LighterWasmL1Body>
  _signChangePubKey: (
    accountIndex: number,
    l1Signature: string,
    nonce: number,
    apiKeyIndex: number
  ) => LighterWasmPending<LighterWasmTx>
  /** `orderExpiry` -1 means 28 days from the Go clock. A nil (0) integrator value leaves that attribute unset. */
  _signCreateOrder: (
    accountIndex: number,
    marketIndex: number,
    clientOrderIndex: number,
    baseAmount: string,
    price: string,
    isAsk: number,
    orderType: number,
    timeInForce: number,
    reduceOnly: number,
    triggerPrice: string,
    orderExpiry: number,
    nonce: number,
    integratorAccountIndex: number,
    integratorTakerFee: number,
    integratorMakerFee: number
  ) => LighterWasmPending<LighterWasmTx>
  _signCancelOrder: (
    accountIndex: number,
    marketIndex: number,
    orderIndex: string,
    nonce: number
  ) => LighterWasmPending<LighterWasmTx>
  /** An omitted `cancelMarketIndex`, or 255, cancels on every market. */
  _signCancelAllOrders: (
    accountIndex: number,
    timeInForce: number,
    time: number,
    nonce: number,
    cancelMarketIndex?: number
  ) => LighterWasmPending<LighterWasmTx>
  _signModifyOrder: (
    accountIndex: number,
    marketIndex: number,
    orderIndex: string,
    baseAmount: number,
    price: number,
    triggerPrice: number,
    nonce: number
  ) => LighterWasmPending<LighterWasmTx>
  _getTransferTransaction: (
    accountIndex: number,
    nonce: number,
    apiKeyIndex: number,
    toAccountIndex: number,
    assetIndex: number,
    fromRouteType: number,
    toRouteType: number,
    amount: number,
    usdcFee: number,
    memo: LighterWasmMemo
  ) => LighterWasmPending<LighterWasmL1Body>
  /** An empty `l1Signature` leaves `L1Sig` empty. */
  _signTransfer: (
    accountIndex: number,
    l1Signature: string,
    nonce: number,
    apiKeyIndex: number,
    toAccountIndex: number,
    assetIndex: number,
    fromRouteType: number,
    toRouteType: number,
    amount: number,
    usdcFee: number,
    memo: LighterWasmMemo
  ) => LighterWasmPending<LighterWasmTx>
  _signWithdraw: (
    accountIndex: number,
    assetIndex: number,
    routeType: number,
    amount: string,
    nonce: number
  ) => LighterWasmPending<LighterWasmTx>
  _signUpdateLeverage: (
    accountIndex: number,
    marketIndex: number,
    fraction: number,
    marginMode: number,
    nonce: number
  ) => LighterWasmPending<LighterWasmTx>
  _signUpdateMargin: (
    accountIndex: number,
    marketIndex: number,
    usdcAmount: number,
    direction: number,
    nonce: number
  ) => LighterWasmPending<LighterWasmTx>
  /** Fees are uint32 ppm of `FeeTick` (1_000_000). */
  _getApproveIntegratorTransaction: (
    accountIndex: number,
    nonce: number,
    apiKeyIndex: number,
    integratorAccountIndex: number,
    maxPerpsTakerFee: number,
    maxPerpsMakerFee: number,
    maxSpotTakerFee: number,
    maxSpotMakerFee: number,
    approvalExpiry: number
  ) => LighterWasmPending<LighterWasmL1Body>
  /** An empty `l1Signature` leaves `L1Sig` empty. */
  _signApproveIntegrator: (
    accountIndex: number,
    l1Signature: string,
    nonce: number,
    apiKeyIndex: number,
    integratorAccountIndex: number,
    maxPerpsTakerFee: number,
    maxPerpsMakerFee: number,
    maxSpotTakerFee: number,
    maxSpotMakerFee: number,
    approvalExpiry: number
  ) => LighterWasmPending<LighterWasmTx>
  /** `accountTradingMode`: 0 = Classic/Simple, 1 = Unified. */
  _signUpdateAccountConfig: (
    accountIndex: number,
    accountTradingMode: number,
    nonce: number
  ) => LighterWasmPending<LighterWasmTx>
  /** `assetMarginMode`: 0 = MarginDisabled, 1 = MarginEnabled. */
  _signUpdateAccountAssetConfig: (
    accountIndex: number,
    assetIndex: number,
    assetMarginMode: number,
    nonce: number
  ) => LighterWasmPending<LighterWasmTx>
}

const WASM_FUNCTION_NAMES = [
  '_createClientByPrv',
  '_createClient',
  '_createAuthToken',
  '_getChangePubKeyTransaction',
  '_signChangePubKey',
  '_signCreateOrder',
  '_signCancelOrder',
  '_signCancelAllOrders',
  '_signModifyOrder',
  '_getTransferTransaction',
  '_signTransfer',
  '_signWithdraw',
  '_signUpdateLeverage',
  '_signUpdateMargin',
  '_getApproveIntegratorTransaction',
  '_signApproveIntegrator',
  '_signUpdateAccountConfig',
  '_signUpdateAccountAssetConfig',
] as const satisfies readonly (keyof LighterWasmExports)[]

// Installed by the binary but never called. They are removed from globalThis
// with the used exports, because each one signs with the account's API key.
const UNUSED_WASM_FUNCTION_NAMES = [
  '_signRevokePubKey',
  '_getRevokePubKeyTransaction',
  '_signCreateSubAccount',
  '_signCreatePublicPool',
  '_signUpdatePublicPool',
  '_signMintShares',
  '_signBurnShares',
  '_signCreateGroupedOrders',
  '_getAirdropAllocationMessage',
  '_signStakeAssets',
  '_signUnstakeAssets',
] as const

/**
 * Call one signer export and wait for its result. A `{error}` result becomes a
 * {@link PerpsError} with code `SignatureInvalid`.
 *
 * @internal
 */
export async function callLighterWasm<T>(
  label: string,
  pending: LighterWasmPending<T>
): Promise<T> {
  const result = await (typeof pending === 'function' ? pending() : pending)
  if (isWasmError(result)) {
    throw new PerpsError(
      PerpsErrorCode.SignatureInvalid,
      `Lighter ${label} failed: ${result.error}`
    )
  }
  return result
}

function isWasmError<T>(
  result: T | LighterWasmError
): result is LighterWasmError {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    typeof result.error === 'string'
  )
}

let cachedExports: Promise<LighterWasmExports> | undefined

// `node:fs/promises` is Node-only and reached solely for a `file://` asset URL,
// which never happens in a browser. Both ignore comments are required: without
// `webpackIgnore` a Next.js build fails with `UnhandledSchemeError: Reading
// from "node:fs/promises" is not handled by plugins`, and Vite would otherwise
// warn while externalising it. Node's `readFile` accepts the `file://` URL
// directly, so no `node:url` hop is needed.
async function readNodeFile(url: URL): Promise<Uint8Array> {
  const { readFile } = await import(
    /* webpackIgnore: true */ /* @vite-ignore */ 'node:fs/promises'
  )
  return readFile(url)
}

// A dev server or static host that misses the asset answers with its SPA
// index.html instead of 404, so a wrong URL would otherwise reach the
// instantiator as `<!doctype` and fail with an opaque "magic word" error.
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d]

const isWasmModule = (bytes: ArrayBuffer): boolean => {
  const preamble = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  return WASM_MAGIC.every((byte, index) => preamble[index] === byte)
}

interface FetchedAsset {
  bytes: ArrayBuffer
  /** Content type and leading bytes, for the not-a-module diagnostic. */
  served: string
}

async function fetchWasmBinary(url: URL): Promise<FetchedAsset> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url.href}: ${response.status} ${response.statusText}`
    )
  }
  const bytes = await response.arrayBuffer()
  const preamble = Array.from(
    new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength)),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join(' ')
  return {
    bytes,
    served: `served ${
      response.headers.get('content-type') ?? 'no content type'
    } starting with ${preamble || '(empty response)'}`,
  }
}

async function readWasmBinary(url: URL): Promise<ArrayBuffer> {
  if (url.protocol === 'file:') {
    const bytes = await readNodeFile(url)
    // Copy the view into a fresh ArrayBuffer — `Buffer.buffer` is a shared
    // ArrayBuffer in Node and the wasm instantiator expects a plain one.
    const buffer = bytes.slice().buffer as ArrayBuffer
    if (!isWasmModule(buffer)) {
      throw new Error(`${url.href} is not a WebAssembly module.`)
    }
    return buffer
  }

  const fetched = await fetchWasmBinary(url)
  if (isWasmModule(fetched.bytes)) {
    return fetched.bytes
  }

  // The static URL missed, so this consumer's bundler relocated the module away
  // from the binary: fall back to the URL it emitted for the packaged asset.
  // That import lives in the hand-authored resolver so the per-bundler ignore
  // comments guarding Vite's `?url` twin survive into the published build.
  let recovery: string
  try {
    const emitted = await resolveEmittedBinaryUrl()
    if (emitted === undefined) {
      recovery = 'unavailable (no bundler asset pipeline)'
    } else {
      const recovered = await fetchWasmBinary(emitted)
      if (isWasmModule(recovered.bytes)) {
        return recovered.bytes
      }
      recovery = `${emitted.href} ${recovered.served}`
    }
  } catch (error) {
    recovery = `unavailable (${error instanceof Error ? error.message : String(error)})`
  }

  throw new Error(
    'The Lighter signer binary shipped with this package was not reachable: ' +
      `${url.href} ${fetched.served}; bundler-emitted asset ${recovery}.`
  )
}

/**
 * Load the Lighter WASM signer from the binary shipped with this package —
 * resolved by the package itself, so callers need no bundler configuration and
 * pass no URL. Memoized per-process: subsequent calls return the cached
 * exports, while a failed load is not cached — the next call retries. The Go
 * runtime keeps a long-running goroutine to service JS calls — we start it once
 * and never stop it.
 *
 * @public
 */
export async function loadLighterWasm(): Promise<LighterWasmExports> {
  if (!cachedExports) {
    const attempt = loadWasmUncached()
    cachedExports = attempt
    void attempt.catch(() => {
      // A reset may already have installed a replacement attempt.
      if (cachedExports === attempt) {
        cachedExports = undefined
      }
    })
  }
  return cachedExports
}

async function loadWasmUncached(): Promise<LighterWasmExports> {
  const wasmBytes = await readWasmBinary(lighterWasmBinaryUrl)

  const go = createGoRuntime()
  const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject)
  // Start the Go goroutine — this never resolves until the Go main() returns,
  // which our signer never does. Intentionally not awaited.
  void go.run(instance)

  // Wait microtasks to let Go's init() register JS-bound functions.
  await yieldToGoRuntime()

  // Go's main.go only calls `js.Global().Set(name, ...)`; it never reads those
  // names back, so dispatch survives the deletion while the captured handle
  // keeps working. Left installed, they let any same-origin script sign with
  // the API key held inside the instance. Never restore them for convenience.
  const globals = globalThis as Record<string, unknown>
  const exports: Partial<LighterWasmExports> = {}
  for (const name of WASM_FUNCTION_NAMES) {
    const fn = globals[name]
    if (typeof fn !== 'function') {
      throw new Error(
        `Lighter WASM did not export expected function: ${name}. ` +
          'The .wasm binary may be stale or incompatible.'
      )
    }
    ;(exports as Record<string, unknown>)[name] = fn
    delete globals[name]
  }
  for (const name of UNUSED_WASM_FUNCTION_NAMES) {
    delete globals[name]
  }

  return exports as LighterWasmExports
}

async function yieldToGoRuntime(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await new Promise<void>((resolve) => {
      if (typeof setImmediate === 'function') {
        setImmediate(resolve)
      } else {
        setTimeout(resolve, 0)
      }
    })
  }
}

/**
 * Testing helper — drop the cached WASM instance so the next load reinitializes.
 *
 * @internal
 */
export function resetLighterWasmCache(): void {
  cachedExports = undefined
}
