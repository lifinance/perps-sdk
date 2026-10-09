import { ActionType } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEGACY_AUTH_TOKEN,
  LEGACY_CASES,
  LEGACY_CHAIN_ID,
  LEGACY_CONTEXT,
  LEGACY_KEY,
  LEGACY_NOW_MS,
  type LegacySignerCase,
} from '../../test/legacySignerGolden.js'
import { LIGHTER_MAINNET_DEPLOYMENT } from '../constants.js'
import { LighterSigner } from './LighterSigner.js'
import { callLighterWasm, loadLighterWasm } from './wasmLoader.js'

const L1_SIGNATURE = `0x${'ab'.repeat(65)}`
const ORDER_INDEX_ABOVE_2_POW_53 = '9570149379440277'

const withoutSig = (txInfo: string): Record<string, unknown> => {
  const { Sig, ...rest } = JSON.parse(txInfo) as Record<string, unknown>
  expect(Sig).toEqual(expect.any(String))
  return rest
}

const withL1Sig = (txInfo: string): Record<string, unknown> => ({
  ...withoutSig(txInfo),
  L1Sig: L1_SIGNATURE,
})

const casesOf = (actions: ActionType[]): LegacySignerCase[] =>
  LEGACY_CASES.filter((c) => actions.includes(c.action))

const L1_ACTIONS = [
  ActionType.REGISTER_API_KEY,
  ActionType.APPROVE_INTEGRATOR,
  ActionType.TRANSFER,
]

describe('LighterSigner against the legacy wasm/ signer output', () => {
  let signer: LighterSigner

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: LEGACY_NOW_MS })
    expect(LIGHTER_MAINNET_DEPLOYMENT.signerChainId).toBe(LEGACY_CHAIN_ID)
    signer = new LighterSigner({
      signerChainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
      collateralAssetIndex: LIGHTER_MAINNET_DEPLOYMENT.collateral.assetIndex,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(
    LEGACY_CASES.filter((c) => !L1_ACTIONS.includes(c.action)).map((c) => [
      c.name,
      c,
    ])
  )('signs %s with the same tx', async (_name, legacy) => {
    const signed = await signer.sign(
      legacy.action,
      legacy.params,
      LEGACY_CONTEXT
    )

    expect(signed.txType).toBe(legacy.txType)
    expect(signed.txHash).toBe(legacy.txHash)
    expect(withoutSig(signed.txInfo)).toEqual(withoutSig(legacy.txInfo))
  })

  it.each(
    casesOf([ActionType.APPROVE_INTEGRATOR, ActionType.TRANSFER]).map((c) => [
      c.name,
      c,
    ])
  )('gets the same wallet message and tx for %s', async (_name, legacy) => {
    const action = legacy.action as
      | ActionType.APPROVE_INTEGRATOR
      | ActionType.TRANSFER

    const message = await signer.getL1Message(
      action,
      legacy.params,
      LEGACY_CONTEXT
    )
    const signed = await signer.signL1Countersigned(
      action,
      legacy.params,
      LEGACY_CONTEXT,
      L1_SIGNATURE
    )

    expect(message).toBe(legacy.messageToSign)
    expect(signed.txType).toBe(legacy.txType)
    expect(signed.txHash).toBe(legacy.txHash)
    expect(withoutSig(signed.txInfo)).toEqual(withL1Sig(legacy.txInfo))
  })

  it.each(
    casesOf([ActionType.REGISTER_API_KEY]).map((c) => [c.name, c])
  )('gets the same wallet message and tx for %s', async (_name, legacy) => {
    const nonce = legacy.params.nonce as number
    const skipNonce = legacy.params.skip_nonce === 1
    const wasm = await loadLighterWasm()

    const client = await callLighterWasm(
      'createClientByPrv',
      wasm._createClientByPrv(
        LEGACY_CONTEXT.apiKeyPrivateKey,
        LEGACY_CHAIN_ID,
        LEGACY_CONTEXT.accountIndex,
        nonce,
        LEGACY_CONTEXT.apiKeyIndex,
        skipNonce
      )
    )
    const signed = await signer.signChangePubKey(
      LEGACY_CONTEXT,
      nonce,
      skipNonce,
      L1_SIGNATURE
    )

    expect(`0x${client.pk}`).toBe(LEGACY_KEY.publicKey)
    expect(`0x${client.prv}`).toBe(LEGACY_KEY.privateKey)
    expect(client.body).toBe(legacy.messageToSign)
    expect(signed.txType).toBe(legacy.txType)
    expect(signed.txHash).toBe(legacy.txHash)
    expect(withoutSig(signed.txInfo)).toEqual(withL1Sig(legacy.txInfo))
  })

  it('creates an auth token with the same deadline and identity', async () => {
    const token = await signer.createAuthToken(LEGACY_CONTEXT)

    const [deadline, account, apiKey, signature] = token.split(':')
    const [legacyDeadline, legacyAccount, legacyApiKey, legacySignature] =
      LEGACY_AUTH_TOKEN.split(':')
    expect([deadline, account, apiKey]).toEqual([
      legacyDeadline,
      legacyAccount,
      legacyApiKey,
    ])
    expect(signature).toMatch(/^[0-9a-f]+$/)
    expect(signature).toHaveLength(legacySignature?.length ?? 0)
  })

  it.each([
    ActionType.CANCEL_ORDER,
    ActionType.MODIFY_ORDER,
  ])('signs %s with an order index above 2^53 exactly', async (action) => {
    const legacy = casesOf([action])[0]
    if (!legacy) {
      throw new Error(`no legacy case for ${action}`)
    }

    const signed = await signer.sign(
      action,
      { ...legacy.params, order_index: ORDER_INDEX_ABOVE_2_POW_53 },
      LEGACY_CONTEXT
    )

    expect(signed.txInfo).toContain(`"Index":${ORDER_INDEX_ABOVE_2_POW_53},`)
  })
})
