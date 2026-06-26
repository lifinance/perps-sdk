// The Go runtime installs functions (SignCreateOrder, SignCancelOrder, etc.)
// onto `globalThis` when `go.run(instance)` starts the main goroutine.
//
// The default asset URLs resolve relative to this module's emitted JS file:
//   src/signers/../../wasm/lighter-signer.wasm     → package-root wasm/
//   dist/{esm,cjs}/signers/../../wasm/…            → dist/wasm/ (shared)
// The build script copies the wasm assets into both dist subtrees so the same
// relative path resolves at runtime regardless of which bundle is loaded.
//
// To resolve the module's own URL in both ESM (where `__filename` is absent)
// and CJS (where `import.meta.url` is a syntax error), we parse a stack trace
// — `currentModuleUrl` always appears as the first frame, and V8 includes the
// emitting file path regardless of module system. Callers can override both
// asset URLs via {@link LoadLighterWasmOptions} to bypass this heuristic.

function currentModuleUrl(): string {
  const cjsFilename = (globalThis as { __filename?: string }).__filename
  if (typeof cjsFilename === 'string' && cjsFilename.length > 0) {
    return `file://${cjsFilename}`
  }
  const stack = new Error().stack ?? ''
  // Stack frames look like one of:
  //   "    at currentModuleUrl (file:///abs/path/wasmLoader.js:29:10)"
  //   "    at currentModuleUrl (/abs/path/wasmLoader.js:29:10)"
  //   "    at currentModuleUrl (file:///abs/path/wasmLoader.ts:29:10)"  (vitest)
  //   "    at currentModuleUrl (http://localhost:5173/.../wasmLoader.ts?v=…:29:10)" (vite dev)
  const match = stack.match(/\(([^)]+wasmLoader\.[tj]s[^)]*)\)/)
  const frame = match?.[1] ?? ''
  const withoutPos = frame.replace(/:\d+:\d+$/, '')
  if (
    withoutPos.startsWith('file://') ||
    withoutPos.startsWith('http://') ||
    withoutPos.startsWith('https://')
  ) {
    return withoutPos
  }
  if (withoutPos.length > 0) {
    // Bare absolute path (Node CJS without `file://` prefix in some runners).
    return `file://${withoutPos}`
  }
  throw new Error(
    'Could not resolve the Lighter WASM loader module URL. Pass an explicit ' +
      '`wasmBinaryUrl` and `wasmExecJsUrl` to loadLighterWasm().'
  )
}

function defaultAssetUrl(filename: string): URL {
  return new URL(`../../wasm/${filename}`, currentModuleUrl())
}

/** @public */
export interface LoadLighterWasmOptions {
  /** Override URL for the `.wasm` binary (browser: fetch; Node: fs). */
  wasmBinaryUrl?: string | URL
  /** Override URL for Go's `wasm_exec.js` runtime. */
  wasmExecJsUrl?: string | URL
  /**
   * Pre-fetched source of Go's `wasm_exec.js`. Preferred over
   * `wasmExecJsUrl` for bundlers (Vite/webpack) that may transform a `.js`
   * URL on serve, breaking the IIFE that installs `globalThis.Go`. Pass via
   * a `?raw` import (Vite) or equivalent so the original source survives
   * intact.
   *
   * @security This string is evaluated via `new Function(...)`. The caller is
   * responsible for ensuring it originates from the bundled `wasm_exec.js`;
   * attacker-controlled content would execute arbitrary code in the host.
   */
  wasmExecJsSource?: string
}

