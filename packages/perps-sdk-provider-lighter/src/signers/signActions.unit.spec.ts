import {
  createMemoryStorage,
  PerpsError,
  type SignActionProgress,
} from '@lifi/perps-sdk'
import type {
  EvmTxActionStep,
  EvmTxSignedActionStep,
  WasmBlobActionStep,
  WasmBlobSignedActionStep,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode, SigningMethod } from '@lifi/perps-types'
import { type Address, type Chain, createWalletClient, custom } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum, base, mainnet } from 'viem/chains'
import { describe, expect, it, type Mock, vi } from 'vitest'
import type { ApiParams, LighterApiClient } from '../utils/apiClient.js'
import { LighterKeyStore } from './LighterKeyStore.js'
import type { LighterSigner } from './LighterSigner.js'
import {
  createLighterApiKeyFreshness,
  type LighterSignActionsDeps,
  lighterSignActions,
} from './signActions.js'

type PostFormResult = { status: number; data: unknown }
type PostFormImpl = (path: string, params: ApiParams) => Promise<PostFormResult>
type GetImpl = (path: string, params?: ApiParams) => Promise<unknown>
type GetAuthedImpl = (
  path: string,
  authToken: string,
  params?: ApiParams
) => Promise<unknown>
const OK_MUTATION: PostFormResult = { status: 200, data: { code: 200 } }

/** Venue slot state that matches the API key every test stores. */
const REGISTERED_API_KEYS = {
  code: 200,
  api_keys: [{ api_key_index: 42, public_key: '0xdef' }],
}

const ADDRESS: Address = '0x1111111111111111111111111111111111111111'

const STD_SIGNED = {
  txType: 7,
  txInfo: '{"std":"info"}',
  txHash: 'std-hash',
}

// SEND_ASSET reuses Lighter's L2Transfer, so the bare signer answers txType 12.
const SEND_ASSET_SIGNED = {
  txType: 12,
  txInfo: '{"send":"asset"}',
  txHash: 'send-asset-hash',
}

const REGISTER_SIGNED = {
  txType: 11,
  txInfo: '{"L1Sig":""}',
  txHash: 'register-hash',
  messageToSign: 'lighter-register-msg',
}

const APPROVE_INTEGRATOR_SIGNED = {
  txType: 45,
  txInfo: '{"IntegratorAccountIndex":5,"L1Sig":""}',
  txHash: 'approve-integrator-hash',
  messageToSign: 'lighter-approve-integrator-msg',
}

const TRANSFER_SIGNED = {
  txType: 12,
  txInfo: '{"ToAccountIndex":7,"L1Sig":""}',
  txHash: 'transfer-hash',
  messageToSign: 'lighter-transfer-msg',
}

