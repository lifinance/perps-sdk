import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type LighterWasmExports,
  loadLighterWasm,
  resetLighterWasmCache,
} from './wasmLoader.js'

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
] as const

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

describe('loadLighterWasm', () => {
  const loadOptions = (
    installNames: readonly string[] = WASM_FUNCTION_NAMES
  ) => ({
    // Bypass the .wasm fetch/read entirely — instantiate is stubbed below.
    wasmBinaryUrl: 'http://stub.invalid/lighter-signer.wasm',
    wasmExecJsSource: fakeWasmExecSource(installNames),
  })

  beforeEach(() => {
    resetLighterWasmCache()
    // The WASM binary bytes are never inspected by the fake Go runtime.
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([0])))
    vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      instance: {} as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    })
  })

  afterEach(() => {
    resetLighterWasmCache()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    for (const name of WASM_FUNCTION_NAMES) {
      delete (globalThis as Record<string, unknown>)[name]
    }
    delete (globalThis as { Go?: unknown }).Go
  })

  it('returns every expected signer function once the Go runtime registers them', async () => {
    const exports = await loadLighterWasm(loadOptions())

    for (const name of WASM_FUNCTION_NAMES) {
      expect(typeof exports[name as keyof LighterWasmExports]).toBe('function')
    }
  })

  it('memoizes — repeated calls resolve to the identical exports object', async () => {
    const first = await loadLighterWasm(loadOptions())
    const second = await loadLighterWasm(loadOptions())

    expect(second).toBe(first)
    // Instantiated exactly once despite two load calls.
    expect(WebAssembly.instantiate).toHaveBeenCalledTimes(1)
  })

  it('resetLighterWasmCache forces a fresh instantiation on the next load', async () => {
    await loadLighterWasm(loadOptions())
    resetLighterWasmCache()
    await loadLighterWasm(loadOptions())

    expect(WebAssembly.instantiate).toHaveBeenCalledTimes(2)
  })

  it('throws a descriptive error when an expected export is missing', async () => {
    const missingCreateClient = WASM_FUNCTION_NAMES.filter(
      (n) => n !== 'CreateClient'
    )

    await expect(
      loadLighterWasm(loadOptions(missingCreateClient))
    ).rejects.toThrow(
      /Lighter WASM did not export expected function: CreateClient/
    )
  })
})