/** @public */
export interface LighterWasmExports {
  GenerateAPIKey: (seed?: string) => {
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
   * 13 args: marketIndex, clientOrderIndex, baseAmount, price, isAsk,
   * orderType, timeInForce, reduceOnly, triggerPrice, orderExpiry, then the
   * trailing three.
   */
  SignCreateOrder: (...args: unknown[]) => SignResult
  /** 5 args: marketIndex, orderIndex, then the trailing three. */
  SignCancelOrder: (...args: unknown[]) => SignResult
  /** 5 args: timeInForce, timestampMs, then the trailing three. */
  SignCancelAllOrders: (...args: unknown[]) => SignResult
  /**
   * 7 args: toAccount, usdcAmount, fee, memo, then the trailing three. `memo`
   * is copied into a Go `[32]byte`, so its UTF-8 byte length must be exactly
   * 32 or Go rejects it before signing.
   */
  SignTransfer: (...args: unknown[]) => SignResult
  /** 4 args: amount, then the trailing three. */
  SignWithdraw: (...args: unknown[]) => SignResult
  /** 6 args: marketIndex, fraction, marginMode, then the trailing three. */
  SignUpdateLeverage: (...args: unknown[]) => SignResult
  /**
   * 8 args: marketIndex, orderIndex, baseAmount, price, triggerPrice, then the
   * trailing three.
   */
  SignModifyOrder: (...args: unknown[]) => SignResult
  /** 6 args: marketIndex, usdcAmount, direction, then the trailing three. */
  SignUpdateMargin: (...args: unknown[]) => SignResult
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
] as const

type GoClass = new () => {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
}

let cachedExports: Promise<LighterWasmExports> | undefined

// `node:fs/promises` and `node:url` are Node-only. Static imports force browser
// bundlers (Vite/Rollup/esbuild) to resolve them up-front, which fails. Dynamic
// `import('node:...')` lets bundlers leave the branch unreachable in browsers
// while Node still resolves it at runtime when asked for a `file://` URL.
async function readNodeFile(url: URL): Promise<Uint8Array> {
  const [{ readFile }, { fileURLToPath }] = await Promise.all([
    import(/* @vite-ignore */ 'node:fs/promises'),
    import(/* @vite-ignore */ 'node:url'),
  ])
  return readFile(fileURLToPath(url))
}

/**
 * Resolve a possibly-relative URL string against the current document/page
 * origin. Bundlers like Vite hand out absolute paths (e.g. `/node_modules/…`)
 * for `?url` imports, which `new URL(string)` rejects without a base.
 */
function toResolvedUrl(url: string | URL): URL {
  if (url instanceof URL) {
    return url
  }
  const base =
    typeof globalThis !== 'undefined' &&
    (globalThis as { location?: { href?: string } }).location?.href
      ? (globalThis as { location: { href: string } }).location.href
      : undefined
  return new URL(url, base)
}

async function readUrlBytes(url: string | URL): Promise<ArrayBuffer> {
  const u = toResolvedUrl(url)
  if (u.protocol === 'file:') {
    const buf = await readNodeFile(u)
    // Copy the view into a fresh ArrayBuffer — `Buffer.buffer` is a shared
    // ArrayBuffer in Node and the wasm instantiator expects a plain one.
    return buf.slice().buffer as ArrayBuffer
  }
  const response = await fetch(u)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${u.href}: ${response.status} ${response.statusText}`
    )
  }
  return response.arrayBuffer()
}

function buildValidatedUrl(baseUrl: string): string {
  try {
    // Minimal path validation
    if (baseUrl.includes('/../') || /\/%2e%2e\//i.test(baseUrl)) {
      throw new Error('Invalid path');
    }
    
    const url = new URL(baseUrl);
    
    // Protocol + host checks
    const allowedDomains = ['example.com']; // add your allowed domains here
    if (!allowedDomains.includes(url.hostname)) {
      throw new Error('Invalid host');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    return url.href;
  } catch {
    throw new Error('Invalid URL');
  }
}

async function readUrlText(url: string | URL): Promise<string> {
  const u = toResolvedUrl(url)
  if (u.protocol === 'file:') {
    const buf = await readNodeFile(u)
    return new TextDecoder('utf-8').decode(buf)
  }
  const validatedUrl = buildValidatedUrl(u.href)
  const response = await fetch(validatedUrl)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${validatedUrl}: ${response.status} ${response.statusText}`
    )
  }
  return response.text()
}

/**
 * Load the Lighter WASM signer. Memoized per-process: subsequent calls return
 * the cached exports. The Go runtime keeps a long-running goroutine to service
 * JS calls — we start it once and never stop it.
 * @public
 */
export async function loadLighterWasm(
  options?: LoadLighterWasmOptions
): Promise<LighterWasmExports> {
  if (!cachedExports) {
    cachedExports = loadWasmUncached(options)
  }
  return cachedExports
}

async function loadWasmUncached(
  options?: LoadLighterWasmOptions
): Promise<LighterWasmExports> {
  const wasmBinaryUrl =
    options?.wasmBinaryUrl ?? defaultAssetUrl('lighter-signer.wasm')

  // Prefer a pre-fetched source string (bundler `?raw` imports) over a URL —
  // bundlers may transform a `.js` URL on serve, breaking the IIFE that sets
  // `globalThis.Go`.
  const wasmExecSourcePromise: Promise<string> =
    options?.wasmExecJsSource !== undefined
      ? Promise.resolve(options.wasmExecJsSource)
      : readUrlText(options?.wasmExecJsUrl ?? defaultAssetUrl('wasm_exec.js'))

  const [wasmExecSource, wasmBytes] = await Promise.all([
    wasmExecSourcePromise,
    readUrlBytes(wasmBinaryUrl),
  ])

  // wasm_exec.js is an IIFE that installs `globalThis.Go = class { ... }` plus
  // fs/process/crypto polyfills. Evaluating it as a string keeps Go's runtime
  // opaque to consumer bundlers — it references require/process/fs/crypto, which
  // Vite/webpack choke on if they try to parse it as a module. The default-path
  // source is our build-time-vendored, trusted wasm_exec.js — see the `@security`
  // note on `LoadLighterWasmOptions.wasmExecJsSource` for the caller-override boundary.
  // nosec
  const installGo = new Function(`${wasmExecSource}; return globalThis.Go`)
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
 * @public
 */
export function resetLighterWasmCache(): void {
  cachedExports = undefined
}