function makeDeps(
  overrides: Partial<LighterSigner> = {},
  postFormImpl?: PostFormImpl,
  getImpl?: GetImpl,
  getAuthedImpl?: GetAuthedImpl
): {
  deps: LighterSignActionsDeps
  signer: { [K in keyof LighterSigner]?: unknown }
  keyStore: LighterKeyStore
  postForm: Mock
  get: Mock
  getAuthed: Mock
} {
  const baseSigner = {
    sign: vi.fn(async () => STD_SIGNED),
    generateAPIKey: vi.fn(async () => ({
      publicKey: '0xpub',
      privateKey: '0xpriv',
    })),
    signChangePubKey: vi.fn(async () => REGISTER_SIGNED),
    signApproveIntegrator: vi.fn(async () => APPROVE_INTEGRATOR_SIGNED),
    signTransfer: vi.fn(async () => TRANSFER_SIGNED),
    embedL1Signature: vi.fn(
      (txInfo: string, l1: string) =>
        JSON.parse(txInfo) &&
        JSON.stringify({ ...JSON.parse(txInfo), L1Sig: l1 })
    ),
    createAuthToken: vi.fn(async () => 'auth-token-xyz'),
  }
  const signer = { ...baseSigner, ...overrides } as unknown as LighterSigner
  const keyStore = new LighterKeyStore(createMemoryStorage())
  const postForm = vi.fn(postFormImpl ?? (async () => OK_MUTATION))
  const get = vi.fn(getImpl ?? (async () => REGISTERED_API_KEYS))
  const getAuthed = vi.fn(getAuthedImpl ?? (async () => ({ used_code: '' })))
  const apiClient = { get, postForm, getAuthed } as unknown as LighterApiClient
  return {
    deps: {
      signer,
      keyStore,
      apiClient,
      apiKeyFreshness: createLighterApiKeyFreshness(),
      resolveAccountIndex: vi.fn(async () => 99),
    },
    signer: signer as unknown as { [K in keyof LighterSigner]?: unknown },
    keyStore,
    postForm,
    get,
    getAuthed,
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

  describe('WASM_BLOB — registered-key freshness', () => {
    const orderStep: WasmBlobActionStep = {
      action: ActionType.PLACE_ORDER,
      wasmSignParams: { market_index: 0, nonce: 1 },
    }
    const registerStep: WasmBlobActionStep = {
      action: ActionType.REGISTER_API_KEY,
      wasmSignParams: { api_key_index: 42, nonce: 7 },
    }
    const ROTATED_API_KEYS = {
      code: 200,
      api_keys: [{ api_key_index: 42, public_key: '0xrotated' }],
    }
    const EMPTY_SLOT_API_KEYS = { code: 200, api_keys: [] }

    async function setStoredKey(keyStore: LighterKeyStore): Promise<void> {
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })
    }

    it('rejects a rotated slot with the setup-gate code before any signature', async () => {
      const { deps, signer, keyStore } = makeDeps(
        undefined,
        undefined,
        async () => ROTATED_API_KEYS
      )
      await setStoredKey(keyStore)

      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [orderStep], ADDRESS)
      ).rejects.toMatchObject({
        code: PerpsErrorCode.SDKError,
        message: expect.stringContaining('no longer registered'),
      })
      expect(signer.sign).not.toHaveBeenCalled()
    })

    it('signs a matching slot after a single extra request', async () => {
      const { deps, signer, keyStore, get } = makeDeps()
      await setStoredKey(keyStore)

      const result = await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [orderStep],
        ADDRESS
      )

      expect(result).toHaveLength(1)
      expect(signer.sign).toHaveBeenCalledOnce()
      expect(get.mock.calls).toEqual([
        ['/api/v1/apikeys', { account_index: 99 }],
      ])
    })

    it.each([
      {
        label: 'a transport failure',
        getImpl: async (): Promise<unknown> => {
          throw new Error('network unreachable')
        },
        logged: 'Error: network unreachable',
      },
      {
        label: 'a non-success body',
        getImpl: async (): Promise<unknown> => {
          throw new PerpsError(
            PerpsErrorCode.ThirdPartyError,
            'Lighter API error for /api/v1/apikeys: code 21100 — ' +
              '{"api_keys":[{"public_key":"0xrotated"}]}'
          )
        },
        logged: PerpsErrorCode.ThirdPartyError,
      },
    ])('signs anyway when the freshness read ends in $label', async ({
      getImpl,
      logged,
    }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { deps, signer, keyStore } = makeDeps(
          undefined,
          undefined,
          getImpl
        )
        await setStoredKey(keyStore)

        const result = await lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [orderStep],
          ADDRESS
        )

        expect(result).toHaveLength(1)
        expect(signer.sign).toHaveBeenCalledOnce()
        // The response body names the account's other key slots, so only the
        // failure category reaches the log.
        expect(warn).toHaveBeenCalledOnce()
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('could not read the registered API key'),
          logged
        )
      } finally {
        warn.mockRestore()
      }
    })

    it('skips the check for a batch that registers a new key', async () => {
      const { deps, signer, keyStore, get } = makeDeps(
        undefined,
        undefined,
        async () => ROTATED_API_KEYS
      )
      await setStoredKey(keyStore)
      const walletStub = {
        account: { address: ADDRESS },
        signMessage: vi.fn(async () => '0xl1sig'),
      }

      const result = await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [registerStep, orderStep],
        ADDRESS,
        { userWallet: walletStub as never }
      )

      expect(result).toHaveLength(2)
      expect(get).not.toHaveBeenCalled()
      expect(signer.sign).toHaveBeenCalledOnce()
    })

    it('reads the slot once for a burst of batches inside the window', async () => {
      vi.useFakeTimers()
      try {
        const { deps, keyStore, get } = makeDeps()
        await setStoredKey(keyStore)

        for (let i = 0; i < 3; i++) {
          await lighterSignActions(
            deps,
            SigningMethod.WASM_BLOB,
            [orderStep],
            ADDRESS
          )
        }
        expect(get).toHaveBeenCalledOnce()

        // Past the 30s window the next batch re-reads the slot.
        vi.advanceTimersByTime(31_000)
        await lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [orderStep],
          ADDRESS
        )
        expect(get).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('rejects a slot the venue reports no entry for, before any signature', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { deps, signer, keyStore } = makeDeps(
          undefined,
          undefined,
          async () => EMPTY_SLOT_API_KEYS
        )
        await setStoredKey(keyStore)

        await expect(
          lighterSignActions(
            deps,
            SigningMethod.WASM_BLOB,
            [orderStep],
            ADDRESS
          )
        ).rejects.toMatchObject({
          code: PerpsErrorCode.SDKError,
          message: expect.stringContaining('holds no key'),
        })
        expect(signer.sign).not.toHaveBeenCalled()
        expect(warn).not.toHaveBeenCalled()
      } finally {
        warn.mockRestore()
      }
    })

    it('reads the slot once for a batch of several steps', async () => {
      const { deps, signer, keyStore, get } = makeDeps()
      await setStoredKey(keyStore)

      const result = await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [orderStep, orderStep, orderStep],
        ADDRESS
      )

      expect(result).toHaveLength(3)
      expect(signer.sign).toHaveBeenCalledTimes(3)
      expect(get).toHaveBeenCalledOnce()
    })

    it('holds the window after a read the venue never answered', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { deps, keyStore, get } = makeDeps(undefined, undefined, () => {
          throw new Error('network unreachable')
        })
        await setStoredKey(keyStore)

        for (let i = 0; i < 2; i++) {
          await lighterSignActions(
            deps,
            SigningMethod.WASM_BLOB,
            [orderStep],
            ADDRESS
          )
        }

        expect(get).toHaveBeenCalledOnce()
      } finally {
        warn.mockRestore()
      }
    })

    it.each([
      ['a rotated slot', async (): Promise<unknown> => ROTATED_API_KEYS],
      ['an empty slot', async (): Promise<unknown> => EMPTY_SLOT_API_KEYS],
    ] as const)('re-reads %s on the next batch', async (_label, getImpl) => {
      const { deps, keyStore, get } = makeDeps(undefined, undefined, getImpl)
      await setStoredKey(keyStore)

      for (let i = 0; i < 2; i++) {
        await expect(
          lighterSignActions(
            deps,
            SigningMethod.WASM_BLOB,
            [orderStep],
            ADDRESS
          )
        ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
      }

      expect(get).toHaveBeenCalledTimes(2)
    })
  })

  describe('WASM_BLOB — foreign instance record in the legacy slot', () => {
    const LEGACY_STORAGE_KEY = `lifi-perps-lighter-key:${ADDRESS.toLowerCase()}`
    const placeOrder: WasmBlobActionStep = {
      action: ActionType.PLACE_ORDER,
      wasmSignParams: { market_index: 0, nonce: 1 },
    }
    const register: WasmBlobActionStep = {
      action: ActionType.REGISTER_API_KEY,
      wasmSignParams: { api_key_index: 42, nonce: 7 },
    }

    /** Robinhood key material a pre-namespace build wrote to the legacy slot. */
    const RH_RECORD = {
      providerKey: 'lighter-rh',
      accountIndex: 1234,
      apiKeyIndex: 42,
      apiKeyPrivateKey: '0xrh-priv',
      apiKeyPublicKey: '0xrh-pub',
    }

    it('never signs with a record another instance wrote', async () => {
      const storage = createMemoryStorage()
      await storage.set(LEGACY_STORAGE_KEY, JSON.stringify(RH_RECORD))
      const { deps, signer, get } = makeDeps()
      deps.keyStore = new LighterKeyStore(storage, 'lighter')

      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [placeOrder], ADDRESS)
      ).rejects.toMatchObject({
        code: PerpsErrorCode.SDKError,
        message: expect.stringContaining('No Lighter API key registered'),
      })
      expect(signer.sign).not.toHaveBeenCalled()
      // The foreign accountIndex never reaches the venue.
      expect(get).not.toHaveBeenCalled()
    })

    it('lets REGISTER_API_KEY overwrite the slot with this instance record', async () => {
      const storage = createMemoryStorage()
      await storage.set(LEGACY_STORAGE_KEY, JSON.stringify(RH_RECORD))
      const { deps } = makeDeps()
      const keyStore = new LighterKeyStore(storage, 'lighter')
      deps.keyStore = keyStore
      const walletStub = {
        account: { address: ADDRESS },
        signMessage: vi.fn(async () => '0xl1sig'),
      }

      await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [register],
        ADDRESS,
        { userWallet: walletStub as never }
      )

      await expect(keyStore.get(ADDRESS)).resolves.toEqual({
        providerKey: 'lighter',
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xpriv',
        apiKeyPublicKey: '0xpub',
      })
    })
  })

  describe('WASM_BLOB — REGISTER_API_KEY hybrid flow', () => {
    it('creates a fresh keypair, calls signChangePubKey, embeds the L1 signature, and persists the keypair', async () => {
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
        { userWallet: walletStub as never }
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
      ).toEqual(['0xpub', '0xpriv', 42, 7, 99, 0])
      expect(walletStub.signMessage).toHaveBeenCalledWith({
        account: walletStub.account,
        message: REGISTER_SIGNED.messageToSign,
      })

      // The newly created keypair was persisted via the keystore.
      const stored = await keyStore.get(ADDRESS)
      expect(stored).toMatchObject({
        accountIndex: 99,
        apiKeyIndex: 7,
        apiKeyPrivateKey: '0xpriv',
        apiKeyPublicKey: '0xpub',
      })
    })

    it('keeps the applied referral marker when it replaces the key', async () => {
      const { deps, keyStore } = makeDeps()
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 3,
        apiKeyPrivateKey: '0xold',
        apiKeyPublicKey: '0xoldpub',
        appliedReferralCode: 'LIFI',
      })
      const step: WasmBlobActionStep = {
        action: ActionType.REGISTER_API_KEY,
        wasmSignParams: { api_key_index: 7, nonce: 42 },
      }

      await lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS, {
        userWallet: {
          account: { address: ADDRESS },
          signMessage: vi.fn(async () => '0xl1sig'),
        } as never,
      })

      expect(await keyStore.get(ADDRESS)).toMatchObject({
        apiKeyIndex: 7,
        apiKeyPublicKey: '0xpub',
        appliedReferralCode: 'LIFI',
      })
    })

    it('throws a clear error when no end-user wallet is supplied', async () => {
      const { deps } = makeDeps()
      const step: WasmBlobActionStep = {
        action: ActionType.REGISTER_API_KEY,
        wasmSignParams: { api_key_index: 7, nonce: 42 },
      }
      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS)
      ).rejects.toThrow(/end-user wallet/i)
    })

    it('throws when wasmSignParams is missing `nonce`', async () => {
      const { deps } = makeDeps()
      const step: WasmBlobActionStep = {
        action: ActionType.REGISTER_API_KEY,
        wasmSignParams: { api_key_index: 7 },
      }
      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS, {
          userWallet: {
            account: { address: ADDRESS },
            signMessage: vi.fn(),
          } as never,
        })
      ).rejects.toThrow(/missing `nonce`/)
    })

    it('signs a later batch with the slot the registration payload named', async () => {
      // Venue state once the registration lands: the fresh key in slot 9.
      const { deps, signer, keyStore } = makeDeps(
        undefined,
        undefined,
        async () => ({
          code: 200,
          api_keys: [{ api_key_index: 9, public_key: '0xpub' }],
        })
      )
      const walletStub = {
        account: { address: ADDRESS },
        signMessage: vi.fn(async () => '0xl1sig'),
      }
      const registerStep: WasmBlobActionStep = {
        action: ActionType.REGISTER_API_KEY,
        wasmSignParams: { api_key_index: 9, nonce: 42 },
      }
      await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [registerStep],
        ADDRESS,
        { userWallet: walletStub as never }
      )

      expect(await keyStore.get(ADDRESS)).toMatchObject({ apiKeyIndex: 9 })

      const orderStep: WasmBlobActionStep = {
        action: ActionType.PLACE_ORDER,
        wasmSignParams: { market_index: 0, nonce: 1 },
      }
      await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [orderStep],
        ADDRESS
      )

      expect((signer.sign as Mock).mock.calls[0]).toEqual([
        ActionType.PLACE_ORDER,
        { market_index: 0, nonce: 1 },
        { apiKeyPrivateKey: '0xpriv', apiKeyIndex: 9, accountIndex: 99 },
      ])
    })

    it('throws when wasmSignParams names no `api_key_index`', async () => {
      const { deps } = makeDeps()
      const step: WasmBlobActionStep = {
        action: ActionType.REGISTER_API_KEY,
        wasmSignParams: { nonce: 42 },
      }
      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS, {
          userWallet: {
            account: { address: ADDRESS },
            signMessage: vi.fn(),
          } as never,
        })
      ).rejects.toThrow(/missing `api_key_index`/)
    })
  })

  describe('WASM_BLOB — APPROVE_INTEGRATOR hybrid flow', () => {
    const approveStep: WasmBlobActionStep = {
      action: ActionType.APPROVE_INTEGRATOR,
      wasmSignParams: {
        integrator_account_index: 5,
        max_perps_taker_fee: 250,
        max_perps_maker_fee: 100,
        max_spot_taker_fee: 300,
        max_spot_maker_fee: 150,
        approval_expiry: 1_893_456_000,
        nonce: 3,
      },
    }

    async function setStoredKey(keyStore: LighterKeyStore): Promise<void> {
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })
    }

    it('wasm-signs with the stored key, collects the L1 signature, and embeds it as L1Sig', async () => {
      const { deps, signer, keyStore } = makeDeps()
      await setStoredKey(keyStore)

      const walletStub = {
        account: { address: ADDRESS },
        signMessage: vi.fn(async () => '0xapprovesig'),
      }
      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [approveStep],
        ADDRESS,
        { userWallet: walletStub as never }
      )) as WasmBlobSignedActionStep[]

      expect(result).toHaveLength(1)
      expect(result[0].action).toBe(ActionType.APPROVE_INTEGRATOR)
      // The wallet's L1 signature is injected into the signed txInfo JSON.
      expect(JSON.parse(result[0].signedTx.txInfo)).toEqual({
        IntegratorAccountIndex: 5,
        L1Sig: '0xapprovesig',
      })
      expect(result[0].signedTx.txType).toBe(APPROVE_INTEGRATOR_SIGNED.txType)
      expect(result[0].signedTx.txHash).toBe(APPROVE_INTEGRATOR_SIGNED.txHash)

      // Wasm-signed with the stored API key context and the step's params.
      expect(
        (signer.signApproveIntegrator as ReturnType<typeof vi.fn>).mock.calls[0]
      ).toEqual([
        approveStep.wasmSignParams,
        { apiKeyPrivateKey: '0xabc', apiKeyIndex: 42, accountIndex: 99 },
      ])
      // The wallet countersigns the wasm-provided L1 message body.
      expect(walletStub.signMessage).toHaveBeenCalledWith({
        account: walletStub.account,
        message: APPROVE_INTEGRATOR_SIGNED.messageToSign,
      })
    })

    it('throws a clear error naming APPROVE_INTEGRATOR when no end-user wallet is supplied', async () => {
      const { deps, keyStore } = makeDeps()
      await setStoredKey(keyStore)

      await expect(
        lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [approveStep],
          ADDRESS
        )
      ).rejects.toThrow(/APPROVE_INTEGRATOR requires the end-user wallet/)
    })

    it('propagates a wasm signing failure and never prompts the wallet', async () => {
      const { deps, keyStore } = makeDeps({
        signApproveIntegrator: vi.fn(async () => {
          throw new Error('Lighter SignApproveIntegrator failed: bad nonce')
        }),
      } as unknown as Partial<LighterSigner>)
      await setStoredKey(keyStore)

      const walletStub = {
        account: { address: ADDRESS },
        signMessage: vi.fn(async () => '0xapprovesig'),
      }

      await expect(
        lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [approveStep],
          ADDRESS,
          { userWallet: walletStub as never }
        )
      ).rejects.toThrow('Lighter SignApproveIntegrator failed: bad nonce')
      expect(walletStub.signMessage).not.toHaveBeenCalled()
    })

    it('throws when no API key is registered for the address', async () => {
      const { deps } = makeDeps()
      await expect(
        lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [approveStep],
          ADDRESS,
          {
            userWallet: {
              account: { address: ADDRESS },
              signMessage: vi.fn(),
            } as never,
          }
        )
      ).rejects.toThrow(/No Lighter API key registered/)
    })

    it('does not route standard wasm actions through the APPROVE_INTEGRATOR arm', async () => {
      const { deps, signer, keyStore } = makeDeps()
      await setStoredKey(keyStore)
      const step: WasmBlobActionStep = {
        action: ActionType.PLACE_ORDER,
        wasmSignParams: { market_index: 0, nonce: 1 },
      }

      await lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS)

      expect(signer.signApproveIntegrator).not.toHaveBeenCalled()
      expect(signer.sign).toHaveBeenCalledTimes(1)
    })
  })

  describe('WASM_BLOB — TRANSFER hybrid flow', () => {
    const transferStep: WasmBlobActionStep = {
      action: ActionType.TRANSFER,
      wasmSignParams: {
        to_account: 7,
        usdc_amount: 250_000,
        fee: 100,
        memo: `0x${'ab'.repeat(32)}`,
        nonce: 12,
      },
    }

    async function setStoredKey(keyStore: LighterKeyStore): Promise<void> {
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })
    }

    it('wasm-signs with the stored key, collects the L1 signature, and embeds it as L1Sig', async () => {
      const { deps, signer, keyStore } = makeDeps()
      await setStoredKey(keyStore)

      const walletStub = {
        account: { address: ADDRESS },
        signMessage: vi.fn(async () => '0xtransfersig'),
      }
      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [transferStep],
        ADDRESS,
        { userWallet: walletStub as never }
      )) as WasmBlobSignedActionStep[]

      expect(result).toHaveLength(1)
      expect(result[0].action).toBe(ActionType.TRANSFER)
      // The wallet's L1 signature is injected into the signed txInfo JSON.
      expect(JSON.parse(result[0].signedTx.txInfo)).toEqual({
        ToAccountIndex: 7,
        L1Sig: '0xtransfersig',
      })
      expect(result[0].signedTx.txType).toBe(TRANSFER_SIGNED.txType)
      // txHash excludes L1Sig, so the injection must not change it.
      expect(result[0].signedTx.txHash).toBe(TRANSFER_SIGNED.txHash)

      // Wasm-signed with the stored API key context and the step's params.
      expect((signer.signTransfer as Mock).mock.calls[0]).toEqual([
        transferStep.wasmSignParams,
        { apiKeyPrivateKey: '0xabc', apiKeyIndex: 42, accountIndex: 99 },
      ])
      // The wallet countersigns exactly the wasm-provided L1 message body.
      expect(walletStub.signMessage).toHaveBeenCalledWith({
        account: walletStub.account,
        message: TRANSFER_SIGNED.messageToSign,
      })
    })

    it('throws a clear error naming TRANSFER when no end-user wallet is supplied', async () => {
      const { deps, signer, keyStore } = makeDeps()
      await setStoredKey(keyStore)

      await expect(
        lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [transferStep],
          ADDRESS
        )
      ).rejects.toThrow(/TRANSFER requires the end-user wallet/)
      expect(signer.signTransfer).not.toHaveBeenCalled()
    })

    it('propagates a wasm signing failure and never prompts the wallet', async () => {
      const { deps, keyStore } = makeDeps({
        signTransfer: vi.fn(async () => {
          throw new Error('Lighter SignTransfer failed: insufficient balance')
        }),
      } as unknown as Partial<LighterSigner>)
      await setStoredKey(keyStore)

      const walletStub = {
        account: { address: ADDRESS },
        signMessage: vi.fn(async () => '0xtransfersig'),
      }

      await expect(
        lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [transferStep],
          ADDRESS,
          { userWallet: walletStub as never }
        )
      ).rejects.toThrow('Lighter SignTransfer failed: insufficient balance')
      expect(walletStub.signMessage).not.toHaveBeenCalled()
    })

    it('signs SEND_ASSET through the bare signer with no wallet', async () => {
      const { deps, signer, keyStore } = makeDeps()
      await setStoredKey(keyStore)
      const sendAssetStep: WasmBlobActionStep = {
        action: ActionType.SEND_ASSET,
        wasmSignParams: {
          sourceDex: 'spot',
          destinationDex: 'perps',
          amount: 250_000,
          nonce: 20,
        },
      }

      ;(signer.sign as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        SEND_ASSET_SIGNED
      )

      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [sendAssetStep],
        ADDRESS
      )) as WasmBlobSignedActionStep[]

      expect(result[0].signedTx).toEqual(SEND_ASSET_SIGNED)
      expect(signer.signTransfer).not.toHaveBeenCalled()
      expect(signer.embedL1Signature).not.toHaveBeenCalled()
    })
  })

  describe('WASM_BLOB — ACCOUNT_TYPE (changeAccountTier)', () => {
    const accountTypeStep: WasmBlobActionStep = {
      action: ActionType.ACCOUNT_TYPE,
      wasmSignParams: {
        kind: 'changeAccountTier',
        account_index: 99,
        new_tier: 'premium',
        nonce: -1,
      },
    }

    async function setStoredKey(keyStore: LighterKeyStore): Promise<void> {
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })
    }

    it('executes client-side via a direct venue POST and returns no backend step', async () => {
      const { deps, signer, keyStore, postForm } = makeDeps()
      await setStoredKey(keyStore)

      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [accountTypeStep],
        ADDRESS
      )) as WasmBlobSignedActionStep[]

      // No backend-bound step: the action already ran against the venue.
      expect(result).toHaveLength(0)

      expect(postForm).toHaveBeenCalledTimes(1)
      expect(postForm).toHaveBeenCalledWith('/api/v1/changeAccountTier', {
        auth: 'auth-token-xyz',
        account_index: 99,
        new_tier: 'premium',
      })

      const createAuthCalls = (
        signer.createAuthToken as ReturnType<typeof vi.fn>
      ).mock.calls
      expect(createAuthCalls).toHaveLength(1)
      const [deadline, ctx] = createAuthCalls[0]
      const now = Math.floor(Date.now() / 1000)
      // Issued per-call with a short (minutes) deadline, not the 1h default.
      expect(deadline).toBeGreaterThan(now)
      expect(deadline).toBeLessThanOrEqual(now + 5 * 60 + 2)
      expect(ctx).toEqual({
        apiKeyPrivateKey: '0xabc',
        apiKeyIndex: 42,
        accountIndex: 99,
      })
    })

    it('never routes the issued auth token through a backend-bound step', async () => {
      const { deps, keyStore } = makeDeps()
      await setStoredKey(keyStore)

      const result = await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [accountTypeStep],
        ADDRESS
      )

      // The array `execute` would forward to /executeAction is empty, so the
      // token can never reach the LI.FI backend.
      expect(JSON.stringify(result)).not.toContain('auth-token-xyz')
    })

    it('surfaces a venue rule violation verbatim as an ExchangeRejected error', async () => {
      const { deps, keyStore } = makeDeps({}, async () => ({
        status: 400,
        data: { code: 21000, message: 'account has open positions' },
      }))
      await setStoredKey(keyStore)

      await expect(
        lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [accountTypeStep],
          ADDRESS
        )
      ).rejects.toThrow(/account has open positions/)
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

    it('rejects a null field instead of sending the string "null" to the venue', async () => {
      const { deps, keyStore, postForm } = makeDeps()
      await setStoredKey(keyStore)
      const step: WasmBlobActionStep = {
        action: ActionType.ACCOUNT_TYPE,
        wasmSignParams: {
          kind: 'changeAccountTier',
          account_index: null,
          new_tier: 'premium',
          nonce: -1,
        },
      }
      await expect(
        lighterSignActions(deps, SigningMethod.WASM_BLOB, [step], ADDRESS)
      ).rejects.toThrow(/missing account_index or new_tier/)
      expect(postForm).not.toHaveBeenCalled()
    })
  })

  describe('WASM_BLOB — SET_REFERRAL (referral/use)', () => {
    const referralStep: WasmBlobActionStep = {
      action: ActionType.SET_REFERRAL,
      wasmSignParams: {
        kind: 'referralUse',
        l1_address: ADDRESS.toLowerCase(),
        referral_code: 'LIFI',
        x: 'lifi_x',
        nonce: -2,
      },
    }

    it('executes client-side via a direct venue POST and returns no backend step', async () => {
      const { deps, keyStore, postForm } = makeDeps()
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })

      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [referralStep],
        ADDRESS
      )) as WasmBlobSignedActionStep[]

      expect(result).toHaveLength(0)
      expect(postForm).toHaveBeenCalledTimes(1)
      expect(postForm).toHaveBeenCalledWith('/api/v1/referral/use', {
        auth: 'auth-token-xyz',
        l1_address: ADDRESS.toLowerCase(),
        referral_code: 'LIFI',
        x: 'lifi_x',
      })
      expect(await keyStore.get(ADDRESS)).toMatchObject({
        appliedReferralCode: 'LIFI',
      })
    })

    it('surfaces a venue rejection verbatim as an ExchangeRejected error', async () => {
      const { deps, keyStore } = makeDeps({}, async () => ({
        status: 400,
        data: { code: 21001, message: 'referral code already applied' },
      }))
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })

      await expect(
        lighterSignActions(
          deps,
          SigningMethod.WASM_BLOB,
          [referralStep],
          ADDRESS
        )
      ).rejects.toThrow(/referral code already applied/)
    })

    it('reads the applied code first and skips the POST when it already matches', async () => {
      const { deps, keyStore, postForm, getAuthed } = makeDeps(
        {},
        undefined,
        undefined,
        async () => ({ used_code: 'LIFI' })
      )
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })

      const result = (await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [referralStep],
        ADDRESS
      )) as WasmBlobSignedActionStep[]

      expect(result).toHaveLength(0)
      expect(getAuthed).toHaveBeenCalledWith(
        '/api/v1/referral/userReferrals',
        'auth-token-xyz',
        { l1_address: ADDRESS.toLowerCase() }
      )
      expect(postForm).not.toHaveBeenCalled()
      expect(await keyStore.get(ADDRESS)).toMatchObject({
        appliedReferralCode: 'LIFI',
      })
    })

    it('overwrites a foreign applied referral code via the POST', async () => {
      const { deps, keyStore, postForm } = makeDeps(
        {},
        undefined,
        undefined,
        async () => ({ used_code: 'SOMEONE_ELSE' })
      )
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })

      await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [referralStep],
        ADDRESS
      )

      expect(postForm).toHaveBeenCalledWith(
        '/api/v1/referral/use',
        expect.objectContaining({ referral_code: 'LIFI' })
      )
    })

    it('still POSTs when the applied-code read fails', async () => {
      const { deps, keyStore, postForm } = makeDeps(
        {},
        undefined,
        undefined,
        async () => {
          throw new Error('userReferrals unavailable')
        }
      )
      await keyStore.set(ADDRESS, {
        accountIndex: 99,
        apiKeyIndex: 42,
        apiKeyPrivateKey: '0xabc',
        apiKeyPublicKey: '0xdef',
      })

      await lighterSignActions(
        deps,
        SigningMethod.WASM_BLOB,
        [referralStep],
        ADDRESS
      )

      expect(postForm).toHaveBeenCalledWith(
        '/api/v1/referral/use',
        expect.objectContaining({ referral_code: 'LIFI' })
      )
    })
  })

  describe('EVM_TX — sequential broadcast with receipt confirmation', () => {
    const ACCOUNT = privateKeyToAccount(`0x${'11'.repeat(32)}`)

    /**
     * A wallet client backed by a `custom` transport that records the order of
     * `eth_sendRawTransaction` (broadcast) vs `eth_getTransactionReceipt`
     * (confirmation) calls, assigns each broadcast leg a distinct hash, and
     * returns the per-leg receipt status the test prescribes.
     */
    function makeRecordingWallet(
      legStatuses: ('0x1' | '0x0')[],
      chain: Chain = arbitrum
    ) {
      const order: string[] = []
      const broadcastHashes: string[] = []
      let broadcastIndex = 0

      const transport = custom({
        async request({ method }) {
          switch (method) {
            case 'eth_chainId':
              return `0x${chain.id.toString(16)}`
            case 'eth_getTransactionCount':
              return `0x${broadcastIndex.toString(16)}`
            case 'eth_estimateGas':
              return '0x5208'
            case 'eth_maxPriorityFeePerGas':
              return '0x1'
            case 'eth_getBlockByNumber':
              return {
                baseFeePerGas: '0x1',
                number: '0x1',
                timestamp: '0x1',
                gasLimit: '0x1',
                hash: `0x${'00'.repeat(32)}`,
              }
            case 'eth_sendRawTransaction': {
              const hash = `0x${(broadcastIndex + 1)
                .toString(16)
                .padStart(64, '0')}`
              order.push(`broadcast:${broadcastIndex}`)
              broadcastHashes.push(hash)
              broadcastIndex += 1
              return hash
            }
            case 'eth_getTransactionReceipt': {
              const leg = broadcastHashes.length - 1
              order.push(`receipt:${leg}`)
              return {
                transactionHash: broadcastHashes[leg],
                blockNumber: '0x10',
                blockHash: `0x${'bb'.repeat(32)}`,
                status: legStatuses[leg],
                from: ACCOUNT.address,
                to: `0x${'22'.repeat(20)}`,
                cumulativeGasUsed: '0x1',
                gasUsed: '0x1',
                effectiveGasPrice: '0x1',
                logs: [],
                logsBloom: `0x${'00'.repeat(256)}`,
                contractAddress: null,
                transactionIndex: '0x0',
                type: '0x2',
              }
            }
            default:
              return null
          }
        },
      })

      const wallet = createWalletClient({
        account: ACCOUNT,
        chain,
        transport,
      })
      return { wallet, order, broadcastHashes }
    }

    function makeStep(functionName: string): EvmTxActionStep {
      return {
        action: ActionType.DEPOSIT,
        txParams: {
          chainId: arbitrum.id,
          to: `0x${'22'.repeat(20)}`,
          functionName,
          args: [`0x${'33'.repeat(20)}`, 100n],
          abi: [
            'function approve(address spender, uint256 amount) returns (bool)',
            'function deposit(address to, uint256 amount) returns (bool)',
          ],
        },
      }
    }

    it('awaits each leg receipt before broadcasting the next (strict order)', async () => {
      const { wallet, order, broadcastHashes } = makeRecordingWallet([
        '0x1',
        '0x1',
      ])
      const steps = [makeStep('approve'), makeStep('deposit')]

      const result = (await lighterSignActions(
        deps_(),
        SigningMethod.EVM_TX,
        steps,
        ADDRESS,
        { userWallet: wallet }
      )) as EvmTxSignedActionStep[]

      expect(order).toEqual([
        'broadcast:0',
        'receipt:0',
        'broadcast:1',
        'receipt:1',
      ])
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.txHash)).toEqual(broadcastHashes)
    })

    it('emits submitted then confirmed progress for each leg', async () => {
      const { wallet, broadcastHashes } = makeRecordingWallet(['0x1', '0x1'])
      const steps = [makeStep('approve'), makeStep('deposit')]
      const progress: SignActionProgress[] = []

      await lighterSignActions(deps_(), SigningMethod.EVM_TX, steps, ADDRESS, {
        userWallet: wallet,
        onProgress: (event) => progress.push(event),
      })

      expect(progress.map((p) => [p.index, p.functionName, p.status])).toEqual([
        [0, 'approve', 'submitted'],
        [0, 'approve', 'confirmed'],
        [1, 'deposit', 'submitted'],
        [1, 'deposit', 'confirmed'],
      ])
      expect(progress.every((p) => p.total === 2)).toBe(true)
      expect(progress[0]?.txHash).toBe(broadcastHashes[0])
      expect(progress[3]?.txHash).toBe(broadcastHashes[1])
    })

    it('does not emit a confirmed progress for a reverted leg', async () => {
      const { wallet } = makeRecordingWallet(['0x0', '0x1'])
      const steps = [makeStep('approve'), makeStep('deposit')]
      const progress: SignActionProgress[] = []

      await expect(
        lighterSignActions(deps_(), SigningMethod.EVM_TX, steps, ADDRESS, {
          userWallet: wallet,
          onProgress: (event) => progress.push(event),
        })
      ).rejects.toThrow(/revert/i)

      // Leg 0 broadcast, then reverted: submitted only, no confirmed, no leg 1.
      expect(progress.map((p) => [p.index, p.status])).toEqual([
        [0, 'submitted'],
      ])
    })

    it('aborts the sequence when leg 1 reverts and never broadcasts leg 2', async () => {
      const { wallet, order } = makeRecordingWallet(['0x0', '0x1'])
      const steps = [makeStep('approve'), makeStep('deposit')]

      await expect(
        lighterSignActions(deps_(), SigningMethod.EVM_TX, steps, ADDRESS, {
          userWallet: wallet,
        })
      ).rejects.toThrow(/revert/i)

      expect(order).toEqual(['broadcast:0', 'receipt:0'])
    })

    it('throws a clear error when no end-user wallet is supplied', async () => {
      await expect(
        lighterSignActions(
          deps_(),
          SigningMethod.EVM_TX,
          [makeStep('approve')],
          ADDRESS
        )
      ).rejects.toThrow(/end-user wallet/i)
    })

    it('refuses to broadcast when the wallet chain differs from txParams.chainId', async () => {
      // Wallet on mainnet; the step targets arbitrum. Broadcasting here would
      // sign on the wrong chain (the reported bug), so it must throw first.
      const { wallet, order } = makeRecordingWallet(['0x1'], mainnet)

      await expect(
        lighterSignActions(
          deps_(),
          SigningMethod.EVM_TX,
          [makeStep('approve')],
          ADDRESS,
          {
            userWallet: wallet,
          }
        )
      ).rejects.toThrow(/chain/i)

      expect(order).toEqual([])
    })

    function makeStepOn(
      chainId: number,
      functionName: string
    ): EvmTxActionStep {
      const step = makeStep(functionName)
      return { ...step, txParams: { ...step.txParams, chainId } }
    }

    const chainById: Record<number, Chain> = {
      [arbitrum.id]: arbitrum,
      [base.id]: base,
    }

    it('switches to each leg target chain, once per leg, when legs target different chains', async () => {
      const switched: number[] = []
      const switchToChain = vi.fn(async (chainId: number) => {
        switched.push(chainId)
        return makeRecordingWallet(['0x1'], chainById[chainId]).wallet
      })
      // Wallet starts on mainnet; both legs target other chains.
      const { wallet } = makeRecordingWallet([], mainnet)
      const steps = [
        makeStepOn(arbitrum.id, 'approve'),
        makeStepOn(base.id, 'deposit'),
      ]

      const result = (await lighterSignActions(
        deps_(),
        SigningMethod.EVM_TX,
        steps,
        ADDRESS,
        { userWallet: wallet, switchToChain }
      )) as EvmTxSignedActionStep[]

      expect(switchToChain).toHaveBeenCalledTimes(2)
      expect(switched).toEqual([arbitrum.id, base.id])
      expect(result).toHaveLength(2)
    })

    it('does not call the switcher for a leg already on the wallet chain', async () => {
      const switchToChain = vi.fn(
        async (chainId: number) =>
          makeRecordingWallet(['0x1'], chainById[chainId]).wallet
      )
      const { wallet } = makeRecordingWallet(['0x1'], arbitrum)

      await lighterSignActions(
        deps_(),
        SigningMethod.EVM_TX,
        [makeStepOn(arbitrum.id, 'approve')],
        ADDRESS,
        { userWallet: wallet, switchToChain }
      )

      expect(switchToChain).not.toHaveBeenCalled()
    })

    it('throws on a wrong-chain leg when no switch capability is supplied (local signer)', async () => {
      const { wallet, order } = makeRecordingWallet([], mainnet)

      await expect(
        lighterSignActions(
          deps_(),
          SigningMethod.EVM_TX,
          [makeStepOn(arbitrum.id, 'approve')],
          ADDRESS,
          { userWallet: wallet }
        )
      ).rejects.toThrow(/chain/i)

      expect(order).toEqual([])
    })

    it('throws SDKError when the switcher returns a client still on the wrong chain', async () => {
      const switchToChain = vi.fn(
        async () => makeRecordingWallet([], mainnet).wallet
      )
      const { wallet, order } = makeRecordingWallet([], mainnet)

      await expect(
        lighterSignActions(
          deps_(),
          SigningMethod.EVM_TX,
          [makeStepOn(arbitrum.id, 'approve')],
          ADDRESS,
          { userWallet: wallet, switchToChain }
        )
      ).rejects.toThrow(/chain/i)

      expect(switchToChain).toHaveBeenCalledTimes(1)
      expect(order).toEqual([])
    })

    it('does not mutate ctx.userWallet across the switch (transient injection)', async () => {
      const { wallet } = makeRecordingWallet([], mainnet)
      const ctx = {
        userWallet: wallet,
        switchToChain: vi.fn(
          async (chainId: number) =>
            makeRecordingWallet(['0x1'], chainById[chainId]).wallet
        ),
      }

      await lighterSignActions(
        deps_(),
        SigningMethod.EVM_TX,
        [makeStepOn(arbitrum.id, 'approve')],
        ADDRESS,
        ctx
      )

      expect(ctx.userWallet).toBe(wallet)
    })
  })

  describe('method routing', () => {
    it('refuses EIP712 — Lighter declares no EIP712 actions', async () => {
      const { deps } = makeDeps()
      await expect(
        lighterSignActions(deps, SigningMethod.EIP712, [], ADDRESS)
      ).rejects.toThrow(/no EIP712 actions/)
    })
  })
})

function deps_(): LighterSignActionsDeps {
  return makeDeps().deps
}
