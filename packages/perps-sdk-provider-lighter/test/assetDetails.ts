import type { LtAssetDetailsResponse } from '../src/types/index.js'

// Recorded `GET /api/v1/assetDetails` rows (2026-11-23), cut to the fields
// the provider types: mainnet and the Robinhood-chain deployment.

export const LIGHTER_ASSET_DETAILS_RESPONSE: LtAssetDetailsResponse = {
  code: 200,
  asset_details: [
    {
      asset_id: 1,
      symbol: 'ETH',
      l1_decimals: 18,
      decimals: 8,
      l1_address: '0x0000000000000000000000000000000000000000',
      index_price: '1720.774151',
      liquidation_threshold: '0.9000',
    },
    {
      asset_id: 3,
      symbol: 'USDC',
      l1_decimals: 6,
      decimals: 6,
      l1_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      index_price: '1.000000',
      liquidation_threshold: '1.0000',
    },
  ],
}

export const LIGHTER_RH_ASSET_DETAILS_RESPONSE: LtAssetDetailsResponse = {
  code: 200,
  asset_details: [
    {
      asset_id: 3,
      symbol: 'USDG',
      l1_decimals: 6,
      decimals: 6,
      l1_address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      index_price: '1.000000',
      liquidation_threshold: '1.0000',
    },
    {
      asset_id: 4,
      symbol: 'AAPL',
      l1_decimals: 18,
      decimals: 6,
      l1_address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
      index_price: '348.494660',
      liquidation_threshold: '0.7500',
    },
  ],
}
