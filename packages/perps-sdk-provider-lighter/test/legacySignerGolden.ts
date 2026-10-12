import { ActionType } from '@lifi/perps-types'

// Output of the lighter-go `wasm/` signer this package shipped before
// `web-wasm/`, for one fixed key with the clock set to `nowMs`. Every Sig is
// randomized, so a comparison drops it; the L1 cases have an empty `L1Sig`.

export interface LegacySignerCase {
  name: string
  action: ActionType
  params: Record<string, unknown>
  txType: number
  txInfo: string
  txHash: string
  messageToSign?: string
}

export const LEGACY_NOW_MS = 1760000000000

export const LEGACY_CHAIN_ID = 304

export const LEGACY_KEY = {
  privateKey:
    '0xd9e7032130ae334f748143e7da0e948ca8ef5b5e5da7858481138cd72331e8b30ee9de7fbed2b277',
  publicKey:
    '0x3590a651039382d1b66a99fac950d15c1431fec1d99695b23a7bcdc3709f1a198ee433daea1c389d',
}

export const LEGACY_CONTEXT = {
  apiKeyPrivateKey:
    '0xd9e7032130ae334f748143e7da0e948ca8ef5b5e5da7858481138cd72331e8b30ee9de7fbed2b277',
  apiKeyIndex: 3,
  accountIndex: 712345,
}

export const LEGACY_AUTH_TOKEN =
  '1760003600:712345:3:d1346fba76937226da6196392564867b2930621d420db0ade230774dfa7ad1cfc27d2528bcecb914d9e6f137acca2f54c867b95a08904eabc28ba7702201047de570f10947817cb90452641fbe898509'

