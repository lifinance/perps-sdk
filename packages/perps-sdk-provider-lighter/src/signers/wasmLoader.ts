// The Go runtime installs functions (SignCreateOrder, SignCancelOrder, etc.)
// onto `globalThis` when `go.run(instance)` starts the main goroutine.

import { WASM_EXEC_JS } from './generated/wasmExecRuntime.js'
import { lighterWasmBinaryUrl } from './wasmBinaryUrl.js'

/**
 * Function table installed by the Lighter Go WASM runtime. Methods mirror the
 * venue signer ABI and return a result containing either signed transaction
 * fields or an error; positional argument contracts are documented per method.
 *
 * @public
 */
export interface LighterWasmExports {
  GenerateAPIKey: () => {
    publicKey?: string
    privateKey?: string
    error?: string
  }
  CreateClient: (
    url: string,
    privateKey: string,
    chainId: number,
    apiKeyIndex: number,
    accountIndex: number
  ) => { error?: string }
  CheckClient: (apiKeyIndex: number, accountIndex: number) => { error?: string }
  /**
   * Returns `{authToken}` on success — note the field name is `authToken`,
   * NOT `token`. Reading the wrong field silently fails (Go sets nothing
   * else on the result), which is why early code paths returned undefined
   * tokens with no error.
   */
  CreateAuthToken: (
    deadline: number,
    apiKeyIndex: number,
    accountIndex: number
  ) => { authToken?: string; error?: string }
  /**
   * Signature mirrors lighter-python's `signer.SignChangePubKey(...)` call —
   * 5 positional args including `skipNonce` (use 0 to embed our supplied
   * nonce; 1 to leave it out for server-fill scenarios). Earlier versions
   * here had only 4 args, which silently shifted all arguments by one and
   * produced txInfo with garbage AccountIndex / ApiKeyIndex fields →
   * Lighter rejected with code 20001 "invalid param".
   */
  SignChangePubKey: (
    pubKeyHex: string,
    skipNonce: number,
    nonce: number,
    apiKeyIndex: number,
    accountIndex: number
  ) => SignResult & { messageToSign?: string }
  /**
   * Go WASM exports take positional primitives, so TS cannot type the
   * arguments — `WASM_FUNCTION_NAMES` only validates that each function
   * *exists* at load time, never its arity or order. A `.wasm` bump that
   * shifts or adds an argument therefore compiles, passes the existence
   * check, and only fails at runtime (Lighter code 20001 "invalid param").
   * The expected positional contract below is the authority; it MUST stay in
   * sync with the call site in `LighterSigner.dispatch`. All sign exports end
   * with `(nonce, apiKeyIndex, accountIndex)`.
   *
   * 19 args: marketIndex, clientOrderIndex, baseAmount, price, isAsk,
   * orderType, timeInForce, reduceOnly, triggerPrice, orderExpiry,
   * integratorAccountIndex, integratorTakerFee, integratorMakerFee,
   * selfTradeBehaviorMode, selfTradeEqualityMode, skipNonce, then the trailing
   * three.
   */
  SignCreateOrder: (...args: unknown[]) => SignResult
  /** 6 args: marketIndex, orderIndex, skipNonce, then the trailing three. */
  SignCancelOrder: (...args: unknown[]) => SignResult
  /**
   * 7 args: timeInForce, time, cancelAllMarketIndex, skipNonce, then the
   * trailing three.
   */
  SignCancelAllOrders: (...args: unknown[]) => SignResult
  /**
   * 11 args: toAccountIndex, assetIndex, fromRouteType, toRouteType, amount,
   * usdcFee, memo, skipNonce, then the trailing three. `memo` is copied into a
   * Go `[32]byte`, so its UTF-8 byte length must be exactly 32 or Go rejects it
   * before signing.
   */
  SignTransfer: (...args: unknown[]) => SignResult
  /** 7 args: assetIndex, routeType, amount, skipNonce, then the trailing three. */
  SignWithdraw: (...args: unknown[]) => SignResult
  /**
   * 7 args: marketIndex, fraction, marginMode, skipNonce, then the trailing
   * three.
   */
  SignUpdateLeverage: (...args: unknown[]) => SignResult
  /**
   * 14 args: marketIndex, orderIndex, baseAmount, price, triggerPrice,
   * integratorAccountIndex, integratorTakerFee, integratorMakerFee,
   * selfTradeBehaviorMode, selfTradeEqualityMode, skipNonce, then the trailing
   * three.
   */
  SignModifyOrder: (...args: unknown[]) => SignResult
  /**
   * 7 args: marketIndex, usdcAmount, direction, skipNonce, then the trailing
   * three.
   */
  SignUpdateMargin: (...args: unknown[]) => SignResult
  /**
   * 10 args: integratorAccountIndex, maxPerpsTakerFee, maxPerpsMakerFee,
   * maxSpotTakerFee, maxSpotMakerFee, approvalExpiry, skipNonce, then the
   * trailing three. Fees are uint32 ppm of `FeeTick` (1_000_000); a non-nil
   * fee requires a non-nil integrator index. `messageToSign` is the EIP-191
   * `L2ApproveIntegrator` L1 body the user's wallet must countersign — the
   * venue rejects the tx without the resulting `L1Sig`.
   */
  SignApproveIntegrator: (
    ...args: unknown[]
  ) => SignResult & { messageToSign?: string }
  /**
   * 5 args: accountTradingMode (0 = Classic/Simple, 1 = Unified), skipNonce,
   * then the trailing three. `accountTradingMode` is validated to {0, 1} by
   * lighter-go before signing.
   */
  SignUpdateAccountConfig: (...args: unknown[]) => SignResult
  /**
   * 6 args: assetIndex, assetMarginMode (0 = MarginDisabled, 1 = MarginEnabled),
   * skipNonce, then the trailing three. Keyed per spot asset, not per market —
   * signs `L2UpdateAccountAssetConfigTx` (tx type 42).
   */
  SignUpdateAccountAssetConfig: (...args: unknown[]) => SignResult
}

