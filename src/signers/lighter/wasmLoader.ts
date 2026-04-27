// ---------------------------------------------------------------------------
// Lighter WASM loader
//
// Loads the Go-compiled `lighter-signer.wasm` and its companion `wasm_exec.js`
// runtime. The Go runtime installs functions (SignCreateOrder, SignCancelOrder,
// etc.) onto `globalThis` when `go.run(instance)` starts the main goroutine.
//
// The default asset URLs resolve relative to this module's emitted JS file:
//   src/signers/lighter/../../../wasm/lighter-signer.wasm  → repo-root wasm/
//   dist/{esm,cjs}/signers/lighter/../../../wasm/…         → dist/{esm,cjs}/wasm/
//
// The build script copies the wasm assets into both dist subtrees so the same
// relative path resolves at runtime regardless of which bundle is loaded.
//
// To resolve the module's own URL in both ESM (where `__filename` is absent)
// and CJS (where `import.meta.url` is a syntax error), we parse a stack trace
// — `currentModuleUrl` always appears as the first frame, and V8 includes the
// emitting file path regardless of module system. Callers can override both
// asset URLs via {@link LoadLighterWasmOptions} to bypass this heuristic.
// ---------------------------------------------------------------------------

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
  return new URL(`../../../wasm/${filename}`, currentModuleUrl())
}

export interface LoadLighterWasmOptions {
  /** Override URL for the `.wasm` binary (browser: fetch; Node: fs). */
  wasmBinaryUrl?: string | URL
  /** Override URL for Go's `wasm_exec.js` runtime. */
  wasmExecJsUrl?: string | URL
}

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
  CreateAuthToken: (
    deadline: number,
    apiKeyIndex: number,
    accountIndex: number
  ) => { token?: string; error?: string }
  SignChangePubKey: (
    pubKeyHex: string,
    nonce: number,
    apiKeyIndex: number,
    accountIndex: number
  ) => SignResult & { messageToSign?: string }
  SignCreateOrder: (...args: unknown[]) => SignResult
  SignCancelOrder: (...args: unknown[]) => SignResult
  SignCancelAllOrders: (...args: unknown[]) => SignResult
  SignTransfer: (...args: unknown[]) => SignResult
  SignWithdraw: (...args: unknown[]) => SignResult
  SignUpdateLeverage: (...args: unknown[]) => SignResult
  SignModifyOrder: (...args: unknown[]) => SignResult
  SignUpdateMargin: (...args: unknown[]) => SignResult
}

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

async function readUrlBytes(url: string | URL): Promise<ArrayBuffer> {
  const u = url instanceof URL ? url : new URL(url)
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

async function readUrlText(url: string | URL): Promise<string> {
  const u = url instanceof URL ? url : new URL(url)
  if (u.protocol === 'file:') {
    const buf = await readNodeFile(u)
    return new TextDecoder('utf-8').decode(buf)
  }
  const response = await fetch(u)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${u.href}: ${response.status} ${response.statusText}`
    )
  }
  return response.text()
}

/**
 * Load the Lighter WASM signer. Memoized per-process: subsequent calls return
 * the cached exports. The Go runtime keeps a long-running goroutine to service
 * JS calls — we start it once and never stop it.
 */
export async function loadLighterWasm(
  options?: LoadLighterWasmOptions
): Promise<LighterWasmExports> {
  if (!cachedExports) {
    cachedExports = doLoad(options)
  }
  return cachedExports
}

async function doLoad(
  options?: LoadLighterWasmOptions
): Promise<LighterWasmExports> {
  const wasmBinaryUrl =
    options?.wasmBinaryUrl ?? defaultAssetUrl('lighter-signer.wasm')
  const wasmExecJsUrl =
    options?.wasmExecJsUrl ?? defaultAssetUrl('wasm_exec.js')

  const [wasmExecSource, wasmBytes] = await Promise.all([
    readUrlText(wasmExecJsUrl),
    readUrlBytes(wasmBinaryUrl),
  ])

  // wasm_exec.js is an IIFE that installs `globalThis.Go = class { ... }` plus
  // fs/process/crypto polyfills. Evaluate it in a Function scope so the class
  // attaches to globalThis and we read it back from there.
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

/** Testing helper — drop the cached WASM instance so the next load reinitializes. */
export function resetLighterWasmCache(): void {
  cachedExports = undefined
}
