import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LighterWasmExports } from './wasmLoader.js'

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

const STUB_BINARY_URL = 'http://stub.invalid/lighter-signer.wasm'

// Only the four magic bytes plus the version word matter: the loader checks the
// preamble before instantiating and the fake Go runtime ignores the rest.
const wasmResponse = () =>
  new Response(
    new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
    {
      headers: { 'content-type': 'application/wasm' },
    }
  )

// A wasm_exec.js stand-in: installs a fake `globalThis.Go` whose `run()` mounts
// the named signer functions on globalThis (mirroring how the real Go runtime
// registers JS-bound functions during init). `installNames` lets a test omit a
// function to exercise the missing-export error path.
const fakeWasmExecSource = (installNames: readonly string[]): string => `
  globalThis.Go = class {
    constructor() { this.importObject = {} }
    async run() {
      ${installNames
        .map((name) => `globalThis[${JSON.stringify(name)}] = () => ({});`)
        .join('\n')}
    }
  }
`

const RECOVERED_BINARY_URL =
  'http://stub.invalid/assets/lighter-signer-hash.wasm'

const packageRoot = join(import.meta.dirname, '..', '..')

/**
 * Re-import the loader with the packaged runtime text and asset resolver
 * replaced. The loader takes no injection options, so the module graph is the
 * only seam: a fresh import also drops the loader's memoized exports.
 * `resolveEmitted` stands in for the bundler asset pipeline the loader falls
 * back to and `binaryUrl` for the static URL the package resolved for itself;
 * the defaults mirror Node and the bundlers that need no recovery.
 */
const importLoaderWithFakes = async (
  installNames: readonly string[] = WASM_FUNCTION_NAMES,
  resolveEmitted: () => Promise<URL | undefined> = async () => undefined,
  binaryUrl: URL = new URL(STUB_BINARY_URL)
) => {
  vi.resetModules()
  vi.doMock('./generated/wasmExecRuntime.js', () => ({
    WASM_EXEC_JS: fakeWasmExecSource(installNames),
  }))
  vi.doMock('./wasmBinaryUrl.js', () => ({
    lighterWasmBinaryUrl: binaryUrl,
    resolveEmittedBinaryUrl: resolveEmitted,
  }))
  return import('./wasmLoader.js')
}

