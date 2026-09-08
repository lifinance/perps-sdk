import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCRIPT_TEXT_EVALUATION } from '../../scripts/lib/script-text-evaluation.js'
import { Go } from './generated/wasmExecRuntime.js'
import { lighterWasmBinaryUrl } from './wasmBinaryUrl.js'

/**
 * Go's `wasm_exec.js`, vendored verbatim from the toolchain that compiled
 * `lighter-signer.wasm`. It is the source the packaged runtime module is
 * generated from and must never be edited.
 */
const GO_WASM_EXEC_SOURCE = new URL('../../wasm/wasm_exec.js', import.meta.url)
const GENERATED_MODULE = new URL(
  './generated/wasmExecRuntime.ts',
  import.meta.url
)

describe('packaged Go wasm_exec runtime module', () => {
  it('carries the vendored Go source verbatim', () => {
    const source = readFileSync(GO_WASM_EXEC_SOURCE, 'utf8')
    expect(source).toContain('Copyright 2018 The Go Authors')
    expect(readFileSync(GENERATED_MODULE, 'utf8')).toContain(source)
  })

  it('exports the Go class the source installs on globalThis', () => {
    expect(typeof Go).toBe('function')
    const go = new Go()
    expect(typeof go.importObject).toBe('object')
    expect(typeof go.run).toBe('function')
  })

  // A runtime test cannot reach this: the module evaluates at import time,
  // before any test body can stub `Function`.
  it('evaluates no script text, so a CSP without unsafe-eval loads it', () => {
    expect(readFileSync(GENERATED_MODULE, 'utf8')).not.toMatch(
      SCRIPT_TEXT_EVALUATION
    )
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

  it('keeps the binary out of JavaScript — the runtime module carries no wasm bytes', () => {
    expect(readFileSync(GENERATED_MODULE).byteLength).toBeLessThan(100_000)
  })
})
