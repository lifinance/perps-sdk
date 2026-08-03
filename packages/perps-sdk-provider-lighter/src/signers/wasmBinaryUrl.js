// Static, bundler-analyzable URL for the package's own Go signer binary.
// Vite/webpack rewrite this `new URL(..., import.meta.url)` form into an
// emitted asset URL; Node ESM resolves it to the installed `file://` path.
// Hand-authored (not compiled from TS) because the CJS twin next to it must
// use `__filename` — one TS source cannot emit both.

export const lighterWasmBinaryUrl = new URL(
  '../../wasm/lighter-signer.wasm',
  import.meta.url
)
