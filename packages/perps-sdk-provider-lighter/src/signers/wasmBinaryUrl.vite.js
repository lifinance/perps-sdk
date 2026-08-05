// Recovery resolver for bundlers that relocate the module before evaluating it:
// Vite's dependency optimizer rewrites this package into `.vite/deps`, where the
// `new URL(..., import.meta.url)` form in `wasmBinaryUrl.js` points at the cache
// directory instead of the installed package. A `?url` import is resolved by the
// bundler at graph time, from this file's real location, so relocation cannot
// move the asset out from under it. Only Vite understands the query, which is
// why the loader reaches this module through an import the other bundlers skip.

import wasmAssetUrl from '../../wasm/lighter-signer.wasm?url'

export const lighterWasmBinaryUrl = new URL(wasmAssetUrl, import.meta.url)
