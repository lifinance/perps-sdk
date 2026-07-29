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

/**
 * Re-import the loader with the packaged runtime text and asset URL replaced.
 * The loader takes no injection options, so the module graph is the only seam:
 * a fresh import also drops the loader's memoized exports.
 */
const importLoaderWithFakes = async (
  installNames: readonly string[] = WASM_FUNCTION_NAMES
) => {
  vi.resetModules()
  vi.doMock('./generated/wasmExecRuntime.js', () => ({
    WASM_EXEC_JS: fakeWasmExecSource(installNames),
  }))
  vi.doMock('./wasmBinaryUrl.js', () => ({
    lighterWasmBinaryUrl: new URL(STUB_BINARY_URL),
  }))
  return import('./wasmLoader.js')
}

describe('loadLighterWasm', () => {
  beforeEach(() => {
    // The WASM binary bytes are never inspected by the fake Go runtime.
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([0])))
    vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      instance: {} as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    })
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
    const fetchSpy = vi.fn(async () => new Response(new Uint8Array([0])))
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
})
