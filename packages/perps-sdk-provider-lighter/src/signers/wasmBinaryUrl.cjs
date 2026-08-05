// CommonJS twin of `wasmBinaryUrl.js`, emitted to `dist/cjs/signers/` under
// that same name so the shared loader's specifier resolves in either build.

'use strict'

const { pathToFileURL } = require('node:url')

exports.lighterWasmBinaryUrl = new URL(
  '../../wasm/lighter-signer.wasm',
  pathToFileURL(__filename)
)

// Nothing relocates the installed binary under Node, so there is no emitted
// asset to recover; the loader reads the file URL above directly.
exports.resolveEmittedBinaryUrl = async () => undefined