describe('loadLighterWasm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async () => wasmResponse())
    // The loader calls the `BufferSource` overload, which resolves to a
    // `WebAssemblyInstantiatedSource`; `spyOn` types `mockResolvedValue` from
    // the last overload (`Instance`), so the shape is pinned with `satisfies`
    // and the cast only bridges the overload mismatch.
    vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      instance: {} as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    } satisfies WebAssembly.WebAssemblyInstantiatedSource as unknown as WebAssembly.Instance)
  })

  afterEach(() => {
    vi.doUnmock('./generated/wasmExecRuntime.js')
    vi.doUnmock('./wasmBinaryUrl.js')
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    for (const name of WASM_FUNCTION_NAMES) {
      delete (globalThis as Record<string, unknown>)[name]
    }
    delete (globalThis as { Go?: unknown }).Go
  })

  it('takes no arguments — no caller-supplied WASM URL or runtime source', async () => {
    const { loadLighterWasm } = await importLoaderWithFakes()
    expect(loadLighterWasm.length).toBe(0)
  })

  it('fetches the package-owned binary asset URL', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => wasmResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const { loadLighterWasm } = await importLoaderWithFakes()

    await loadLighterWasm()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(STUB_BINARY_URL)
  })

  it('returns every expected signer function once the Go runtime registers them', async () => {
    const { loadLighterWasm } = await importLoaderWithFakes()
    const exports = await loadLighterWasm()

    for (const name of WASM_FUNCTION_NAMES) {
      expect(typeof exports[name as keyof LighterWasmExports]).toBe('function')
    }
  })

  it('memoizes — repeated calls resolve to the identical exports object', async () => {
    const { loadLighterWasm } = await importLoaderWithFakes()
    const first = await loadLighterWasm()
    const second = await loadLighterWasm()

    expect(second).toBe(first)
    // Instantiated exactly once despite two load calls.
    expect(WebAssembly.instantiate).toHaveBeenCalledTimes(1)
  })

  it('resetLighterWasmCache forces a fresh instantiation on the next load', async () => {
    const { loadLighterWasm, resetLighterWasmCache } =
      await importLoaderWithFakes()
    await loadLighterWasm()
    resetLighterWasmCache()
    await loadLighterWasm()

    expect(WebAssembly.instantiate).toHaveBeenCalledTimes(2)
  })

  it('throws a descriptive error when an expected export is missing', async () => {
    const missingCreateClient = WASM_FUNCTION_NAMES.filter(
      (n) => n !== 'CreateClient'
    )
    const { loadLighterWasm } = await importLoaderWithFakes(missingCreateClient)

    await expect(loadLighterWasm()).rejects.toThrow(
      /Lighter WASM did not export expected function: CreateClient/
    )
  })

  it('loads the bundler-emitted asset when the static URL was relocated', async () => {
    // What Vite's dependency optimizer does to the package: the static URL now
    // points into its cache directory, where the dev server serves index.html.
    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: URL) => {
      requested.push(String(input))
      return String(input) === STUB_BINARY_URL
        ? new Response('<!doctype html><html></html>', {
            headers: { 'content-type': 'text/html' },
          })
        : wasmResponse()
    })
    const { loadLighterWasm } = await importLoaderWithFakes(
      WASM_FUNCTION_NAMES,
      async () => new URL(RECOVERED_BINARY_URL)
    )

    const exports = await loadLighterWasm()

    expect(typeof exports.GenerateAPIKey).toBe('function')
    expect(requested).toEqual([STUB_BINARY_URL, RECOVERED_BINARY_URL])
  })

  it('rejects an SPA HTML fallback before it reaches the instantiator', async () => {
    vi.stubGlobal('fetch', async () => {
      return new Response('<!doctype html><html></html>', {
        headers: { 'content-type': 'text/html' },
      })
    })
    const { loadLighterWasm } = await importLoaderWithFakes()

    await expect(loadLighterWasm()).rejects.toThrow(
      `${STUB_BINARY_URL} served text/html starting with 3c 21 64 6f; ` +
        'bundler-emitted asset unavailable (no bundler asset pipeline)'
    )
    expect(WebAssembly.instantiate).not.toHaveBeenCalled()
  })

  it('reports both attempts when the emitted asset is also not a module', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('<!doctype html><html></html>', {
          headers: { 'content-type': 'text/html' },
        })
    )
    const { loadLighterWasm } = await importLoaderWithFakes(
      WASM_FUNCTION_NAMES,
      async () => new URL(RECOVERED_BINARY_URL)
    )

    await expect(loadLighterWasm()).rejects.toThrow(
      `bundler-emitted asset ${RECOVERED_BINARY_URL} served text/html`
    )
    expect(WebAssembly.instantiate).not.toHaveBeenCalled()
  })

  it('names the failing asset URL when the host answers with an error status', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('nope', { status: 404, statusText: 'Not Found' })
    )
    const { loadLighterWasm } = await importLoaderWithFakes()

    await expect(loadLighterWasm()).rejects.toThrow(
      `Failed to fetch ${STUB_BINARY_URL}: 404 Not Found`
    )
  })

  it('reports the recovery failure when the asset pipeline import throws', async () => {
    // What a webpack consumer hits: the ignore-guarded import of the `?url`
    // twin is left unbundled, so resolving it at runtime fails outright.
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('<!doctype html><html></html>', {
          headers: { 'content-type': 'text/html' },
        })
    )
    const { loadLighterWasm } = await importLoaderWithFakes(
      WASM_FUNCTION_NAMES,
      async () => {
        throw new Error("Cannot find module './wasmBinaryUrl.vite.js'")
      }
    )

    await expect(loadLighterWasm()).rejects.toThrow(
      "bundler-emitted asset unavailable (Cannot find module './wasmBinaryUrl.vite.js')"
    )
    expect(WebAssembly.instantiate).not.toHaveBeenCalled()
  })

  it('retries the next load instead of memoizing a failed attempt', async () => {
    // A dev server that is not serving the asset yet must not pin the failure
    // for the rest of the process — the signer has to recover on the next call.
    let attempts = 0
    vi.stubGlobal('fetch', async () => {
      attempts += 1
      return attempts === 1
        ? new Response('nope', {
            status: 503,
            statusText: 'Service Unavailable',
          })
        : wasmResponse()
    })
    const { loadLighterWasm } = await importLoaderWithFakes()

    await expect(loadLighterWasm()).rejects.toThrow(
      `Failed to fetch ${STUB_BINARY_URL}: 503 Service Unavailable`
    )
    const exports = await loadLighterWasm()

    expect(typeof exports.GenerateAPIKey).toBe('function')
    expect(attempts).toBe(2)
  })

  it('does not let a stale rejection evict a newer cached load', async () => {
    let rejectFirst!: (reason?: unknown) => void
    const firstResponse = new Promise<Response>((_, reject) => {
      rejectFirst = reject
    })
    let attempts = 0
    const fetchSpy = vi.fn<typeof fetch>(async () => {
      attempts += 1
      return attempts === 1 ? firstResponse : wasmResponse()
    })
    vi.stubGlobal('fetch', fetchSpy)
    const { loadLighterWasm, resetLighterWasmCache } =
      await importLoaderWithFakes()

    const firstLoad = loadLighterWasm()
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    resetLighterWasmCache()
    const second = await loadLighterWasm()
    rejectFirst(new Error('First attempt failed'))
    await expect(firstLoad).rejects.toThrow('First attempt failed')

    const third = await loadLighterWasm()
    expect(third).toBe(second)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('reads the packaged binary from a file URL without fetching', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => wasmResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const { loadLighterWasm } = await importLoaderWithFakes(
      WASM_FUNCTION_NAMES,
      undefined,
      pathToFileURL(join(packageRoot, 'wasm', 'lighter-signer.wasm'))
    )

    const exports = await loadLighterWasm()

    expect(typeof exports.GenerateAPIKey).toBe('function')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a Node-local asset that is not a WebAssembly module', async () => {
    // The Go runtime text sits next to the binary, so a mis-resolved file URL
    // in the installed package reaches the loader as plain JavaScript.
    const notTheBinary = pathToFileURL(
      join(packageRoot, 'wasm', 'wasm_exec.js')
    )
    const { loadLighterWasm } = await importLoaderWithFakes(
      WASM_FUNCTION_NAMES,
      undefined,
      notTheBinary
    )

    await expect(loadLighterWasm()).rejects.toThrow(
      `${notTheBinary.href} is not a WebAssembly module.`
    )
    expect(WebAssembly.instantiate).not.toHaveBeenCalled()
  })
})
