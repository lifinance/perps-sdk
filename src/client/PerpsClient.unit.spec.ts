import type {
  AccountResponse,
  CreateActionRequest,
  CreateActionResponse,
  ExecuteActionRequest,
  ExecuteActionResponse,
  Hex,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { createWalletClient, http as viemHttp } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  mockAccount,
  mockCreateOrderResponse,
  mockCreateWithdrawalResponse,
  mockSubmitOrderResponse,
  mockSubmitWithdrawalResponse,
  server,
} from '../../test/handlers.js'
import { createMemoryStorage } from '../agent/storage.js'
import { LighterKeyStore, LighterSigner } from '../signers/lighter/index.js'
import { DEFAULT_API_URL } from './createPerpsClient.js'
import { PerpsClient } from './PerpsClient.js'
import { SigningMode } from './types.js'

describe('PerpsClient', () => {
  let client: PerpsClient
  const userAddress = '0x1234567890123456789012345678901234567890'
  const provider = 'hyperliquid'

  beforeEach(() => {
    client = new PerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      storage: createMemoryStorage(),
    })
  })

  describe('signing mode', () => {
    it('should default to USER_AGENT mode', () => {
      expect(client.getSigningMode(userAddress, provider)).toBe(
        SigningMode.USER_AGENT
      )
    })

    it('should set USER_AGENT mode and create agent', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      expect(client.getSigningMode(userAddress, provider)).toBe(
        SigningMode.USER_AGENT
      )
      expect(await client.hasAgent(userAddress, provider)).toBe(true)
    })

    it('should get agent address in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const agentAddress = await client.getAgentAddress(userAddress, provider)
      expect(agentAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })

    it('should throw when getting agent in USER mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER)
      await expect(
        client.getAgentAddress(userAddress, provider)
      ).rejects.toThrow()
    })
  })

  describe('client property', () => {
    it('should expose underlying SDK client', () => {
      expect(client.client).toBeDefined()
      expect(client.client.config.integrator).toBe('test-app')
    })
  })

  describe('removeAgent', () => {
    it('should remove agent and reset signing mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)
      expect(client.getSigningMode(userAddress, provider)).toBe(
        SigningMode.USER_AGENT
      )

      await client.removeAgent(userAddress, provider)

      expect(client.getSigningMode(userAddress, provider)).toBe(
        SigningMode.USER_AGENT
      )
      expect(await client.hasAgent(userAddress, provider)).toBe(false)
    })
  })

  describe('placeOrder', () => {
    it('should place order in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const result = await client.placeOrder({
        address: userAddress,
        provider,
        symbol: 'BTC',
        side: 'BUY' as any,
        type: 'MARKET' as any,
        size: '0.1',
        price: '95000.00',
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].orderId).toBe('neworder123')
    })
  })

  describe('withdraw — descriptor-driven user-wallet signing', () => {
    const BASE_URL = DEFAULT_API_URL
    const userPrivateKey = `0x${'11'.repeat(32)}` as Hex
    const account = privateKeyToAccount(userPrivateKey)

    it('signs with the configured WalletClient and posts with signerAddress=user', async () => {
      const signer = createWalletClient({
        account,
        chain: mainnet,
        transport: viemHttp(),
      })

      const withdrawClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        storage: createMemoryStorage(),
      })
      withdrawClient.setSigner(signer)

      let capturedRequest: ExecuteActionRequest | undefined

      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json(mockCreateWithdrawalResponse)
        ),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          capturedRequest = (await request.json()) as ExecuteActionRequest
          return HttpResponse.json(mockSubmitWithdrawalResponse)
        })
      )

      const result = await withdrawClient.withdraw({
        provider,
        address: account.address,
        withdrawal: { destination: account.address, amount: '10' },
      })

      expect(result.results[0].success).toBe(true)
      expect(capturedRequest).toBeDefined()
      expect(capturedRequest!.action).toBe(ActionType.WITHDRAWAL)
      expect(capturedRequest!.signerAddress).toBe(account.address)
      expect(capturedRequest!.actions[0].signature).toMatch(/^0x[0-9a-f]+$/i)
    })

    it('throws a clear error when no signer is configured', async () => {
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json(mockCreateWithdrawalResponse)
        )
      )

      await expect(
        client.withdraw({
          provider,
          address: userAddress,
          withdrawal: { destination: userAddress, amount: '10' },
        })
      ).rejects.toThrow(/no signer was configured/i)
    })
  })

  describe('cancelOrders', () => {
    it('should cancel orders in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const result = await client.cancelOrders({
        address: userAddress,
        provider,
        ids: ['order1'],
      })

      expect(result.results).toBeDefined()
    })
  })

  describe('buildPrerequisites', () => {
    it('should auto-inject signerAddress in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const result = await client.buildPrerequisites({
        provider,
        address: userAddress,
      })

      expect(result.actions).toBeDefined()
    })

    it('should work in USER mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER)
      const result = await client.buildPrerequisites({
        provider,
        address: userAddress,
      })

      expect(result.actions).toBeDefined()
    })
  })

  describe('execute InvalidNonce retry', () => {
    const BASE_URL = DEFAULT_API_URL

    it('retries the full create→sign→execute cycle on InvalidNonce and succeeds', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          if (executeCallCount < 3) {
            return HttpResponse.json(
              { code: PerpsErrorCode.InvalidNonce, message: 'stale nonce' },
              { status: 400 }
            )
          }
          return HttpResponse.json(mockSubmitOrderResponse)
        })
      )

      const result = await client.execute({
        provider,
        address: userAddress,
        action: ActionType.PLACE_ORDER,
        params: {
          symbol: 'BTC',
          side: 'BUY' as any,
          type: 'MARKET' as any,
          size: '0.1',
          price: '95000.00',
        },
      })

      expect(executeCallCount).toBe(3)
      expect(result.results[0].success).toBe(true)
    })

    it('throws InvalidNonce after exhausting all retries', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      server.use(
        http.post(`${BASE_URL}/executeAction`, () =>
          HttpResponse.json(
            { code: PerpsErrorCode.InvalidNonce, message: 'stale nonce' },
            { status: 400 }
          )
        )
      )

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.PLACE_ORDER,
          params: {
            symbol: 'BTC',
            side: 'BUY' as any,
            type: 'MARKET' as any,
            size: '0.1',
            price: '95000.00',
          },
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.InvalidNonce })
    })

    it('does not retry on non-InvalidNonce errors', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          return HttpResponse.json(
            { code: PerpsErrorCode.ValidationError, message: 'bad params' },
            { status: 400 }
          )
        })
      )

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.PLACE_ORDER,
          params: {
            symbol: 'BTC',
            side: 'BUY' as any,
            type: 'MARKET' as any,
            size: '0.1',
            price: '95000.00',
          },
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })

      expect(executeCallCount).toBe(1)
    })

    it('calls createAction once per retry attempt', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      let createCallCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, () => {
          createCallCount++
          return HttpResponse.json(mockCreateOrderResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, () =>
          HttpResponse.json(
            { code: PerpsErrorCode.InvalidNonce, message: 'stale nonce' },
            { status: 400 }
          )
        )
      )

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.PLACE_ORDER,
          params: {
            symbol: 'BTC',
            side: 'BUY' as any,
            type: 'MARKET' as any,
            size: '0.1',
            price: '95000.00',
          },
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.InvalidNonce })

      expect(createCallCount).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  // ACCOUNT_MODE / ACCOUNT_TYPE dispatch
  // ---------------------------------------------------------------------------

  describe('satisfySetup — proactive ACCOUNT_MODE signer selection after APPROVE_AGENT', () => {
    const BASE_URL = DEFAULT_API_URL

    /**
     * Build a minimal `APPROVE_AGENT` user-prereq envelope. The widget would
     * normally re-sign this typed data with the user's wallet; in tests we
     * just supply a placeholder signature.
     */
    const APPROVE_AGENT_TYPED_DATA = {
      domain: { name: 'HL', chainId: 1 },
      types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
      primaryType: 'ApproveAgent' as const,
      message: { agent: '0xabcd' },
    }
    const approveAgentPrereqs = {
      required: {
        userPrerequisites: [
          {
            action: ActionType.APPROVE_AGENT,
            typedData: APPROVE_AGENT_TYPED_DATA,
          },
        ],
        agentPrerequisites: [],
        isReady: false,
      },
      userSignedActions: [
        {
          action: ActionType.APPROVE_AGENT,
          typedData: APPROVE_AGENT_TYPED_DATA,
          signature: '0xsig',
        },
      ],
    }

    /**
     * Configure the `/account` mock with a custom `abstractionMode` for the
     * duration of the test. The new flow reads this up front to choose the
     * signer for `ACCOUNT_MODE` — `null` routes to the agent, anything else
     * routes to the user-wallet fallback.
     */
    function mockAbstractionStatus(status: string | null) {
      const account: AccountResponse = {
        ...mockAccount,
        config: {
          provider: 'hyperliquid',
          abstractionMode: status,
          agents: [],
        },
      }
      server.use(
        http.get(`${BASE_URL}/account`, () => HttpResponse.json(account))
      )
    }

    /**
     * MSW handler factory: respond to `/createAction` with an action step
     * matching the requested `action` type, and to `/executeAction` with a
     * configurable result. Tracks call counts per action type so tests can
     * assert the dispatch fires (or doesn't) as expected.
     */
    function setupActionHandlers(
      opts: {
        executeResult?: (req: ExecuteActionRequest) => ExecuteActionResponse
        createActions?: Partial<Record<ActionType, CreateActionResponse>>
      } = {}
    ) {
      const counts = {
        create: new Map<ActionType, number>(),
        execute: new Map<ActionType, number>(),
      }
      const inc = (m: Map<ActionType, number>, t: ActionType) =>
        m.set(t, (m.get(t) ?? 0) + 1)

      const eip712Step = (action: ActionType): CreateActionResponse => ({
        actions: [
          {
            action,
            typedData: {
              domain: { name: 'Test', chainId: 1 },
              types: { Approve: [{ name: 'who', type: 'address' }] },
              primaryType: 'Approve',
              message: { who: '0x0000000000000000000000000000000000000000' },
            },
          },
        ],
      })

      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          inc(counts.create, body.action)
          const override = opts.createActions?.[body.action]
          if (override) {
            return HttpResponse.json(override)
          }
          return HttpResponse.json(eip712Step(body.action))
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          inc(counts.execute, body.action)
          const result = opts.executeResult?.(body) ?? {
            results: [{ action: body.action, success: true }],
          }
          return HttpResponse.json(result)
        })
      )
      return counts
    }

    it('dispatches agent-signed ACCOUNT_MODE with mode=unifiedAccount when abstractionMode is null', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)
      mockAbstractionStatus(null)

      let observedAccountModeRequest: CreateActionRequest | undefined
      const counts = setupActionHandlers()
      // Capture the createAction request for ACCOUNT_MODE so we can assert
      // the SDK supplied `mode: 'unifiedAccount'` and routed via the agent.
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          if (body.action === ActionType.ACCOUNT_MODE) {
            observedAccountModeRequest = body
          }
          return HttpResponse.json({
            actions: [
              {
                action: body.action,
                typedData: {
                  domain: { name: 'Test', chainId: 1 },
                  types: { Approve: [{ name: 'who', type: 'address' }] },
                  primaryType: 'Approve',
                  message: {
                    who: '0x0000000000000000000000000000000000000000',
                  },
                },
              },
            ],
          })
        })
      )

      const result = await client.satisfySetup({
        provider,
        address: userAddress,
        ...approveAgentPrereqs,
      })

      expect(result.userResults.results).toEqual([
        { action: ActionType.APPROVE_AGENT, success: true },
      ])
      expect(result.agentResults?.results).toEqual([
        { action: ActionType.ACCOUNT_MODE, success: true },
      ])
      expect(result.fallbackUserPrerequisites).toBeUndefined()
      expect(observedAccountModeRequest?.params).toEqual({
        mode: 'unifiedAccount',
      })
      // Agent-signed: `signerAddress` is the agent address, NOT the user.
      expect(observedAccountModeRequest?.signerAddress).toBeDefined()
      expect(observedAccountModeRequest?.signerAddress).not.toBe(userAddress)
      // Auto-upgrade fired exactly once on top of the user-signed APPROVE_AGENT.
      expect(counts.execute.get(ActionType.ACCOUNT_MODE)).toBe(1)
      expect(counts.execute.get(ActionType.APPROVE_AGENT)).toBe(1)
    })

    it('returns fallbackUserPrerequisites (no agent dispatch) when abstractionMode is already set to a different mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)
      mockAbstractionStatus('dexAbstraction')

      const accountModeCreateRequests: CreateActionRequest[] = []
      let accountModeExecuteCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          if (body.action === ActionType.ACCOUNT_MODE) {
            accountModeCreateRequests.push(body)
          }
          return HttpResponse.json({
            actions: [
              {
                action: body.action,
                typedData: {
                  domain: { name: 'Test', chainId: 1 },
                  types: { Approve: [{ name: 'who', type: 'address' }] },
                  primaryType: 'Approve',
                  message: {
                    who: '0x0000000000000000000000000000000000000000',
                  },
                },
              },
            ],
          })
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          if (body.action === ActionType.ACCOUNT_MODE) {
            accountModeExecuteCount += 1
          }
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          })
        })
      )

      const result = await client.satisfySetup({
        provider,
        address: userAddress,
        ...approveAgentPrereqs,
      })

      expect(result.userResults.results[0].success).toBe(true)
      // No agent dispatch attempted — `executeAction` was never called for
      // ACCOUNT_MODE; the SDK knew up front that the change requires a
      // user-wallet signature.
      expect(result.agentResults).toBeUndefined()
      expect(accountModeExecuteCount).toBe(0)
      // The unsigned ACCOUNT_MODE step is surfaced to the widget.
      expect(result.fallbackUserPrerequisites).toHaveLength(1)
      expect(result.fallbackUserPrerequisites?.[0].action).toBe(
        ActionType.ACCOUNT_MODE
      )
      // Only one /createAction call for ACCOUNT_MODE — no agent attempt first.
      expect(accountModeCreateRequests).toHaveLength(1)
      // The fallback build call must NOT pass a signerAddress (it's a
      // user-wallet action, not an agent-signed one).
      expect(accountModeCreateRequests[0].signerAddress).toBeUndefined()
    })

    it('short-circuits to a no-op when abstractionMode already equals the requested mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)
      mockAbstractionStatus('unifiedAccount')

      const counts = setupActionHandlers()

      const result = await client.satisfySetup({
        provider,
        address: userAddress,
        ...approveAgentPrereqs,
      })

      expect(result.userResults.results[0].success).toBe(true)
      // The status read short-circuits before any /createAction or
      // /executeAction call for ACCOUNT_MODE.
      expect(counts.create.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
      expect(counts.execute.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
      expect(result.agentResults).toBeUndefined()
      expect(result.fallbackUserPrerequisites).toBeUndefined()
    })

    it('skips the auto-upgrade chain when APPROVE_AGENT was not in the user prereqs', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)
      mockAbstractionStatus(null)

      let accountModeCreateCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          if (body.action === ActionType.ACCOUNT_MODE) {
            accountModeCreateCount += 1
          }
          return HttpResponse.json({
            actions: [
              {
                action: body.action,
                typedData: {
                  domain: { name: 'Test', chainId: 1 },
                  types: { Approve: [{ name: 'who', type: 'address' }] },
                  primaryType: 'Approve',
                  message: {
                    who: '0x0000000000000000000000000000000000000000',
                  },
                },
              },
            ],
          })
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          })
        })
      )

      const result = await client.satisfySetup({
        provider,
        address: userAddress,
        required: {
          userPrerequisites: [
            {
              action: ActionType.APPROVE_BUILDER_FEE,
              typedData: {
                domain: { name: 'HL', chainId: 1 },
                types: { Approve: [{ name: 'x', type: 'uint256' }] },
                primaryType: 'Approve',
                message: { x: 0 },
              },
            },
          ],
          agentPrerequisites: [],
          isReady: false,
        },
        userSignedActions: [
          {
            action: ActionType.APPROVE_BUILDER_FEE,
            typedData: {
              domain: { name: 'HL', chainId: 1 },
              types: { Approve: [{ name: 'x', type: 'uint256' }] },
              primaryType: 'Approve',
              message: { x: 0 },
            },
            signature: '0xsig',
          },
        ],
      })

      expect(result.userResults.results[0].success).toBe(true)
      expect(accountModeCreateCount).toBe(0)
      expect(result.agentResults).toBeUndefined()
    })

    it('propagates /account network errors rather than guessing the signer', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      server.use(
        http.get(`${BASE_URL}/account`, () =>
          HttpResponse.json(
            { code: PerpsErrorCode.ProviderError, message: 'upstream down' },
            { status: 502 }
          )
        )
      )
      setupActionHandlers()

      await expect(
        client.satisfySetup({
          provider,
          address: userAddress,
          ...approveAgentPrereqs,
        })
      ).rejects.toThrow()
    })
  })

  describe('signPrerequisite(ACCOUNT_TYPE)', () => {
    // Lighter declares ACCOUNT_TYPE as `signingMethod: WASM_BLOB` but
    // `/api/v1/changeAccountTier` is an HTTP-only mutation authenticated with
    // a Lighter auth token. The SDK mints a token via `CreateAuthToken` and
    // ships it as `signedTx.txInfo` inside the WasmBlobSignedActionStep
    // envelope; `txType` / `txHash` are unread by the backend.
    it('routes Lighter changeAccountTier to an auth token, not a wasm tx signature', async () => {
      const lighterAddress =
        '0x2222222222222222222222222222222222222222' as const
      const storage = createMemoryStorage()
      const lighterClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        storage,
      })

      // Seed a registered Lighter API key for `lighterAddress` so the
      // orchestration can mint an auth token without running the
      // REGISTER_API_KEY hybrid flow.
      const wasmSigner = new LighterSigner()
      const keypair = await wasmSigner.generateAPIKey(`0x${'22'.repeat(32)}`)
      const keyStore = new LighterKeyStore(storage)
      await keyStore.set(lighterAddress, {
        accountIndex: 7,
        apiKeyIndex: 1,
        apiKeyPrivateKey: keypair.privateKey,
        apiKeyPublicKey: keypair.publicKey,
      })

      const signed = await lighterClient.signPrerequisite(
        'lighter',
        lighterAddress,
        {
          action: ActionType.ACCOUNT_TYPE,
          wasmSignParams: {
            kind: 'changeAccountTier',
            account_index: 7,
            new_tier: 'premium',
            nonce: -1,
          },
        }
      )

      expect(signed.action).toBe(ActionType.ACCOUNT_TYPE)
      if (!('signedTx' in signed)) {
        throw new Error('expected WasmBlobSignedActionStep')
      }
      expect(typeof signed.signedTx.txInfo).toBe('string')
      expect(signed.signedTx.txInfo.length).toBeGreaterThan(0)
      expect(typeof signed.signedTx.txType).toBe('number')
      expect(typeof signed.signedTx.txHash).toBe('string')
      expect(signed.wasmSignParams).toMatchObject({
        kind: 'changeAccountTier',
        account_index: 7,
        new_tier: 'premium',
      })
    })

    it('throws a clear error when no Lighter API key has been registered yet', async () => {
      const lighterAddress =
        '0x3333333333333333333333333333333333333333' as const
      const lighterClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        storage: createMemoryStorage(),
      })

      await expect(
        lighterClient.signPrerequisite('lighter', lighterAddress, {
          action: ActionType.ACCOUNT_TYPE,
          wasmSignParams: {
            kind: 'changeAccountTier',
            account_index: 7,
            new_tier: 'premium',
            nonce: -1,
          },
        })
      ).rejects.toThrow(/No Lighter API key registered/)
    })
  })

  describe('execute(ACCOUNT_TYPE)', () => {
    it('throws a clear error when the provider does not declare ACCOUNT_TYPE (e.g. Hyperliquid)', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.ACCOUNT_TYPE,
          params: { tier: 'premium' },
        })
      ).rejects.toThrow(/does not declare action 'accountType'/)
    })
  })

  describe('buildPrerequisiteInputs filtering (via buildPrerequisites)', () => {
    it('omits ACCOUNT_MODE from bulk-staged prerequisite inputs (requires explicit `mode`)', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const observedActions: ActionType[] = []
      server.use(
        http.post(`${DEFAULT_API_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          observedActions.push(body.action)
          return HttpResponse.json({ actions: [] })
        })
      )

      await client.buildPrerequisites({
        provider,
        address: userAddress,
      })

      expect(observedActions).toContain(ActionType.APPROVE_AGENT)
      expect(observedActions).toContain(ActionType.APPROVE_BUILDER_FEE)
      expect(observedActions).not.toContain(ActionType.ACCOUNT_MODE)
      expect(observedActions).not.toContain(ActionType.ACCOUNT_TYPE)
    })
  })

  // ---------------------------------------------------------------------------
  // getAccount — projects AccountConfigSetting[] onto the response
  // ---------------------------------------------------------------------------

  describe('getAccount — settings projection', () => {
    it('attaches one AccountConfigSetting per setup + options descriptor', async () => {
      // mockProviders.hyperliquid declares 2 setup + 1 options descriptor.
      // The projection over `mockAccount.config` (abstractionMode: null)
      // produces 3 settings — one per descriptor.
      const result = await client.getAccount({ provider, address: userAddress })

      expect(result.settings).toHaveLength(3)
      expect(result.settings.map((s) => s.type)).toEqual([
        ActionType.APPROVE_AGENT,
        ActionType.APPROVE_BUILDER_FEE,
        ActionType.ACCOUNT_MODE,
      ])
      // APPROVE_AGENT / APPROVE_BUILDER_FEE: zero-param descriptors → []
      expect(result.settings[0].values).toEqual([])
      expect(result.settings[1].values).toEqual([])
      // ACCOUNT_MODE: mockAccount has abstractionMode = null
      expect(result.settings[2]).toEqual({
        type: ActionType.ACCOUNT_MODE,
        values: [{ name: 'mode', value: null }],
      })
    })

    it('passes through the backend AccountResponse fields unchanged', async () => {
      const result = await client.getAccount({ provider, address: userAddress })
      // Non-`settings` fields are the verbatim AccountResponse payload.
      expect(result.provider).toBe('hyperliquid')
      expect(result.address).toBe(mockAccount.address)
      expect(result.config).toEqual(mockAccount.config)
      expect(result.marginUsed).toBe(mockAccount.marginUsed)
    })

    it('reflects config values in the projection', async () => {
      const customAccount: AccountResponse = {
        ...mockAccount,
        config: {
          provider: 'hyperliquid',
          abstractionMode: 'unifiedAccount',
          agents: [],
        },
      }
      server.use(
        http.get(`${DEFAULT_API_URL}/account`, () =>
          HttpResponse.json(customAccount)
        )
      )

      const result = await client.getAccount({ provider, address: userAddress })
      const modeSetting = result.settings.find(
        (s) => s.type === ActionType.ACCOUNT_MODE
      )
      expect(modeSetting?.values).toEqual([
        { name: 'mode', value: 'unifiedAccount' },
      ])
    })
  })

  // ---------------------------------------------------------------------------
  // accountExists — boolean wrapper over getAccount + AccountNotFound
  // ---------------------------------------------------------------------------

  describe('accountExists', () => {
    it('returns true on a successful 200 response', async () => {
      // Default handler in test/handlers.ts answers /account 200 with mockAccount.
      await expect(client.accountExists(provider, userAddress)).resolves.toBe(
        true
      )
    })

    it('returns false when the backend reports AccountNotFound', async () => {
      server.use(
        http.get(`${DEFAULT_API_URL}/account`, () =>
          HttpResponse.json(
            {
              code: PerpsErrorCode.AccountNotFound,
              message: 'account not found',
            },
            { status: 404 }
          )
        )
      )
      await expect(client.accountExists(provider, userAddress)).resolves.toBe(
        false
      )
    })

    it('rethrows on any other PerpsError code', async () => {
      server.use(
        http.get(`${DEFAULT_API_URL}/account`, () =>
          HttpResponse.json(
            {
              code: PerpsErrorCode.ServerError,
              message: 'upstream down',
            },
            { status: 502 }
          )
        )
      )
      await expect(
        client.accountExists(provider, userAddress)
      ).rejects.toMatchObject({ code: PerpsErrorCode.ServerError })
    })

    it('rethrows on network / transport failures', async () => {
      server.use(
        http.get(`${DEFAULT_API_URL}/account`, () => HttpResponse.error())
      )
      await expect(
        client.accountExists(provider, userAddress)
      ).rejects.toThrow()
    })
  })
})
