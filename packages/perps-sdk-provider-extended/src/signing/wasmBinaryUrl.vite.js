// Vite resolves a `?url` import from this file's real location at graph time,
// so it still finds the binary after the optimizer relocates the package.

import wasmAssetUrl from '../../wasm/extended-stark.wasm?url'

export const starkWasmBinaryUrl = new URL(wasmAssetUrl, import.meta.url)
