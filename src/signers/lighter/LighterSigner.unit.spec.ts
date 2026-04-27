import { ActionType } from '@lifi/perps-types'
import { beforeAll, describe, expect, it } from 'vitest'
import { LighterSigner } from './LighterSigner.js'

const DETERMINISTIC_SEED = `0x${'11'.repeat(32)}`

describe('LighterSigner', () => {
  let signer: LighterSigner
  let keypair: { publicKey: string; privateKey: string }

  beforeAll(async () => {
    signer = new LighterSigner()
    keypair = await signer.generateAPIKey(DETERMINISTIC_SEED)
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

  it('generateAPIKey is deterministic when a seed is provided', async () => {
    const again = await signer.generateAPIKey(DETERMINISTIC_SEED)
    expect(again).toEqual(keypair)
  })

  it('signs PLACE_ORDER into a {txType, txInfo, txHash} blob', async () => {
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

  it('signs WITHDRAWAL', async () => {
    const signed = await signer.sign(
      ActionType.WITHDRAWAL,
      { amount: 100_000, nonce: 8 },
      ctx()
    )
    expect(signed.txType).toBe(13)
    expect(signed.txInfo).toBeTruthy()
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