export const LEGACY_CASES: LegacySignerCase[] = [
  {
    name: 'place order',
    action: ActionType.PLACE_ORDER,
    params: {
      market_index: 0,
      client_order_index: 7,
      base_amount: 1000,
      price: 3000000,
      is_ask: 0,
      order_type: 0,
      time_in_force: 1,
      reduce_only: 0,
      trigger_price: 0,
      order_expiry: 1762419200000,
      nonce: 11,
    },
    txType: 14,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"MarketIndex":0,"ClientOrderIndex":7,"BaseAmount":1000,"Price":3000000,"IsAsk":0,"Type":0,"TimeInForce":1,"ReduceOnly":0,"TriggerPrice":0,"OrderExpiry":1762419200000,"ExpiredAt":1760000599000,"Nonce":11,"Sig":"6pLCftES4Wc2WNWMtN+fv1RE6xnrrOzU67snuYuXT8ccb7920m3ETAf8GosQu2U0cXcgJyLPOYvkNcAKOAm8K4tG8s9ZjVFcxXZf5tPTJkc=","L2TxAttributes":null}',
    txHash:
      'a302e91ac4fb3597067750073e984e1e5b9a81ab84130f1e7cc266a6c2aa7eb42135081a40eed22c',
  },
  {
    name: 'place order with default expiry',
    action: ActionType.PLACE_ORDER,
    params: {
      market_index: 1,
      client_order_index: 8,
      base_amount: 25,
      price: 120000,
      is_ask: 1,
      order_type: 0,
      time_in_force: 1,
      reduce_only: 1,
      trigger_price: 0,
      order_expiry: -1,
      nonce: 12,
    },
    txType: 14,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"MarketIndex":1,"ClientOrderIndex":8,"BaseAmount":25,"Price":120000,"IsAsk":1,"Type":0,"TimeInForce":1,"ReduceOnly":1,"TriggerPrice":0,"OrderExpiry":1762419200000,"ExpiredAt":1760000599000,"Nonce":12,"Sig":"x2xi/ihkhplR0SBHtbyV8thIc3JLo1bQCsXuyyqRSpKvFKDJJJgVXL2Z/iCqJIcX4YSThDv6rbuVAfIaVlGUENto+SRFW8Ia+QB0HZRyRlk=","L2TxAttributes":null}',
    txHash:
      '73568a7a13fa3905401bc72a56a82b9d79e704f6ce43fcfa904a50b07f323d573ff87e56fed883f3',
  },
  {
    name: 'place order with integrator',
    action: ActionType.PLACE_ORDER,
    params: {
      market_index: 0,
      client_order_index: 9,
      base_amount: 1000,
      price: 3000000,
      is_ask: 0,
      order_type: 1,
      time_in_force: 0,
      reduce_only: 0,
      trigger_price: 0,
      order_expiry: 0,
      integrator_account_index: 12345,
      integrator_taker_fee: 100,
      integrator_maker_fee: 50,
      nonce: 13,
    },
    txType: 14,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"MarketIndex":0,"ClientOrderIndex":9,"BaseAmount":1000,"Price":3000000,"IsAsk":0,"Type":1,"TimeInForce":0,"ReduceOnly":0,"TriggerPrice":0,"OrderExpiry":0,"ExpiredAt":1760000599000,"Nonce":13,"Sig":"XsbxBWBxcQdZ0QqWTL8CoPWFu/yj6B47YTX2MeQgel8Ljl8gb7aoSUKq2fyAzKkvfSLPMatsv0ioVdO/bCb01K0/vvwxA9aZ5teVI/o7/lo=","L2TxAttributes":{"1":12345,"2":100,"3":50}}',
    txHash:
      'f18902ce514201de0f5e245b46ece31b1ce515f6eb16f5dae361b7de7d21103c9ad09c6b2b982564',
  },
  {
    name: 'place trigger order',
    action: ActionType.PLACE_TRIGGER_ORDER,
    params: {
      market_index: 0,
      client_order_index: 10,
      base_amount: 1000,
      price: 2900000,
      is_ask: 1,
      order_type: 2,
      time_in_force: 0,
      reduce_only: 1,
      trigger_price: 2950000,
      order_expiry: 1762419200000,
      nonce: 14,
    },
    txType: 14,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"MarketIndex":0,"ClientOrderIndex":10,"BaseAmount":1000,"Price":2900000,"IsAsk":1,"Type":2,"TimeInForce":0,"ReduceOnly":1,"TriggerPrice":2950000,"OrderExpiry":1762419200000,"ExpiredAt":1760000599000,"Nonce":14,"Sig":"fPnujfLFPirs4awFP6IjYzLay72LCTNrMDyKbjP6GdDCEDJKKmEjPUyPvGDip3br9uLYGogEH3oq784JcyBx9b5T1BXnqZXpZzwBgZeXbX8=","L2TxAttributes":null}',
    txHash:
      '1a0d81df318c0f5ad5ae5af15cd1339d427442b0fa3a5a3697ecc74192f2cc53f6ddf38f01f9731f',
  },
  {
    name: 'cancel order',
    action: ActionType.CANCEL_ORDER,
    params: { market_index: 0, order_index: 281474976710657, nonce: 15 },
    txType: 15,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"MarketIndex":0,"Index":281474976710657,"ExpiredAt":1760000599000,"Nonce":15,"Sig":"eE8ehYkuIBc2/uljjsr3OXXkjGyTfvFuvGVj+9INCYw6tHk3j4NnVRicq2udDkqBO96tvSz1NWe881wjzRFiJnx+evBh4m4sZgPA/nML7n0=","L2TxAttributes":null}',
    txHash:
      'c588c0ca8da3dcf8f8916e6960540f5cd995c84a6ca24cc000ce475c6954acfd3a8de72d85fa3096',
  },
  {
    name: 'cancel all orders',
    action: ActionType.CANCEL_ALL_ORDERS,
    params: { time_in_force: 0, timestamp_ms: 0, nonce: 16 },
    txType: 16,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"TimeInForce":0,"Time":0,"ExpiredAt":1760000599000,"Nonce":16,"Sig":"C+AVEl6RE7peIPwJgjj9/W56VKlOZ4M2bl4f4KQiXJAbmMbuWmSrav5XHyj4d8o5sh8SKBps3iDvzCN0luQpf9B9sE8AgGzQtzd550nBfkA=","L2TxAttributes":null}',
    txHash:
      '884073be2c8afc852da7e07151156fd7d1006be7552aad709a876667c217a532e5a699e985ae6229',
  },
  {
    name: 'modify order',
    action: ActionType.MODIFY_ORDER,
    params: {
      market_index: 0,
      order_index: 281474976710657,
      base_amount: 2000,
      price: 3100000,
      trigger_price: 0,
      nonce: 17,
    },
    txType: 17,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"MarketIndex":0,"Index":281474976710657,"BaseAmount":2000,"Price":3100000,"TriggerPrice":0,"ExpiredAt":1760000599000,"Nonce":17,"Sig":"HEZISHU/fmRiU4HnNENXmZc0r+pTfIOspRHh3qsewV0oeIlFVEEbC/QagosPcPxM6OG8/jmvHaXeVC9XDjWaCdRh8KLmuRKP9XHEQaQXjg0=","L2TxAttributes":null}',
    txHash:
      '084ef325116620b9bd53a071c256deaaf33ed92d26ffbc7eb57994d1fe08d9bfe0245dc8564f143f',
  },
  {
    name: 'update leverage',
    action: ActionType.UPDATE_LEVERAGE,
    params: { market_index: 0, fraction: 500, margin_mode: 0, nonce: 18 },
    txType: 20,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"MarketIndex":0,"InitialMarginFraction":500,"MarginMode":0,"ExpiredAt":1760000599000,"Nonce":18,"Sig":"ayJOUaruz0jSqakXWtGOTnSV+ww6oiZRdWfEO414pEobGEbGLPu7Sc0eJQW+dViPz52DDx+jdAECpuRA+X8K5uWkHiexe1xlL50ofdQstDY=","L2TxAttributes":null}',
    txHash:
      '4fb2f43d852dfd6cf76f1b2e89cc67513d428a15554d0590ee5777f428138267e6fb3767b3f6fcb7',
  },
  {
    name: 'update position margin',
    action: ActionType.UPDATE_POSITION_MARGIN,
    params: { market_index: 0, usdc_amount: 1000000, direction: 1, nonce: 19 },
    txType: 29,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"MarketIndex":0,"USDCAmount":1000000,"Direction":1,"ExpiredAt":1760000599000,"Nonce":19,"Sig":"GHR6a4McYcrGQQiETZXVzb2wLP433NQmzlFndLl09JTMgW8BY0VBccAj5iP2HVOvmW2mNEQHOVJx+bH7LQVKoatTn91B3IFqkynSWP8s0C0=","L2TxAttributes":null}',
    txHash:
      'e3399fbe85b2609bfc6d92367fba0ef440ea7fb46f2c35cb6af360a3b2b63d3e660da17f09e56102',
  },
  {
    name: 'withdrawal',
    action: ActionType.WITHDRAWAL,
    params: {
      asset_index: 3,
      route_type: 0,
      amount: '1.5',
      decimals: 6,
      min_withdrawal_amount: '1.000000',
      symbol: 'USDC',
      nonce: 20,
    },
    txType: 13,
    txInfo:
      '{"FromAccountIndex":712345,"ApiKeyIndex":3,"AssetIndex":3,"RouteType":0,"Amount":1500000,"ExpiredAt":1760000599000,"Nonce":20,"Sig":"SUfXLXogcg/LMbe1bsNykpeSsMhFUNne8CD3PnyjFi1Wm0p8aFKEQB1pgJeNDn4KFYjZWfme82ypGUMaUAacVHYWh+p3PJW5onoK028tnhk=","L2TxAttributes":null}',
    txHash:
      '1de4b0d7f294a26e1b0d6bd792ec2bcfa309a119a88386225f83a499fafc525b5fbab3971edba5b1',
  },
  {
    name: 'send asset',
    action: ActionType.SEND_ASSET,
    params: {
      amount: 1000000,
      sourceDex: 'perps',
      destinationDex: 'spot',
      nonce: 21,
    },
    txType: 12,
    txInfo:
      '{"FromAccountIndex":712345,"ApiKeyIndex":3,"ToAccountIndex":712345,"AssetIndex":3,"FromRouteType":0,"ToRouteType":1,"Amount":1000000,"USDCFee":0,"Memo":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"ExpiredAt":1760000599000,"Nonce":21,"Sig":"rLPnKty3Ps7Fc1q6wwCFvYFRxVpYYw/FNmP+hEfANumBO7cDwTs+IzLIwd8NnnsJBwAv7DXirga8N80Nvyeynju3QbuXLZB1wWInD/wZpgU=","L1Sig":"","L2TxAttributes":null}',
    txHash:
      '21e61b5150063e6ebb5e656bd9f01a623d25850d3e6433f19f72da16dfd7b97c228c79de7d1bbe30',
  },
  {
    name: 'revoke integrator',
    action: ActionType.REVOKE_INTEGRATOR,
    params: {
      integrator_account_index: 12345,
      max_perps_taker_fee: 0,
      max_perps_maker_fee: 0,
      max_spot_taker_fee: 0,
      max_spot_maker_fee: 0,
      approval_expiry: 0,
      nonce: 22,
    },
    txType: 45,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"IntegratorAccountIndex":12345,"MaxPerpsTakerFee":0,"MaxPerpsMakerFee":0,"MaxSpotTakerFee":0,"MaxSpotMakerFee":0,"ApprovalExpiry":0,"ExpiredAt":1760000599000,"Nonce":22,"Sig":"mCXsZMIlHOR2qtfZf9yoKWI38k3KlM6MRCivyJBtRZpvEkNVkyr8Xzr1TvWISNKw+deme3x0CzZ4zMTYMlThwewlwv3wKekarxGxlAGkBAo=","L1Sig":"","L2TxAttributes":null}',
    txHash:
      'dbad551dc7df8176a4860f550870bf0cd6668efe86fe2666e467ea7c318ecba56d1f19b8a66d3f4d',
  },
  {
    name: 'account mode',
    action: ActionType.ACCOUNT_MODE,
    params: { account_trading_mode: 1, nonce: 23 },
    txType: 41,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"AccountTradingMode":1,"ExpiredAt":1760000599000,"Nonce":23,"Sig":"S6uX4tVRQbbF+clupFCWQb+vcm3nyyqqztcl7VzGD8LRLfmN4+cEBKJpMPhFbYM5bXf4iqzSwGzG9pDrb7zTrTT5AQ+vecUMR9yN4Ocn2S8=","L2TxAttributes":null}',
    txHash:
      '9be2ea8298b58d19a2916609af464d3cec8c57dac7ddda18a4a05a09cab0abfa846b751a0a081d73',
  },
  {
    name: 'update asset collateral',
    action: ActionType.UPDATE_ASSET_COLLATERAL,
    params: { asset_index: 1, enabled: true, nonce: 24 },
    txType: 42,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"AssetIndex":1,"AssetMarginMode":1,"ExpiredAt":1760000599000,"Nonce":24,"Sig":"Lq7Fzeje17VxkOxGcf44QtYwP016fThpXllNhIWxKBnt6P2aSpFyNB5/8JN7buJkL3klD6ii4QsMWdp+qQOqbdS1Z8Ed9WCBJJ+0/H+1+Sw=","L2TxAttributes":null}',
    txHash:
      'd485eafaa1f83988ea09e99728f3cfaede95f292c9655543e8800ee70bf2f9a0b9e26b483371c3d9',
  },
  {
    name: 'approve integrator',
    action: ActionType.APPROVE_INTEGRATOR,
    params: {
      integrator_account_index: 12345,
      max_perps_taker_fee: 100,
      max_perps_maker_fee: 50,
      max_spot_taker_fee: 200,
      max_spot_maker_fee: 100,
      approval_expiry: 1760600000000,
      nonce: 25,
    },
    txType: 45,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"IntegratorAccountIndex":12345,"MaxPerpsTakerFee":100,"MaxPerpsMakerFee":50,"MaxSpotTakerFee":200,"MaxSpotMakerFee":100,"ApprovalExpiry":1760600000000,"ExpiredAt":1760000599000,"Nonce":25,"Sig":"h5B6/XQTORl+amAtGhPYvL7juyhmqyY83cmwWsQhyQ3O/FsULOYsE4ha86s5xPW9E8mw7Mc8FQyqRM4bzXXDundeA8qT+jOglBHOQfXpIjo=","L1Sig":"","L2TxAttributes":null}',
    txHash:
      '74edda9492465452b714dc71b4e1e4179c8a001dc36ce9182eedf27b55ac72edb4f0a88ccd266c5a',
    messageToSign:
      'Approve Integrator\n\nnonce: 0x0000000000000019\naccount index: 0x00000000000ade99\napi key index: 0x0000000000000003\nintegrator account index: 0x0000000000003039\nmax perps taker fee: 0x0000000000000064\nmax perps maker fee: 0x0000000000000032\nmax spot taker fee: 0x00000000000000c8\nmax spot maker fee: 0x0000000000000064\napproval expiry: 0x00000199ebf00600\nchainId: 0x0000000000000130\nOnly sign this message for a trusted client!',
  },
  {
    name: 'transfer',
    action: ActionType.TRANSFER,
    params: {
      to_account: 99,
      usdc_amount: 2000000,
      fee: 0,
      memo: '0x000000000000000000000000abababababababababababababababababababab',
      nonce: 26,
    },
    txType: 12,
    txInfo:
      '{"FromAccountIndex":712345,"ApiKeyIndex":3,"ToAccountIndex":99,"AssetIndex":3,"FromRouteType":0,"ToRouteType":0,"Amount":2000000,"USDCFee":0,"Memo":[0,0,0,0,0,0,0,0,0,0,0,0,171,171,171,171,171,171,171,171,171,171,171,171,171,171,171,171,171,171,171,171],"ExpiredAt":1760000599000,"Nonce":26,"Sig":"9blx8M5K8PKYCV8WpOmvxEz7tnfBrQUQX4SbIVVw0iuzymv6YYFzAd+spsGx3FUDw4rnYG7ThbFXH1fhEKG1tycJt276GozXqOW/jh/0FF0=","L1Sig":"","L2TxAttributes":null}',
    txHash:
      'bdaf50398cd12948e92a15d03ab6a8134b03d6f207c2c3d2643cbe080e2109486e602e562458c1d2',
    messageToSign:
      'Transfer\n\nnonce: 0x000000000000001a\nfrom: 0x00000000000ade99 (route 0x0000000000000000)\napi key: 0x0000000000000003\nto: 0x0000000000000063 (route 0x0000000000000000)\nasset: 0x0000000000000003\namount: 0x00000000001e8480\nfee: 0x0000000000000000\nchainId: 0x0000000000000130\nmemo: 000000000000000000000000abababababababababababababababababababab\nOnly sign this message for a trusted client!',
  },
  {
    name: 'change pub key skip_nonce 0',
    action: ActionType.REGISTER_API_KEY,
    params: { nonce: 27, skip_nonce: 0 },
    txType: 8,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"PubKey":"NZCmUQOTgtG2apn6yVDRXBQx/sHZlpWyOnvNw3CfGhmO5DPa6hw4nQ==","L1Sig":"","ExpiredAt":1760000599000,"Nonce":27,"Sig":"Cc/Lv0D8ot3DxAYVFwD+VOd4PYSDWcdlb7EPmSUTP+MbOzfAOzCwcbLh+7a3oi1Q5qkRBzW08U3Vnh/occ+mDlT4oqKOFkUqHqVZ9AyZi24=","L2TxAttributes":null}',
    txHash:
      'f00289bb617adc872675f96b42b5e29ec00f8b12f9030ee3cd0063b57fb39a5d382a4feba1632bfb',
    messageToSign:
      'Register Lighter Account\n\npubkey: 0x3590a651039382d1b66a99fac950d15c1431fec1d99695b23a7bcdc3709f1a198ee433daea1c389d\nnonce: 0x000000000000001b\naccount index: 0x00000000000ade99\napi key index: 0x0000000000000003\nOnly sign this message for a trusted client!',
  },
  {
    name: 'change pub key skip_nonce 1',
    action: ActionType.REGISTER_API_KEY,
    params: { nonce: 27, skip_nonce: 1 },
    txType: 8,
    txInfo:
      '{"AccountIndex":712345,"ApiKeyIndex":3,"PubKey":"NZCmUQOTgtG2apn6yVDRXBQx/sHZlpWyOnvNw3CfGhmO5DPa6hw4nQ==","L1Sig":"","ExpiredAt":1760000599000,"Nonce":27,"Sig":"n7bEgLpRpRe5Iry+n6QNSRu/xTET/3N8SkfKqVeGkFm9f7B+BZ34J9uOTmAyrAanGL2OewqJDzDdD5Ghr7gAKI77kcnKwEzbGK7iA8d+JB4=","L2TxAttributes":{"4":1}}',
    txHash:
      '5f81864893cb113ce01dd8a688be80a0dbc021d312b9bbcde81866cf3b997ddd818537768dd03df4',
    messageToSign:
      'Register Lighter Account\n\npubkey: 0x3590a651039382d1b66a99fac950d15c1431fec1d99695b23a7bcdc3709f1a198ee433daea1c389d\nnonce: 0x000000000000001b\naccount index: 0x00000000000ade99\napi key index: 0x0000000000000003\nOnly sign this message for a trusted client!',
  },
]
