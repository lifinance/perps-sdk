// Lighter's `AssetMarginMode` wire ints (lighter-go
// `types/txtypes/update_account_asset_config.go`), used for both the write
// direction (signing `L2UpdateAccountAssetConfigTx`, tx type 42) and decoding
// an account asset's `margin_mode` on the read side.
const ASSET_MARGIN_DISABLED = 0
const ASSET_MARGIN_ENABLED = 1

/** Map the user-facing `enabled` flag to Lighter's `AssetMarginMode` wire int. */
export function assetMarginModeInt(enabled: boolean): number {
  return enabled ? ASSET_MARGIN_ENABLED : ASSET_MARGIN_DISABLED
}

/** Decode Lighter's `margin_mode` int on an account asset back to `enabled`. */
export function isAssetMarginEnabled(marginMode: number): boolean {
  return marginMode === ASSET_MARGIN_ENABLED
}
