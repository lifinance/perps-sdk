import { ActionType } from '@lifi/perps-types'
import { beforeAll, describe, expect, it } from 'vitest'
import { LighterSigner } from './LighterSigner.js'

describe('LighterSigner', () => {
  let signer: LighterSigner
  let keypair: { publicKey: string; privateKey: string }

  beforeAll(async () => {
    signer = new LighterSigner()
    keypair = await signer.generateAPIKey()
  })

  const ctx = () => ({
    apiKeyPrivateKey: keypair.privateKey,
    apiKeyIndex: 1,
    accountIndex: 42,
  })

  it('generateAPIKey returns matching hex-encoded keypair', () => {
    expect(keypair.publicKey).toMatch(/^0x[0-9a-f]+$/i)
    expect(keypair.privateKey).toMatch(/^0x[0-9a-f]+$/i)
    expect(keypair.publicKey).not.toBe(keypair.privateKey)
  })

  it('generates a fresh random keypair each call', async () => {
    const again = await signer.generateAPIKey()
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

  it('signs WITHDRAWAL', async () => {
    const signed = await signer.sign(
      ActionType.WITHDRAWAL,
      { amount: 100_000, nonce: 8 },
      ctx()
    )
    expect(signed.txType).toBe(13)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
    // The signer threads our context (api key + account) AND the backend
    // amount/nonce into the signed blob; asset index is pinned to USDC (3).
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.FromAccountIndex).toBe(42)
    expect(parsed.AssetIndex).toBe(3)
    expect(parsed.Amount).toBe(100_000)
    expect(parsed.Nonce).toBe(8)
  })

  // The Go signer reads `memo` via `Value.String()` and copies its UTF-8
  // bytes directly into a `[32]byte`. In practice that means: send 32 ASCII
  // characters. Multibyte chars or wrong length → "memo expected to be 32
  // bytes long".
  const MEMO_32_BYTES = 'a'.repeat(32)

  it('signs TRANSFER (fastwithdraw signed-transfer flow)', async () => {
    const signed = await signer.sign(
      ActionType.TRANSFER,
      {
        to_account: 7,
        usdc_amount: 250_000,
        fee: 100,
        memo: MEMO_32_BYTES,
        nonce: 12,
      },
      ctx()
    )
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
  })

  it('TRANSFER rejects missing numeric param with a clear error', async () => {
    await expect(
      signer.sign(
        ActionType.TRANSFER,
        // missing usdc_amount
        { to_account: 7, fee: 100, memo: MEMO_32_BYTES, nonce: 12 },
        ctx()
      )
    ).rejects.toThrow(/usdc_amount/)
  })

  it('TRANSFER rejects missing memo (string field) with a clear error', async () => {
    await expect(
      signer.sign(
        ActionType.TRANSFER,
        // missing memo
        { to_account: 7, usdc_amount: 250_000, fee: 100, nonce: 12 },
        ctx()
      )
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

  it('MODIFY_ORDER threads backend integrator fees into L2TxAttributes', async () => {
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
    expect(JSON.parse(signed.txInfo).L2TxAttributes).toEqual({
      '1': 5,
      '2': 250,
      '3': 100,
    })
  })

  it('signs APPROVE_INTEGRATOR into a type-45 blob with positional args in struct order', async () => {
    const signed = await signer.signApproveIntegrator(
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
    expect(signed.txType).toBe(45)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    const parsed = JSON.parse(signed.txInfo)
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

  it('APPROVE_INTEGRATOR rejects a missing fee-cap param with a clear error', async () => {
    await expect(
      signer.signApproveIntegrator(
        {
          integrator_account_index: 5,
          max_perps_taker_fee: 250,
          max_perps_maker_fee: 100,
          // missing max_spot_taker_fee / max_spot_maker_fee
          approval_expiry: 1_893_456_000,
          nonce: 3,
        },
        ctx()
      )
    ).rejects.toThrow(/max_spot_taker_fee/)
  })

  it('signApproveIntegrator returns the type-45 blob plus the L2ApproveIntegrator L1 message body', async () => {
    const signed = await signer.signApproveIntegrator(
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
    expect(signed.txType).toBe(45)
    expect(signed.txHash).toMatch(/^[0-9a-f]+$/)
    // L1Sig is empty until the caller injects the wallet signature.
    expect(JSON.parse(signed.txInfo).L1Sig).toBe('')

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
    expect(signed.messageToSign).toBe(expectedMessage)
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

  it('REGISTER_API_KEY through sign() throws (must use signChangePubKey)', async () => {
    await expect(
      signer.sign(
        ActionType.REGISTER_API_KEY,
        { api_key_index: 1, nonce: 0 },
        ctx()
      )
    ).rejects.toThrow(/signChangePubKey/)
  })

  it('APPROVE_INTEGRATOR through sign() throws (must use signApproveIntegrator)', async () => {
    await expect(
      signer.sign(
        ActionType.APPROVE_INTEGRATOR,
        { integrator_account_index: 45, nonce: 0 },
        ctx()
      )
    ).rejects.toThrow(/signApproveIntegrator/)
  })

  it('signChangePubKey returns txInfo with empty L1Sig and an EIP-191 message', async () => {
    const result = await signer.signChangePubKey(
      keypair.publicKey,
      keypair.privateKey,
      0,
      1,
      42
    )
    const parsed = JSON.parse(result.txInfo)
    expect(parsed.L1Sig).toBe('')
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.AccountIndex).toBe(42)
    expect(result.messageToSign).toContain('Register Lighter Account')
    expect(result.messageToSign).toContain(keypair.publicKey)
  })

  it('createAuthToken returns a non-empty token for the /changeAccountTier ACCOUNT_TYPE contract', async () => {
    // ACCOUNT_TYPE is dispatched as a WASM_BLOB action but `/changeAccountTier`
    // is HTTP-only — its "signature" is the same Lighter auth token the read
    // endpoints consume, not a wasm-signed tx blob.
    const deadline = Math.floor(Date.now() / 1000) + 60
    const token = await signer.createAuthToken(deadline, ctx())
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('embedL1Signature injects the signature into txInfo JSON', async () => {
    const result = await signer.signChangePubKey(
      keypair.publicKey,
      keypair.privateKey,
      0,
      1,
      42
    )
    const withSig = signer.embedL1Signature(result.txInfo, '0xdeadbeef')
    const parsed = JSON.parse(withSig)
    expect(parsed.L1Sig).toBe('0xdeadbeef')
    // All non-L1Sig fields preserved
    expect(parsed.AccountIndex).toBe(42)
    expect(parsed.ApiKeyIndex).toBe(1)
    expect(parsed.PubKey).toBeTruthy()
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
})
