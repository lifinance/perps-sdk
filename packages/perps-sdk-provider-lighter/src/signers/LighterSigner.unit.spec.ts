import { PerpsError } from '@lifi/perps-sdk'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  LIGHTER_MAINNET_DEPLOYMENT,
  LIGHTER_RH_DEPLOYMENT,
} from '../constants.js'
import { LT_ASSET_ID_USDC } from '../types/action.js'
import {
  createSignerSeed,
  LighterSigner,
  type LighterSignerContext,
} from './LighterSigner.js'
import { type LighterWasmExports, loadLighterWasm } from './wasmLoader.js'

// Per-asset precision and minimums as live
// `GET https://mainnet.zklighter.elliot.ai/api/v1/assetDetails` reports them.
const USDC_PERPS_WITHDRAWAL = {
  asset_index: 3,
  route_type: 0,
  amount: '1.5',
  decimals: 6,
  min_withdrawal_amount: '1.000000',
  symbol: 'USDC',
}

const L1_SIGNATURE = `0x${'ab'.repeat(65)}`

const ETH_SPOT_WITHDRAWAL = {
  asset_index: 1,
  route_type: 1,
  amount: '0.00609091',
  decimals: 8,
  min_withdrawal_amount: '0.00100000',
  symbol: 'ETH',
}

