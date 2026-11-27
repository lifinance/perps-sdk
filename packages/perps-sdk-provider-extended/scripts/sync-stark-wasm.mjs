#!/usr/bin/env node
// Copy the Stark signer binary from the installed
// `@x10xchange/stark-crypto-wrapper-wasm` into `wasm/` and record its version
// and hash. Run after bumping that dependency: its JS glue and the binary must
// come from the same version.
//
// Usage: node scripts/sync-stark-wasm.mjs

import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = '@x10xchange/stark-crypto-wrapper-wasm'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(join(packageRoot, 'package.json'))
const upstreamRoot = dirname(require.resolve(`${PACKAGE}/package.json`))
const { version } = JSON.parse(
  readFileSync(join(upstreamRoot, 'package.json'), 'utf8')
)

const binary = join(packageRoot, 'wasm', 'extended-stark.wasm')
copyFileSync(join(upstreamRoot, 'stark_crypto_wrapper_wasm_bg.wasm'), binary)

const sha256 = createHash('sha256').update(readFileSync(binary)).digest('hex')
writeFileSync(
  join(packageRoot, 'wasm', 'extended-stark.manifest.json'),
  `${JSON.stringify({ package: PACKAGE, version, sha256 }, null, 2)}\n`
)

console.error(`Copied ${PACKAGE}@${version} (sha256 ${sha256})`)
