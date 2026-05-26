import { createMemoryStorage } from '@lifi/perps-sdk'
import type {
  WasmBlobActionStep,
  WasmBlobSignedActionStep,
} from '@lifi/perps-types'
import { ActionType, SigningMethod } from '@lifi/perps-types'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { LighterKeyStore } from './LighterKeyStore.js'
import type { LighterSigner } from './LighterSigner.js'
import {
  type LighterSignActionsDeps,
  lighterSignActions,
} from './signActions.js'

const ADDRESS: Address = '0x1111111111111111111111111111111111111111'

const STD_SIGNED = {
  txType: 7,
  txInfo: '{"std":"info"}',
  txHash: 'std-hash',
}

const REGISTER_SIGNED = {
  txType: 11,
  txInfo: '{"L1Sig":""}',
  txHash: 'register-hash',
  messageToSign: 'lighter-register-msg',
}

function makeDeps(overrides: Partial<LighterSigner> = {}): {
  deps: LighterSignActionsDeps
  signer: { [K in keyof LighterSigner]?: unknown }
  keyStore: LighterKeyStore
} {
  const baseSigner = {
    sign: vi.fn(async () => STD_SIGNED),
    generateAPIKey: vi.fn(async () => ({
      publicKey: '0xpub',
      privateKey: '0xpriv',
    })),
    signChangePubKey: vi.fn(async () => REGISTER_SIGNED),
    embedL1Signature: vi.fn(
      (txInfo: string, l1: string) =>
        JSON.parse(txInfo) &&
        JSON.stringify({ ...JSON.parse(txInfo), L1Sig: l1 })
    ),
    createAuthToken: vi.fn(async () => 'auth-token-xyz'),
  }
  const signer = { ...baseSigner, ...overrides } as unknown as LighterSigner
  const keyStore = new LighterKeyStore(createMemoryStorage())
  return {
    deps: {
      signer,
      keyStore,
      resolveAccountIndex: vi.fn(async () => 99),
    },
    signer: signer as unknown as { [K in keyof LighterSigner]?: unknown },
    keyStore,
  }
}