describe('LighterSigner', () => {
  let signer: LighterSigner
  let keypair: { publicKey: string; privateKey: string; messageToSign: string }

  beforeAll(async () => {
    signer = new LighterSigner({
      signerChainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
      collateralAssetIndex: LIGHTER_MAINNET_DEPLOYMENT.collateral.assetIndex,
    })
    keypair = await signer.createApiKey(
      { accountIndex: 42, apiKeyIndex: 1 },
      0,
      false
    )
  })

  const ctx = () => ({
    apiKeyPrivateKey: keypair.privateKey,
    apiKeyIndex: 1,
    accountIndex: 42,
  })

  it('createApiKey returns a hex-encoded keypair', () => {
    expect(keypair.publicKey).toMatch(/^0x[0-9a-f]+$/i)
    expect(keypair.privateKey).toMatch(/^0x[0-9a-f]+$/i)
    expect(keypair.publicKey).not.toBe(keypair.privateKey)
  })

  it('generates a fresh random keypair each call', async () => {
    const again = await signer.createApiKey(
      { accountIndex: 42, apiKeyIndex: 1 },
      0,
      false
    )
    expect(again.publicKey).toMatch(/^0x[0-9a-f]+$/i)
    expect(again.privateKey).toMatch(/^0x[0-9a-f]+$/i)
    expect(again.privateKey).not.toBe(keypair.privateKey)
  })

  it('signs PLACE_ORDER into a {txType, txInfo, txHash} blob with no integrator fees', async () => {
    const signed = await signer.sign(
      ActionType.PLACE_ORDER,
      {
        market_index: 0,
        client_order_index: 0,
        base_amount: 1000,
        price: 50_000_000_000,
        is_ask: 0,
        order_type: 0,
        time_in_force: 1,
        reduce_only: false,
        trigger_price: 0,
        order_expiry: -1,
        nonce: 42,
      },
      ctx()
    )
    expect(signed.txType).toBe(14)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed.AccountIndex).toBe(42)
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.Nonce).toBe(42)
    // Unset integrator/self-trade sentinels must yield empty tx attributes.
    expect(parsed.L2TxAttributes).toBeNull()
  })

  it('signs PLACE_TWAP_ORDER through SignCreateOrder with wire type 6', async () => {
    const signed = await signer.sign(
      ActionType.PLACE_TWAP_ORDER,
      {
        market_index: 0,
        client_order_index: 3156,
        base_amount: 5000,
        price: 1,
        is_ask: 1,
        order_type: 6,
        time_in_force: 1,
        reduce_only: true,
        trigger_price: 0,
        order_expiry: 1_775_000_900_000,
        nonce: 43,
      },
      ctx()
    )

    expect(signed.txType).toBe(14)
    expect(JSON.parse(signed.txInfo)).toMatchObject({
      Type: 6,
      ClientOrderIndex: 3156,
      IsAsk: 1,
      ReduceOnly: 1,
    })
  })

  it('signs CANCEL_TWAP_ORDER through SignCancelOrder', async () => {
    const signed = await signer.sign(
      ActionType.CANCEL_TWAP_ORDER,
      { market_index: 0, order_index: 3156, nonce: 44 },
      ctx()
    )

    expect(signed.txType).toBe(15)
    expect(JSON.parse(signed.txInfo)).toMatchObject({
      Index: 3156,
      Nonce: 44,
    })
  })

  it('signs CANCEL_ORDER', async () => {
    const signed = await signer.sign(
      ActionType.CANCEL_ORDER,
      { market_index: 0, order_index: 999, nonce: 7 },
      ctx()
    )
    expect(signed.txType).toBe(15)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed.Nonce).toBe(7)
    expect(parsed.AccountIndex).toBe(42)
  })

  it('signs CANCEL_ORDER with an order_index decimal string', async () => {
    const signed = await signer.sign(
      ActionType.CANCEL_ORDER,
      { market_index: 0, order_index: '1152921504606846975', nonce: 7 },
      ctx()
    )
    expect(signed.txInfo).toContain('"Index":1152921504606846975,')
  })

  it.each([
    ['a string above the int64 maximum', '9223372036854775808'],
    ['a string that is not an integer', '12.5'],
    ['a string with a leading zero', '012'],
    ['a number above 2^53', 2 ** 53 + 2],
    ['a fractional number', 1.5],
  ])('CANCEL_ORDER rejects an order_index of %s', async (_name, orderIndex) => {
    await expect(
      signer.sign(
        ActionType.CANCEL_ORDER,
        { market_index: 0, order_index: orderIndex, nonce: 7 },
        ctx()
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
  })

  it('signs CANCEL_ALL_ORDERS', async () => {
    const signed = await signer.sign(
      ActionType.CANCEL_ALL_ORDERS,
      // time_in_force 0 = immediate; the WASM signer rejects a non-zero
      // timestamp_ms ("CancelAllTime should be nil") for an immediate cancel.
      { time_in_force: 0, timestamp_ms: 0, nonce: 5 },
      ctx()
    )
    expect(signed.txType).toBe(16)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    // Threaded context plus the backend-supplied schedule params must land in
    // the signed blob (field names from Lighter's cancel-all tx struct).
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.AccountIndex).toBe(42)
    expect(parsed.TimeInForce).toBe(0)
    expect(parsed.Time).toBe(0)
    expect(parsed.Nonce).toBe(5)
  })

  it('signs WITHDRAWAL against the caller-selected asset and route', async () => {
    const signed = await signer.sign(
      ActionType.WITHDRAWAL,
      { ...USDC_PERPS_WITHDRAWAL, nonce: 8 },
      ctx()
    )
    expect(signed.txType).toBe(13)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.FromAccountIndex).toBe(42)
    expect(parsed.AssetIndex).toBe(3)
    expect(parsed.RouteType).toBe(0)
    expect(parsed.Amount).toBe(1_500_000)
    expect(parsed.Nonce).toBe(8)
  })

  it('signs a spot-route withdrawal of an 8-decimal asset', async () => {
    const signed = await signer.sign(
      ActionType.WITHDRAWAL,
      { ...ETH_SPOT_WITHDRAWAL, nonce: 9 },
      ctx()
    )
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed.AssetIndex).toBe(1)
    expect(parsed.RouteType).toBe(1)
    expect(parsed.Amount).toBe(609_091)
  })

  it('truncates a withdrawal amount finer than the asset grid toward zero', async () => {
    const signed = await signer.sign(
      ActionType.WITHDRAWAL,
      { ...ETH_SPOT_WITHDRAWAL, amount: '0.0060909199', nonce: 10 },
      ctx()
    )
    expect(JSON.parse(signed.txInfo).Amount).toBe(609_091)
  })

  it('rejects a route_type outside the two Lighter routes', async () => {
    await expect(
      signer.sign(
        ActionType.WITHDRAWAL,
        { ...USDC_PERPS_WITHDRAWAL, route_type: 2, nonce: 11 },
        ctx()
      )
    ).rejects.toThrow(/route_type 2 is invalid/)
  })

  it('identifies an empty withdrawal amount', async () => {
    await expect(
      signer.sign(
        ActionType.WITHDRAWAL,
        { ...ETH_SPOT_WITHDRAWAL, amount: '', nonce: 12 },
        ctx()
      )
    ).rejects.toThrow("Lighter sign params string field 'amount' is empty")
  })

  it('rejects a withdrawal below the asset minimum, naming asset and minimum', async () => {
    await expect(
      signer.sign(
        ActionType.WITHDRAWAL,
        { ...ETH_SPOT_WITHDRAWAL, amount: '0.0005', nonce: 12 },
        ctx()
      )
    ).rejects.toThrow(/0.0005 ETH is below the venue minimum of 0.00100000 ETH/)
  })

  it('accepts a withdrawal exactly at the asset minimum', async () => {
    const signed = await signer.sign(
      ActionType.WITHDRAWAL,
      { ...ETH_SPOT_WITHDRAWAL, amount: '0.00100000', nonce: 13 },
      ctx()
    )
    expect(JSON.parse(signed.txInfo).Amount).toBe(100_000)
  })

  // `memo` is 32 raw bytes, 64 hex chars, or `0x` plus 64 hex chars.
  const MEMO_32_BYTES = 'a'.repeat(32)

  const TRANSFER_PARAMS = {
    to_account: 7,
    usdc_amount: 250_000,
    fee: 100,
    memo: MEMO_32_BYTES,
    nonce: 12,
  }

  const signTransfer = (params: Record<string, unknown>) =>
    signer.signL1Countersigned(ActionType.TRANSFER, params, ctx(), L1_SIGNATURE)

  it('signs TRANSFER (fastwithdraw signed-transfer flow)', async () => {
    const signed = await signTransfer(TRANSFER_PARAMS)
    expect(signed.txType).toBe(12)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    // The signer must thread our context (api key + account) AND the
    // backend-supplied transfer params into the signed blob. The asserted field
    // names come from Lighter's transfer tx struct.
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.FromAccountIndex).toBe(42)
    expect(parsed.ToAccountIndex).toBe(7)
    expect(parsed.AssetIndex).toBe(3)
    expect(parsed.Amount).toBe(250_000)
    expect(parsed.USDCFee).toBe(100)
    expect(parsed.Nonce).toBe(12)
    // Memo is serialized as a byte array — every entry should be 0x61 ('a').
    expect(parsed.Memo).toHaveLength(32)
    expect(parsed.Memo.every((b: number) => b === 0x61)).toBe(true)
    expect(parsed.L1Sig).toBe(L1_SIGNATURE)
  })

  it.each([
    ['64 hex chars', '61'.repeat(32)],
    ['0x plus 64 hex chars', `0x${'61'.repeat(32)}`],
  ])('signs TRANSFER with a memo of %s', async (_name, memo) => {
    const signed = await signTransfer({ ...TRANSFER_PARAMS, memo })
    expect(JSON.parse(signed.txInfo).Memo).toEqual(new Array(32).fill(0x61))
  })

  it.each([
    ['31 bytes', 'a'.repeat(31)],
    ['63 hex chars', '6'.repeat(63)],
    ['64 chars that are not hex', 'g'.repeat(64)],
  ])('TRANSFER rejects a memo of %s', async (_name, memo) => {
    await expect(
      signTransfer({ ...TRANSFER_PARAMS, memo })
    ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
  })

  it('getL1Message returns the Transfer L1 message body', async () => {
    const message = await signer.getL1Message(
      ActionType.TRANSFER,
      TRANSFER_PARAMS,
      ctx()
    )
    // Byte-for-byte match with lighter-go `TemplateTransfer`
    // (`types/txtypes/utils.go`) rendered by `GetL1SignatureBody(chainId)` —
    // each numeric field is `getHex10FromUint64`: 16 zero-padded lowercase hex
    // digits. Field order: nonce, from account(42) and route, api key index(1),
    // to account(7) and route, asset(3), amount, fee, chainId(304, the signer
    // default), memo.
    const expectedMessage =
      'Transfer\n\n' +
      'nonce: 0x000000000000000c\n' +
      'from: 0x000000000000002a (route 0x0000000000000000)\n' +
      'api key: 0x0000000000000001\n' +
      'to: 0x0000000000000007 (route 0x0000000000000000)\n' +
      'asset: 0x0000000000000003\n' +
      'amount: 0x000000000003d090\n' +
      'fee: 0x0000000000000064\n' +
      'chainId: 0x0000000000000130\n' +
      `memo: ${'61'.repeat(32)}\n` +
      'Only sign this message for a trusted client!'
    expect(message).toBe(expectedMessage)
  })

  it('sign() refuses TRANSFER, so no transfer blob leaves without an L1 signature', async () => {
    await expect(
      signer.sign(ActionType.TRANSFER, TRANSFER_PARAMS, ctx())
    ).rejects.toThrow(/needs the user's L1 signature/)
  })

  it('TRANSFER rejects missing numeric param with a clear error', async () => {
    await expect(
      // missing usdc_amount
      signTransfer({ to_account: 7, fee: 100, memo: MEMO_32_BYTES, nonce: 12 })
    ).rejects.toThrow(/usdc_amount/)
  })

  it('TRANSFER rejects missing memo (string field) with a clear error', async () => {
    await expect(
      // missing memo
      signTransfer({ to_account: 7, usdc_amount: 250_000, fee: 100, nonce: 12 })
    ).rejects.toThrow(/memo/)
  })

  it('signs SEND_ASSET spot→perps as a self-transfer with the spot/perps route args', async () => {
    const signed = await signer.sign(
      ActionType.SEND_ASSET,
      {
        sourceDex: 'spot',
        destinationDex: 'perps',
        amount: 250_000,
        nonce: 20,
      },
      ctx()
    )
    // SEND_ASSET reuses Lighter's L2Transfer (txType 12).
    expect(signed.txType).toBe(12)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    // Self-transfer: both account indices are the signer's own account.
    expect(parsed.FromAccountIndex).toBe(42)
    expect(parsed.ToAccountIndex).toBe(42)
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.AssetIndex).toBe(3)
    // spot (1) → perps (0).
    expect(parsed.FromRouteType).toBe(1)
    expect(parsed.ToRouteType).toBe(0)
    expect(parsed.Amount).toBe(250_000)
    expect(parsed.USDCFee).toBe(0)
    expect(parsed.Nonce).toBe(20)
    // Zero memo — 32 zero bytes.
    expect(parsed.Memo).toHaveLength(32)
    expect(parsed.Memo.every((b: number) => b === 0)).toBe(true)
  })

  it('signs SEND_ASSET perps→spot with the reversed route args', async () => {
    const signed = await signer.sign(
      ActionType.SEND_ASSET,
      {
        sourceDex: 'perps',
        destinationDex: 'spot',
        amount: 100_000,
        nonce: 21,
      },
      ctx()
    )
    expect(signed.txType).toBe(12)
    const parsed = JSON.parse(signed.txInfo)
    // perps (0) → spot (1).
    expect(parsed.FromRouteType).toBe(0)
    expect(parsed.ToRouteType).toBe(1)
    expect(parsed.Amount).toBe(100_000)
  })

  it('SEND_ASSET rejects a same-route (no-op) transfer', async () => {
    await expect(
      signer.sign(
        ActionType.SEND_ASSET,
        {
          sourceDex: 'perps',
          destinationDex: 'perps',
          amount: 100_000,
          nonce: 22,
        },
        ctx()
      )
    ).rejects.toThrow(/distinct source\/destination routes/)
  })

  it("SEND_ASSET rejects the legacy 'perp' route string", async () => {
    await expect(
      signer.sign(
        ActionType.SEND_ASSET,
        {
          sourceDex: 'spot',
          destinationDex: 'perp',
          amount: 100_000,
          nonce: 23,
        },
        ctx()
      )
    ).rejects.toThrow(/unsupported dex 'perp' \(expected 'perps' or 'spot'\)/)
  })

  it('SEND_ASSET rejects an unrecognised dex string', async () => {
    await expect(
      signer.sign(
        ActionType.SEND_ASSET,
        {
          sourceDex: 'spot',
          destinationDex: 'margin',
          amount: 100_000,
          nonce: 24,
        },
        ctx()
      )
    ).rejects.toThrow(/unsupported dex 'margin'/)
  })

  it('rejects unsupported action types with a clear error', async () => {
    await expect(
      signer.sign(
        // DEPOSIT has no Lighter WASM binding — exercises the dispatch
        // default branch.
        ActionType.DEPOSIT,
        { nonce: 1 },
        ctx()
      )
    ).rejects.toThrow(/does not support action/)
  })

  it('signs UPDATE_LEVERAGE', async () => {
    const signed = await signer.sign(
      ActionType.UPDATE_LEVERAGE,
      { market_index: 0, fraction: 1000, margin_mode: 0, nonce: 9 },
      ctx()
    )
    expect(signed.txType).toBe(20)
  })

  it('signs UPDATE_POSITION_MARGIN', async () => {
    const signed = await signer.sign(
      ActionType.UPDATE_POSITION_MARGIN,
      { market_index: 0, usdc_amount: 1000, direction: 1, nonce: 10 },
      ctx()
    )
    expect(signed.txType).toBe(29)
  })

  it('signs MODIFY_ORDER', async () => {
    const signed = await signer.sign(
      ActionType.MODIFY_ORDER,
      {
        market_index: 0,
        order_index: 1,
        base_amount: 100,
        price: 50_000_000_000,
        trigger_price: 0,
        nonce: 11,
      },
      ctx()
    )
    expect(signed.txType).toBe(17)
    // Unset integrator/self-trade sentinels must yield empty tx attributes.
    expect(JSON.parse(signed.txInfo).L2TxAttributes).toBeNull()
  })

  it('PLACE_ORDER threads backend integrator fees into L2TxAttributes', async () => {
    const signed = await signer.sign(
      ActionType.PLACE_ORDER,
      {
        market_index: 0,
        client_order_index: 0,
        base_amount: 1000,
        price: 50_000_000_000,
        is_ask: 0,
        order_type: 0,
        time_in_force: 1,
        reduce_only: false,
        trigger_price: 0,
        order_expiry: -1,
        integrator_account_index: 5,
        integrator_taker_fee: 250,
        integrator_maker_fee: 100,
        nonce: 42,
      },
      ctx()
    )
    expect(signed.txType).toBe(14)
    // L2TxAttributes is a Go `map[uint8]int`: key 1 = integrator account
    // index, 2 = taker fee, 3 = maker fee (uint32 ppm of FeeTick=1_000_000).
    expect(JSON.parse(signed.txInfo).L2TxAttributes).toEqual({
      '1': 5,
      '2': 250,
      '3': 100,
    })
  })

  it('PLACE_ORDER with explicit all-zero integrator fields emits no attributes (same as omitting them)', async () => {
    // All-zero integrator input must collapse to the nil sentinels, leaving
    // L2TxAttributes null — identical wire attributes to omitting the fields.
    const signed = await signer.sign(
      ActionType.PLACE_ORDER,
      {
        market_index: 0,
        client_order_index: 0,
        base_amount: 1000,
        price: 50_000_000_000,
        is_ask: 0,
        order_type: 0,
        time_in_force: 1,
        reduce_only: false,
        trigger_price: 0,
        order_expiry: -1,
        integrator_account_index: 0,
        integrator_taker_fee: 0,
        integrator_maker_fee: 0,
        nonce: 42,
      },
      ctx()
    )
    expect(JSON.parse(signed.txInfo).L2TxAttributes).toBeNull()
  })

  it('MODIFY_ORDER does not sign integrator fields', async () => {
    const signed = await signer.sign(
      ActionType.MODIFY_ORDER,
      {
        market_index: 0,
        order_index: 1,
        base_amount: 100,
        price: 50_000_000_000,
        trigger_price: 0,
        integrator_account_index: 5,
        integrator_taker_fee: 250,
        integrator_maker_fee: 100,
        nonce: 11,
      },
      ctx()
    )
    expect(signed.txType).toBe(17)
    expect(JSON.parse(signed.txInfo).L2TxAttributes).toBeNull()
  })

  it('signs APPROVE_INTEGRATOR into a type-45 blob with positional args in struct order', async () => {
    const signed = await signer.signL1Countersigned(
      ActionType.APPROVE_INTEGRATOR,
      {
        integrator_account_index: 5,
        max_perps_taker_fee: 250,
        max_perps_maker_fee: 100,
        max_spot_taker_fee: 300,
        max_spot_maker_fee: 150,
        approval_expiry: 1_893_456_000,
        nonce: 3,
      },
      ctx(),
      L1_SIGNATURE
    )
    expect(signed.txType).toBe(45)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed.L1Sig).toBe(L1_SIGNATURE)
    // Field-level positional-arg verification against lighter-go
    // `types/txtypes/approve_integrator.go` (rev c26ac340). Wrong arg order
    // would land these values in the wrong struct fields.
    expect(parsed.AccountIndex).toBe(42)
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.IntegratorAccountIndex).toBe(5)
    expect(parsed.MaxPerpsTakerFee).toBe(250)
    expect(parsed.MaxPerpsMakerFee).toBe(100)
    expect(parsed.MaxSpotTakerFee).toBe(300)
    expect(parsed.MaxSpotMakerFee).toBe(150)
    expect(parsed.ApprovalExpiry).toBe(1_893_456_000)
    expect(parsed.Nonce).toBe(3)
  })

  it('signs REVOKE_INTEGRATOR through sign() into an L2-only type-45 blob with zero fees and expiry', async () => {
    const signed = await signer.sign(
      ActionType.REVOKE_INTEGRATOR,
      {
        integrator_account_index: 5,
        max_perps_taker_fee: 0,
        max_perps_maker_fee: 0,
        max_spot_taker_fee: 0,
        max_spot_maker_fee: 0,
        approval_expiry: 0,
        nonce: 3,
      },
      ctx()
    )
    expect(signed.txType).toBe(45)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed).toMatchObject({
      AccountIndex: 42,
      ApiKeyIndex: 1,
      IntegratorAccountIndex: 5,
      MaxPerpsTakerFee: 0,
      MaxPerpsMakerFee: 0,
      MaxSpotTakerFee: 0,
      MaxSpotMakerFee: 0,
      ApprovalExpiry: 0,
      Nonce: 3,
    })
    expect(parsed.L1Sig ?? '').toBe('')
    expect(parsed.Sig).toBeTruthy()
  })

  it.each([
    'max_perps_taker_fee',
    'max_perps_maker_fee',
    'max_spot_taker_fee',
    'max_spot_maker_fee',
    'approval_expiry',
  ])('rejects REVOKE_INTEGRATOR when %s is non-zero', async (field) => {
    const freshSigner = new LighterSigner({
      signerChainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
      collateralAssetIndex: LIGHTER_MAINNET_DEPLOYMENT.collateral.assetIndex,
    })
    const initialize = vi
      .spyOn(freshSigner, 'initialize')
      .mockRejectedValue(new Error('WASM initialized'))

    await expect(
      freshSigner.sign(
        ActionType.REVOKE_INTEGRATOR,
        {
          integrator_account_index: 5,
          max_perps_taker_fee: 0,
          max_perps_maker_fee: 0,
          max_spot_taker_fee: 0,
          max_spot_maker_fee: 0,
          approval_expiry: 0,
          nonce: 3,
          [field]: 1,
        },
        {
          apiKeyPrivateKey: 'not-read',
          apiKeyIndex: 1,
          accountIndex: 42,
        }
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
    expect(initialize).not.toHaveBeenCalled()
  })

  it('APPROVE_INTEGRATOR rejects a missing fee-cap param with a clear error', async () => {
    await expect(
      signer.signL1Countersigned(
        ActionType.APPROVE_INTEGRATOR,
        {
          integrator_account_index: 5,
          max_perps_taker_fee: 250,
          max_perps_maker_fee: 100,
          // missing max_spot_taker_fee / max_spot_maker_fee
          approval_expiry: 1_893_456_000,
          nonce: 3,
        },
        ctx(),
        L1_SIGNATURE
      )
    ).rejects.toThrow(/max_spot_taker_fee/)
  })

  it('getL1Message returns the L2ApproveIntegrator L1 message body', async () => {
    const message = await signer.getL1Message(
      ActionType.APPROVE_INTEGRATOR,
      {
        integrator_account_index: 5,
        max_perps_taker_fee: 250,
        max_perps_maker_fee: 100,
        max_spot_taker_fee: 300,
        max_spot_maker_fee: 150,
        approval_expiry: 1_893_456_000,
        nonce: 3,
      },
      ctx()
    )

    // Byte-for-byte match with lighter-go `TemplateL2ApproveIntegrator`
    // (`types/txtypes/utils.go`) rendered by `GetL1SignatureBody(chainId)` —
    // each field is `getHex10FromUint64`: 16 zero-padded lowercase hex digits.
    // Field order: nonce, accountIndex(42), apiKeyIndex(1), integrator index,
    // fees, approvalExpiry, chainId(304, the signer default).
    const expectedMessage =
      'Approve Integrator\n\n' +
      'nonce: 0x0000000000000003\n' +
      'account index: 0x000000000000002a\n' +
      'api key index: 0x0000000000000001\n' +
      'integrator account index: 0x0000000000000005\n' +
      'max perps taker fee: 0x00000000000000fa\n' +
      'max perps maker fee: 0x0000000000000064\n' +
      'max spot taker fee: 0x000000000000012c\n' +
      'max spot maker fee: 0x0000000000000096\n' +
      'approval expiry: 0x0000000070dbd880\n' +
      'chainId: 0x0000000000000130\n' +
      'Only sign this message for a trusted client!'
    expect(message).toBe(expectedMessage)
  })

  it('signs ACCOUNT_MODE into a type-41 blob carrying the trading mode', async () => {
    const signed = await signer.sign(
      ActionType.ACCOUNT_MODE,
      { account_trading_mode: 1, nonce: 4 },
      ctx()
    )
    expect(signed.txType).toBe(41)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed.AccountIndex).toBe(42)
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.AccountTradingMode).toBe(1)
    expect(parsed.Nonce).toBe(4)
  })

  it('signs ACCOUNT_MODE = 0 (Simple) into a type-41 blob', async () => {
    const signed = await signer.sign(
      ActionType.ACCOUNT_MODE,
      { account_trading_mode: 0, nonce: 5 },
      ctx()
    )
    expect(signed.txType).toBe(41)
    expect(JSON.parse(signed.txInfo).AccountTradingMode).toBe(0)
  })

  it('ACCOUNT_MODE rejects a missing account_trading_mode param with a clear error', async () => {
    await expect(
      signer.sign(ActionType.ACCOUNT_MODE, { nonce: 4 }, ctx())
    ).rejects.toThrow(/account_trading_mode/)
  })

  it('signs UPDATE_ASSET_COLLATERAL (enabled) into a type-42 blob with AssetMarginMode 1', async () => {
    const signed = await signer.sign(
      ActionType.UPDATE_ASSET_COLLATERAL,
      { asset_index: 5, enabled: true, nonce: 4 },
      ctx()
    )
    expect(signed.txType).toBe(42)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed.AccountIndex).toBe(42)
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.AssetIndex).toBe(5)
    // enabled → MarginEnabled (1)
    expect(parsed.AssetMarginMode).toBe(1)
    expect(parsed.Nonce).toBe(4)
  })

  it('signs UPDATE_ASSET_COLLATERAL (disabled) into a type-42 blob with AssetMarginMode 0', async () => {
    const signed = await signer.sign(
      ActionType.UPDATE_ASSET_COLLATERAL,
      { asset_index: 5, enabled: false, nonce: 6 },
      ctx()
    )
    expect(signed.txType).toBe(42)
    // disabled → MarginDisabled (0)
    expect(JSON.parse(signed.txInfo).AssetMarginMode).toBe(0)
  })

  it('UPDATE_ASSET_COLLATERAL rejects a missing asset_index with a clear error', async () => {
    await expect(
      signer.sign(
        ActionType.UPDATE_ASSET_COLLATERAL,
        { enabled: true, nonce: 4 },
        ctx()
      )
    ).rejects.toThrow(/asset_index/)
  })

  it('UPDATE_ASSET_COLLATERAL rejects a missing enabled flag with a clear error', async () => {
    await expect(
      signer.sign(
        ActionType.UPDATE_ASSET_COLLATERAL,
        { asset_index: 5, nonce: 4 },
        ctx()
      )
    ).rejects.toThrow(/missing boolean field 'enabled'/)
  })

  it('REGISTER_API_KEY through sign() throws', async () => {
    await expect(
      signer.sign(
        ActionType.REGISTER_API_KEY,
        { api_key_index: 1, nonce: 0 },
        ctx()
      )
    ).rejects.toThrow(/needs the user's L1 signature/)
  })

  it('APPROVE_INTEGRATOR through sign() throws', async () => {
    await expect(
      signer.sign(
        ActionType.APPROVE_INTEGRATOR,
        { integrator_account_index: 45, nonce: 0 },
        ctx()
      )
    ).rejects.toThrow(/needs the user's L1 signature/)
  })

  it('createApiKey returns the register message and signChangePubKey embeds the L1 signature', async () => {
    const result = await signer.signChangePubKey(ctx(), 0, false, L1_SIGNATURE)
    const parsed = JSON.parse(result.txInfo)
    expect(result.txType).toBe(8)
    expect(parsed.L1Sig).toBe(L1_SIGNATURE)
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.AccountIndex).toBe(42)
    expect(keypair.messageToSign).toContain('Register Lighter Account')
    expect(keypair.messageToSign).toContain(keypair.publicKey.slice(2))
  })

  it('createAuthToken returns a token for the /changeAccountTier ACCOUNT_TYPE contract', async () => {
    // ACCOUNT_TYPE is dispatched as a WASM_BLOB action but `/changeAccountTier`
    // is HTTP-only — its "signature" is the same Lighter auth token the read
    // endpoints consume, not a wasm-signed tx blob.
    const token = await signer.createAuthToken(ctx())
    expect(token).toMatch(/^\d+:42:1:[0-9a-f]+$/)
  })

  it('rejects params missing required numeric fields', async () => {
    await expect(
      signer.sign(
        ActionType.CANCEL_ORDER,
        { market_index: 0 /* missing order_index and nonce */ },
        ctx()
      )
    ).rejects.toThrow(/missing numeric field/)
  })
  const signerWithWasm = async (
    overrides: Partial<LighterWasmExports>
  ): Promise<LighterSigner> => {
    const wasm = await loadLighterWasm()
    return Object.assign(
      new LighterSigner({
        signerChainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
        collateralAssetIndex: LIGHTER_MAINNET_DEPLOYMENT.collateral.assetIndex,
      }),
      { wasm: { ...wasm, ...overrides } }
    )
  }

  const slot = { accountIndex: 42, apiKeyIndex: 1 }

  it('createApiKey classifies a WASM failure as an invalid signature', async () => {
    const failedSigner = await signerWithWasm({
      _createClient: () => Promise.resolve({ error: 'seed rejected' }),
    })

    const failure = failedSigner.createApiKey(slot, 0, false)
    await expect(failure).rejects.toBeInstanceOf(PerpsError)
    await expect(failure).rejects.toMatchObject({
      code: PerpsErrorCode.SignatureInvalid,
    })
  })

  it('createApiKey classifies a client with no L1 message as an invalid signature', async () => {
    const failedSigner = await signerWithWasm({
      _createClient: () =>
        Promise.resolve({
          pk: '12',
          prv: '34',
          body: '',
          pubKeySuccess: false,
        }),
    })

    await expect(
      failedSigner.createApiKey(slot, 0, false)
    ).rejects.toMatchObject({
      code: PerpsErrorCode.SignatureInvalid,
    })
  })

  it('sign classifies invalid caller parameters as a validation error', async () => {
    await expect(
      signer.sign(ActionType.CANCEL_ORDER, { market_index: 0 }, ctx())
    ).rejects.toMatchObject({
      code: PerpsErrorCode.ValidationError,
    })
  })

  it('sign classifies a WASM failure as an invalid signature', async () => {
    const failedSigner = await signerWithWasm({
      _signCancelOrder: () =>
        Promise.resolve({ error: 'cancel signing failed' }),
    })

    await expect(
      failedSigner.sign(
        ActionType.CANCEL_ORDER,
        { market_index: 0, order_index: 1, nonce: 1 },
        ctx()
      )
    ).rejects.toMatchObject({
      code: PerpsErrorCode.SignatureInvalid,
    })
  })

  it('rejects an exponent-notation withdrawal amount before SignWithdraw', async () => {
    const signWithdraw = vi.fn<LighterWasmExports['_signWithdraw']>()
    const guardedSigner = await signerWithWasm({ _signWithdraw: signWithdraw })

    const failure = guardedSigner.sign(
      ActionType.WITHDRAWAL,
      {
        ...ETH_SPOT_WITHDRAWAL,
        amount: '1e-7',
        min_withdrawal_amount: '0.00000001',
        nonce: 14,
      },
      ctx()
    )

    await expect(failure).rejects.toBeInstanceOf(PerpsError)
    await expect(failure).rejects.toMatchObject({
      code: PerpsErrorCode.ValidationError,
      message: "'1e-7' does not match the decimal pattern.",
    })
    expect(signWithdraw).not.toHaveBeenCalled()
  })

  it('signChangePubKey classifies a WASM failure as an invalid signature', async () => {
    const failedSigner = await signerWithWasm({
      _signChangePubKey: () =>
        Promise.resolve({ error: 'change-pub-key signing failed' }),
    })

    await expect(
      failedSigner.signChangePubKey(ctx(), 0, false, L1_SIGNATURE)
    ).rejects.toMatchObject({
      code: PerpsErrorCode.SignatureInvalid,
    })
  })

  it('signL1Countersigned classifies an APPROVE_INTEGRATOR WASM failure as an invalid signature', async () => {
    const failedSigner = await signerWithWasm({
      _signApproveIntegrator: () =>
        Promise.resolve({ error: 'integrator approval signing failed' }),
    })

    await expect(
      failedSigner.signL1Countersigned(
        ActionType.APPROVE_INTEGRATOR,
        {
          integrator_account_index: 5,
          max_perps_taker_fee: 250,
          max_perps_maker_fee: 100,
          max_spot_taker_fee: 300,
          max_spot_maker_fee: 150,
          approval_expiry: 1_893_456_000,
          nonce: 3,
        },
        ctx(),
        L1_SIGNATURE
      )
    ).rejects.toMatchObject({
      code: PerpsErrorCode.SignatureInvalid,
    })
  })

  it('signL1Countersigned classifies a TRANSFER WASM failure as an invalid signature', async () => {
    const failedSigner = await signerWithWasm({
      _signTransfer: () =>
        Promise.resolve({ error: 'transfer signing failed' }),
    })

    await expect(
      failedSigner.signL1Countersigned(
        ActionType.TRANSFER,
        TRANSFER_PARAMS,
        ctx(),
        L1_SIGNATURE
      )
    ).rejects.toMatchObject({
      code: PerpsErrorCode.SignatureInvalid,
    })
  })

  it('createAuthToken classifies a WASM failure as an invalid signature', async () => {
    const failedSigner = await signerWithWasm({
      _createAuthToken: () =>
        Promise.resolve({ error: 'auth-token signing failed' }),
    })

    await expect(failedSigner.createAuthToken(ctx())).rejects.toMatchObject({
      code: PerpsErrorCode.SignatureInvalid,
    })
  })

  it('classifies WASM client initialization failure as an invalid signature', async () => {
    const failedSigner = await signerWithWasm({
      _createClientByPrv: () =>
        Promise.resolve({ error: 'private key rejected' }),
    })

    await expect(failedSigner.createAuthToken(ctx())).rejects.toMatchObject({
      code: PerpsErrorCode.SignatureInvalid,
    })
  })
})

