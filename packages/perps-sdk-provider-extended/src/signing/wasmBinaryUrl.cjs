// CommonJS twin of `wasmBinaryUrl.js`, copied to `dist/cjs/signing/` under that
// name so the loader's specifier resolves in either build.

'use strict'

const { pathToFileURL } = require('node:url')

exports.starkWasmBinaryUrl = new URL(
  '../../wasm/extended-stark.wasm',
  pathToFileURL(__filename)
)

exports.resolveEmittedBinaryUrl = async () => undefined
