// Hand-written, like the Lighter provider's resolver: Vite and webpack rewrite
// this literal `new URL(..., import.meta.url)` into an emitted asset URL, and
// the CJS twin must use `__filename`, which one TS source cannot emit for both.

export const starkWasmBinaryUrl = new URL(
  '../../wasm/extended-stark.wasm',
  import.meta.url
)

// Vite's dependency optimizer moves this module into `.vite/deps`, where the URL
// above misses the binary. The `?url` twin recovers the emitted asset; webpack
// and Turbopack must skip that import because they cannot compile the query.
export const resolveEmittedBinaryUrl = async () => {
  const { starkWasmBinaryUrl: emitted } = await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ './wasmBinaryUrl.vite.js'
  )
  return emitted
}
