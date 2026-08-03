import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WASM_EXEC_JS } from './generated/wasmExecRuntime.js'
import { lighterWasmBinaryUrl } from './wasmBinaryUrl.js'

/**
 * Go's `wasm_exec.js`, vendored verbatim from the toolchain that compiled
 * `lighter-signer.wasm`. It is the source the packaged runtime text is
 * generated from and must never be edited.
 */
const GO_WASM_EXEC_SOURCE = new URL('../../wasm/wasm_exec.js', import.meta.url)

describe('packaged Go wasm_exec runtime', () => {
  it('reproduces the vendored Go source exactly', () => {
    const source = readFileSync(GO_WASM_EXEC_SOURCE, 'utf8')
    expect(WASM_EXEC_JS).toBe(source)
  })

  it('is byte-identical to the vendored source when re-encoded', () => {
    const sourceBytes = readFileSync(GO_WASM_EXEC_SOURCE)
    expect(Buffer.from(WASM_EXEC_JS, 'utf8').equals(sourceBytes)).toBe(true)
  })

  it('still carries Go copyright and the runtime IIFE the loader evaluates', () => {
    expect(WASM_EXEC_JS).toContain('Copyright 2018 The Go Authors')
    expect(WASM_EXEC_JS).toContain('globalThis.Go = class')
  })

  it('installs globalThis.Go when evaluated as the loader evaluates it', () => {
    const previousGo = Reflect.get(globalThis, 'Go')
    try {
      const installGo = new Function(`${WASM_EXEC_JS}; return globalThis.Go`)
      expect(typeof installGo()).toBe('function')
    } finally {
      Reflect.set(globalThis, 'Go', previousGo)
    }
  })
})

describe('packaged WASM binary asset', () => {
  it('resolves a package-relative asset URL, not a cwd-relative one', () => {
    expect(lighterWasmBinaryUrl.href).toMatch(/\/wasm\/lighter-signer\.wasm$/)
    expect(lighterWasmBinaryUrl.href).not.toContain('/src/signers/')
  })

  it('points at the installed binary on Node', () => {
    const bytes = readFileSync(lighterWasmBinaryUrl)
    // The Go signer binary is ~12 MB; a truncated or wrong file is not.
    expect(bytes.byteLength).toBeGreaterThan(10_000_000)
    expect(bytes.subarray(0, 4).toString('binary')).toBe('\0asm')
  })

  it('keeps the binary out of JavaScript — the runtime text carries no wasm bytes', () => {
    expect(WASM_EXEC_JS.length).toBeLessThan(100_000)
  })
})
