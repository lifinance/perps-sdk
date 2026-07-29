// CommonJS twin of `wasmBinaryUrl.js`, emitted to `dist/cjs/signers/` under
// that same name so the shared loader's specifier resolves in either build.

'use strict'

const { pathToFileURL } = require('node:url')

exports.lighterWasmBinaryUrl = new URL(
  '../../wasm/lighter-signer.wasm',
  pathToFileURL(__filename)
)