describe('createSignerSeed', () => {
  it('returns 32 bytes from crypto.getRandomValues as 0x hex', () => {
    const getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues')
    try {
      expect(createSignerSeed()).toMatch(/^0x[0-9a-f]{64}$/)
      expect(getRandomValues).toHaveBeenCalledTimes(1)
      expect(getRandomValues.mock.calls[0]?.[0]).toHaveLength(32)
    } finally {
      getRandomValues.mockRestore()
    }
  })

  it('returns a different seed each call', () => {
    expect(createSignerSeed()).not.toBe(createSignerSeed())
  })
})

describe('LighterSigner — WASM client per account', () => {
  const config = {
    signerChainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
    collateralAssetIndex: LIGHTER_MAINNET_DEPLOYMENT.collateral.assetIndex,
  }
  const cancel = { market_index: 0, order_index: 1, nonce: 1 }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const setUp = async () => {
    const createClientByPrv = vi.spyOn(
      await loadLighterWasm(),
      '_createClientByPrv'
    )
    const signerA = new LighterSigner(config)
    const signerB = new LighterSigner(config)
    const slot = { accountIndex: 50, apiKeyIndex: 4 }
    const keyA = (await signerA.createApiKey(slot, 0, false)).privateKey
    const keyB = (await signerA.createApiKey(slot, 0, false)).privateKey
    return { createClientByPrv, signerA, signerB, keyA, keyB, slot }
  }

  it('reuses the client while the key and slot stay the same', async () => {
    const { createClientByPrv, signerA, signerB, keyA, slot } = await setUp()
    const ctx = { ...slot, apiKeyPrivateKey: keyA }

    await signerA.sign(ActionType.CANCEL_ORDER, cancel, ctx)
    await signerB.sign(ActionType.CANCEL_ORDER, cancel, ctx)

    expect(createClientByPrv).toHaveBeenCalledTimes(1)
  })

  it('recreates the client when another signer signs the account with another key', async () => {
    const { createClientByPrv, signerA, signerB, keyA, keyB, slot } =
      await setUp()

    await signerA.sign(ActionType.CANCEL_ORDER, cancel, {
      ...slot,
      apiKeyPrivateKey: keyA,
    })
    const signed = await signerB.sign(ActionType.CANCEL_ORDER, cancel, {
      ...slot,
      apiKeyPrivateKey: keyB,
    })

    expect(createClientByPrv.mock.calls.map((call) => call[0])).toEqual([
      keyA,
      keyB,
    ])
    expect(JSON.parse(signed.txInfo).ApiKeyIndex).toBe(slot.apiKeyIndex)
  })

  it('recreates the client when the API key index changes', async () => {
    const { createClientByPrv, signerA, keyA, slot } = await setUp()

    await signerA.sign(ActionType.CANCEL_ORDER, cancel, {
      ...slot,
      apiKeyPrivateKey: keyA,
    })
    const signed = await signerA.sign(ActionType.CANCEL_ORDER, cancel, {
      ...slot,
      apiKeyIndex: 5,
      apiKeyPrivateKey: keyA,
    })

    expect(createClientByPrv.mock.calls.map((call) => call[4])).toEqual([
      slot.apiKeyIndex,
      5,
    ])
    expect(JSON.parse(signed.txInfo).ApiKeyIndex).toBe(5)
  })
})