/** @internal */
export interface SignResult {
  txType?: number
  txInfo?: string
  txHash?: string
  error?: string
}

const WASM_FUNCTION_NAMES = [
  'GenerateAPIKey',
  'CreateClient',
  'CheckClient',
  'CreateAuthToken',
  'SignChangePubKey',
  'SignCreateOrder',
  'SignCancelOrder',
  'SignCancelAllOrders',
  'SignTransfer',
  'SignWithdraw',
  'SignUpdateLeverage',
  'SignModifyOrder',
  'SignUpdateMargin',
  'SignApproveIntegrator',
  'SignUpdateAccountConfig',
  'SignUpdateAccountAssetConfig',
] as const

type GoClass = new () => {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
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

async function readWasmBinary(url: URL): Promise<ArrayBuffer> {
  if (url.protocol === 'file:') {
    const bytes = await readNodeFile(url)
    // Copy the view into a fresh ArrayBuffer — `Buffer.buffer` is a shared
    // ArrayBuffer in Node and the wasm instantiator expects a plain one.
    return bytes.slice().buffer as ArrayBuffer
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url.href}: ${response.status} ${response.statusText}`
    )
  }
  return response.arrayBuffer()
}

/**
 * Load the Lighter WASM signer from the binary shipped with this package.
 * Memoized per-process: subsequent calls return the cached exports. The Go
 * runtime keeps a long-running goroutine to service JS calls — we start it
 * once and never stop it.
 * @internal
 */
export async function loadLighterWasm(): Promise<LighterWasmExports> {
  if (!cachedExports) {
    cachedExports = loadWasmUncached()
  }
  return cachedExports
}

async function loadWasmUncached(): Promise<LighterWasmExports> {
  const wasmBytes = await readWasmBinary(lighterWasmBinaryUrl)

  // wasm_exec.js is an IIFE that installs `globalThis.Go = class { ... }` plus
  // fs/process/crypto polyfills. Evaluating the packaged text keeps Go's runtime
  // opaque to consumer bundlers — it references require/process/fs/crypto, which
  // Vite/webpack choke on if they try to parse it as a module. The text is
  // generated from this package's vendored wasm_exec.js at build time and is
  // never caller-supplied.
  // nosec
  const installGo = new Function(`${WASM_EXEC_JS}; return globalThis.Go`)
  const Go = installGo() as GoClass

  const go = new Go()
  const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject)
  // Start the Go goroutine — this never resolves until the Go main() returns,
  // which our signer never does. Intentionally not awaited.
  void go.run(instance)

  // Wait microtasks to let Go's init() register JS-bound functions.
  await yieldToGoRuntime()

  const exports: Partial<LighterWasmExports> = {}
  for (const name of WASM_FUNCTION_NAMES) {
    const fn = (globalThis as Record<string, unknown>)[name]
    if (typeof fn !== 'function') {
      throw new Error(
        `Lighter WASM did not export expected function: ${name}. ` +
          'The .wasm binary may be stale or incompatible.'
      )
    }
    ;(exports as Record<string, unknown>)[name] = fn
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