describe('lighterSignActions', () => {
  describe('WASM_BLOB — standard wasm action', () => {
    it('uses the stored API key to sign and returns the signedTx envelope', async () => {
      const { deps, signer, keyStore } = makeDeps()
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })

      const step: WasmBlobActionStep = {
        action: ActionType.PLACE_ORDER,
        wasmSignParams: { market_index: 0, nonce: 1 },
      }
      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [step],
        ADDRESS
      )) as WasmBlobSignedActionStep[]

      expect(result).toHaveLength(1)
      expect(result[0].action).toBe(ActionType.PLACE_ORDER)
      expect(result[0].wasmSignParams).toEqual({ market_index: 0, nonce: 1 })
      expect(result[0].signedTx).toEqual(STD_SIGNED)
      expect((signer.sign as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
        ActionType.PLACE_ORDER,
        { market_index: 0, nonce: 1 },
        { apiKeyPrivateKey: '0xabc', apiKeyIndex: 42, accountIndex: 99 },
      ])
    })

    it('throws when no Lighter API key is registered for the address', async () => {
      const { deps } = makeDeps()
      const step: WasmBlobActionStep = {
        action: ActionType.CANCEL_ORDER,
        wasmSignParams: { market_index: 0, order_index: 1, nonce: 1 },
      }
      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS)
      ).rejects.toThrow(/No Lighter API key registered/)
    })
  })

  describe('WASM_BLOB — REGISTER_API_KEY hybrid flow', () => {
    it('mints a fresh keypair, calls signChangePubKey, embeds the L1 signature, and persists the keypair', async () => {
      const { deps, signer, keyStore } = makeDeps()

      const walletStub = {
        account: { address: ADDRESS },
        signMessage: vi.fn(async () => '0xl1sig'),
      }
      const step: WasmBlobActionStep = {
        action: ActionType.REGISTER_API_KEY,
        wasmSignParams: { api_key_index: 7, nonce: 42 },
      }
      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [step],
        ADDRESS,
        { signer: walletStub as never }
      )) as WasmBlobSignedActionStep[]

      expect(result).toHaveLength(1)
      expect(result[0].action).toBe(ActionType.REGISTER_API_KEY)
      expect(result[0].wasmSignParams).toMatchObject({
        api_key_index: 7,
        nonce: 42,
        new_public_key: '0xpub',
      })
      expect(JSON.parse(result[0].signedTx.txInfo)).toEqual({
        L1Sig: '0xl1sig',
      })
      expect(result[0].signedTx.txType).toBe(REGISTER_SIGNED.txType)
      expect(result[0].signedTx.txHash).toBe(REGISTER_SIGNED.txHash)

      expect(
        (signer.signChangePubKey as ReturnType<typeof vi.fn>).mock.calls[0]
      ).toEqual(['0xpub', '0xpriv', 42, 7, 99])
      expect(walletStub.signMessage).toHaveBeenCalledWith({
        account: walletStub.account,
        message: REGISTER_SIGNED.messageToSign,
      })

      // The newly minted keypair was persisted via the keystore.
      const stored = await keyStore.get(ADDRESS)
      expect(stored).toMatchObject({
        accountIndex: 99,
        apiKeyIndex: 7,
        apiKeyPrivateKey: '0xpriv',
        apiKeyPublicKey: '0xpub',
      })
    })

    it('throws a clear error when no wallet signer is supplied', async () => {
      const { deps } = makeDeps()
      const step: WasmBlobActionStep = {
        action: ActionType.REGISTER_API_KEY,
        wasmSignParams: { api_key_index: 7, nonce: 42 },
      }
      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS)
      ).rejects.toThrow(/wallet signer/i)
    })

    it('throws when wasmSignParams is missing `nonce`', async () => {
      const { deps } = makeDeps()
      const step: WasmBlobActionStep = {
        action: ActionType.REGISTER_API_KEY,
        wasmSignParams: { api_key_index: 7 },
      }
      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS, {
          signer: {
            account: { address: ADDRESS },
            signMessage: vi.fn(),
          } as never,
        })
      ).rejects.toThrow(/missing `nonce`/)
    })
  })

  describe('WASM_BLOB — ACCOUNT_TYPE (changeAccountTier)', () => {
    it('mints a Lighter auth token via the WASM signer and parks it in txInfo', async () => {
      const { deps, signer, keyStore } = makeDeps()
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })

      const step: WasmBlobActionStep = {
        action: ActionType.ACCOUNT_TYPE,
        wasmSignParams: {
          kind: 'changeAccountTier',
          account_index: 99,
          new_tier: 'premium',
          nonce: -1,
        },
      }
      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [step],
        ADDRESS
      )) as WasmBlobSignedActionStep[]

      expect(result[0].signedTx.txInfo).toBe('auth-token-xyz')
      // `/changeAccountTier` reads only `txInfo`; txType / txHash carry placeholders.
      expect(result[0].signedTx.txType).toBe(0)
      expect(result[0].signedTx.txHash).toBe('')
      expect(result[0].action).toBe(ActionType.ACCOUNT_TYPE)
      expect(result[0].wasmSignParams).toMatchObject({
        kind: 'changeAccountTier',
        account_index: 99,
        new_tier: 'premium',
      })
      const createAuthCalls = (
        signer.createAuthToken as ReturnType<typeof vi.fn>
      ).mock.calls
      expect(createAuthCalls).toHaveLength(1)
      // Deadline is unix-seconds + 1h; check it's in the future.
      const [deadline, ctx] = createAuthCalls[0]
      expect(deadline).toBeGreaterThan(Math.floor(Date.now() / 1000))
      expect(ctx).toEqual({
        apiKeyPrivateKey: '0xabc',
        apiKeyIndex: 42,
        accountIndex: 99,
      })
    })

    it('throws when no API key is registered for the address', async () => {
      const { deps } = makeDeps()
      const step: WasmBlobActionStep = {
        action: ActionType.ACCOUNT_TYPE,
        wasmSignParams: { kind: 'changeAccountTier', nonce: -1 },
      }
      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS)
      ).rejects.toThrow(/No Lighter API key registered/)
    })
  })

  describe('method routing', () => {
    it('refuses EIP712 — that arm stays on PerpsClient', async () => {
      const { deps } = makeDeps()
      await expect(
        lighterSignActions(deps, SigningMethod.EIP712, [], ADDRESS)
      ).rejects.toThrow(/EIP712 stays on PerpsClient/)
    })
  })
})
