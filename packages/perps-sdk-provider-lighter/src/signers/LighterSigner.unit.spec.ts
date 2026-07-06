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

  it('REGISTER_API_KEY through sign() throws (must use signChangePubKey)', async () => {
    await expect(
      signer.sign(
        ActionType.REGISTER_API_KEY,
        { api_key_index: 1, nonce: 0 },
        ctx()
      )
    ).rejects.toThrow(/signChangePubKey/)
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