describe('LighterSigner — per-instance collateral asset', () => {
  // Distinct from every real deployment's slot, so the assertions can only pass
  // by threading the configured index through to the signed payload.
  const FIXTURE_ASSET_INDEX = 7
  const MEMO_32_BYTES = 'b'.repeat(32)

  /** `AssetIndex` of the signed blob for each instance-owned transfer path. */
  const signedAssetIndexes = async (
    signer: LighterSigner,
    ctx: LighterSignerContext
  ) => {
    const transfer = await signer.signL1Countersigned(
      ActionType.TRANSFER,
      {
        to_account: 7,
        usdc_amount: 250_000,
        fee: 100,
        memo: MEMO_32_BYTES,
        nonce: 2,
      },
      ctx,
      L1_SIGNATURE
    )
    const sendAsset = await signer.sign(
      ActionType.SEND_ASSET,
      {
        sourceDex: 'spot',
        destinationDex: 'perps',
        amount: 250_000,
        nonce: 3,
      },
      ctx
    )
    return {
      transfer: JSON.parse(transfer.txInfo).AssetIndex,
      sendAsset: JSON.parse(sendAsset.txInfo).AssetIndex,
    }
  }

  const contextFor = async (
    signer: LighterSigner,
    accountIndex: number
  ): Promise<LighterSignerContext> => ({
    apiKeyPrivateKey: (
      await signer.createApiKey({ accountIndex, apiKeyIndex: 3 }, 0, false)
    ).privateKey,
    apiKeyIndex: 3,
    accountIndex,
  })

  it('signs both TRANSFER paths against the configured collateral index', async () => {
    const signer = new LighterSigner({
      signerChainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
      collateralAssetIndex: FIXTURE_ASSET_INDEX,
    })
    expect(
      await signedAssetIndexes(signer, await contextFor(signer, 43))
    ).toEqual({
      transfer: FIXTURE_ASSET_INDEX,
      sendAsset: FIXTURE_ASSET_INDEX,
    })
  })

  it('signs WITHDRAWAL against the caller selection, not the configured collateral index', async () => {
    const signer = new LighterSigner({
      signerChainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
      collateralAssetIndex: FIXTURE_ASSET_INDEX,
    })
    const signed = await signer.sign(
      ActionType.WITHDRAWAL,
      { ...ETH_SPOT_WITHDRAWAL, nonce: 1 },
      await contextFor(signer, 46)
    )
    const parsed = JSON.parse(signed.txInfo)
    expect(parsed.AssetIndex).toBe(1)
    expect(parsed.RouteType).toBe(1)
  })

  it('signs the lighter-rh deployment against USDG, its own collateral slot', async () => {
    const signer = new LighterSigner({
      signerChainId: LIGHTER_RH_DEPLOYMENT.signerChainId,
      collateralAssetIndex: LIGHTER_RH_DEPLOYMENT.collateral.assetIndex,
    })
    expect(LIGHTER_RH_DEPLOYMENT.collateral.displaySymbol).toBe('USDG')
    expect(
      await signedAssetIndexes(signer, await contextFor(signer, 44))
    ).toEqual({
      transfer: LIGHTER_RH_DEPLOYMENT.collateral.assetIndex,
      sendAsset: LIGHTER_RH_DEPLOYMENT.collateral.assetIndex,
    })
  })

  it('signs the mainnet deployment against USDC (3)', async () => {
    const signer = new LighterSigner({
      signerChainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
      collateralAssetIndex: LIGHTER_MAINNET_DEPLOYMENT.collateral.assetIndex,
    })
    expect(
      await signedAssetIndexes(signer, await contextFor(signer, 45))
    ).toEqual({
      transfer: LT_ASSET_ID_USDC,
      sendAsset: LT_ASSET_ID_USDC,
    })
  })
})
