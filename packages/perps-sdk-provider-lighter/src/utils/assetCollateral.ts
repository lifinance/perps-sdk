import type { LtAssetMarginMode } from '../types/account.js'

// Lighter's `AssetMarginMode` wire ints (lighter-go
// `types/txtypes/update_account_asset_config.go`), used to sign
// `L2UpdateAccountAssetConfigTx` (tx type 42). The read side is not symmetric:
// `/api/v1/account` reports the same flag as a string.
const ASSET_MARGIN_DISABLED = 0
const ASSET_MARGIN_ENABLED = 1

/** Map the user-facing `enabled` flag to Lighter's `AssetMarginMode` wire int. */
export function assetMarginModeInt(enabled: boolean): number {
  return enabled ? ASSET_MARGIN_ENABLED : ASSET_MARGIN_DISABLED
}

/** Decode Lighter's `margin_mode` on an account asset back to `enabled`. */
export function isAssetMarginEnabled(marginMode: LtAssetMarginMode): boolean {
  return marginMode === 'enabled'
}
