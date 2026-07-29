#!/usr/bin/env node
// Verify the built package ships the Go signer the way consumers load it:
// the binary as a separate asset, the Go runtime as generated text reproducing
// wasm/wasm_exec.js exactly, and a per-module-system asset-URL resolver that a
// bundler can analyse statically.
//
// Usage: node scripts/verify-package-assets.mjs   (run after the build)

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(packageRoot, 'dist')

/** No emitted JavaScript may carry the 13 MB binary — it stays a fetched asset. */
const MAX_JS_BYTES = 200_000
const MIN_WASM_BYTES = 10_000_000
const WASM_MAGIC = '\0asm'

const failures = []

const check = (condition, message) => {
  if (!condition) {
    failures.push(message)
  }
}

const read = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    failures.push(`missing ${relative(packageRoot, path)}`)
    return ''
  }
}

const binary = join(dist, 'wasm', 'lighter-signer.wasm')
try {
  const bytes = readFileSync(binary)
  check(
    bytes.byteLength > MIN_WASM_BYTES,
    `dist/wasm/lighter-signer.wasm is ${bytes.byteLength} bytes — truncated?`
  )
  check(
    bytes.subarray(0, 4).toString('binary') === WASM_MAGIC,
    'dist/wasm/lighter-signer.wasm is not a WebAssembly module'
  )
} catch {
  failures.push('missing dist/wasm/lighter-signer.wasm')
}

// The ESM resolver must stay a literal `new URL('<relative>', import.meta.url)`:
// that exact form is what Vite/webpack rewrite into an emitted asset URL.
const esmResolver = read(join(dist, 'esm', 'signers', 'wasmBinaryUrl.js'))
check(
  /new URL\(\s*'\.\.\/\.\.\/wasm\/lighter-signer\.wasm',\s*import\.meta\.url\s*\)/.test(
    esmResolver
  ),
  'dist/esm/signers/wasmBinaryUrl.js lost its static new URL(..., import.meta.url) asset reference'
)

const cjsResolver = read(join(dist, 'cjs', 'signers', 'wasmBinaryUrl.js'))
check(
  cjsResolver.includes('__filename') &&
    cjsResolver.includes('../../wasm/lighter-signer.wasm'),
  'dist/cjs/signers/wasmBinaryUrl.js does not resolve the binary relative to the installed package'
)

const goSource = readFileSync(join(packageRoot, 'wasm', 'wasm_exec.js'), 'utf8')
for (const format of ['esm', 'cjs']) {
  const module = join(
    dist,
    format,
    'signers',
    'generated',
    'wasmExecRuntime.js'
  )
  const { WASM_EXEC_JS } = await import(pathToFileURL(module).href).catch(
    () => ({})
  )
  check(
    WASM_EXEC_JS === goSource,
    `dist/${format}/signers/generated/wasmExecRuntime.js does not reproduce wasm/wasm_exec.js exactly`
  )
}

const oversizedJs = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path)
    } else if (entry.name.endsWith('.js')) {
      const { size } = statSync(path)
      if (size > MAX_JS_BYTES) {
        oversizedJs.push(`${relative(packageRoot, path)} (${size} bytes)`)
      }
    }
  }
}
walk(dist)
check(
  oversizedJs.length === 0,
  `emitted JavaScript exceeds ${MAX_JS_BYTES} bytes — is the WASM binary inlined? ${oversizedJs.join(', ')}`
)

if (failures.length > 0) {
  console.error('verify-package-assets: FAILED')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.error(
  'verify-package-assets: binary asset, generated Go runtime and both asset-URL resolvers verified'
)
