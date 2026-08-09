// Static, bundler-analyzable URL for the package's own Go signer binary.
// Vite/webpack rewrite this `new URL(..., import.meta.url)` form into an
// emitted asset URL; Node ESM resolves it to the installed `file://` path.
// Hand-authored (not compiled from TS) because the CJS twin next to it must
// use `__filename` — one TS source cannot emit both.

export const lighterWasmBinaryUrl = new URL(
  '../../wasm/lighter-signer.wasm',
  import.meta.url
)

// Vite's dependency optimizer relocates this module into `.vite/deps`, where the
// URL above resolves against the cache directory instead of the installed
// package. The `?url` twin recovers the URL Vite emitted for the binary, and is
// reached through an import webpack and Turbopack are told to skip: they rewrite
// the URL above correctly and cannot compile Vite's query. The loader calls this
// only after the static URL has served something that is not a WASM module.
export const resolveEmittedBinaryUrl = async () => {
  const { lighterWasmBinaryUrl: emitted } = await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ './wasmBinaryUrl.vite.js'
  )
  return emitted
}
