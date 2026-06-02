import type {
  AccountResponse,
  CreateActionRequest,
  CreateActionResponse,
  ExecuteActionRequest,
  ExecuteActionResponse,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import type { Hex } from 'viem'
import { createWalletClient, http as viemHttp } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestAgentProvider,
  type TestAgentProvider,
} from '../../test/agentProvider.js'
import {
  mockAccount,
  mockCreateOrderResponse,
  mockCreateWithdrawalResponse,
  mockProviders,
  mockSubmitWithdrawalResponse,
  server,
} from '../../test/handlers.js'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsProvider } from '../types/core.js'
import { DEFAULT_API_URL } from './createPerpsClient.js'
import { PerpsClient } from './PerpsClient.js'

describe('PerpsClient', () => {
  let client: PerpsClient
  let agentProvider: TestAgentProvider
  const userAddress = '0x1234567890123456789012345678901234567890'
  const provider = 'hyperliquid'

  beforeEach(() => {
    agentProvider = createTestAgentProvider({ type: provider })
    client = new PerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [agentProvider],
    })
  })

  describe('agent-signed actions require a provisioned provider session', () => {
    it('throws when no agent session has been created on the provider', async () => {
      // PLACE_ORDER is AGENT-signed; with no agent provisioned, core's
      // delegation to the provider's resolveSignerAddress must throw.
      await expect(
        client.placeOrder({
          address: userAddress,
          provider,
          symbol: 'BTC',
          side: 'BUY' as any,
          type: 'MARKET' as any,
          size: '0.1',
          price: '95000.00',
        })
      ).rejects.toThrow()
    })

    it('throws when the resolved provider owns no agent session', async () => {
      const noAgentClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: provider,
            projectConfig: vi.fn(() => []),
          } as unknown as PerpsProvider,
        ],
      })
      await expect(
        noAgentClient.placeOrder({
          address: userAddress,
          provider,
          symbol: 'BTC',
          side: 'BUY' as any,
          type: 'MARKET' as any,
          size: '0.1',
          price: '95000.00',
        })
      ).rejects.toThrow(/does not implement resolveSignerAddress/)
    })
  })

  describe('client property', () => {
    it('should expose underlying SDK client', () => {
      expect(client.client).toBeDefined()
      expect(client.client.config.integrator).toBe('test-app')
    })
  })

  describe('placeOrder', () => {
    it('should place order in USER_AGENT mode', async () => {
      await agentProvider.createAgent(userAddress)

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
      await agentProvider.createAgent(userAddress)

      const result = await client.cancelOrders({
        address: userAddress,
        provider,
        ids: ['order1'],
      })

      expect(result.results).toBeDefined()
    })
  })

  describe('buildProviderSetup', () => {
    it('auto-injects the agent signerAddress for agent-signed setup', async () => {
      await agentProvider.createAgent(userAddress)

      const result = await client.buildProviderSetup({
        provider,
        address: userAddress,
      })

      expect(result.actions).toBeDefined()
    })
  })

  describe('execute InvalidNonce handling', () => {
    const BASE_URL = DEFAULT_API_URL

    it('propagates InvalidNonce to the caller and submits exactly once', async () => {
      await agentProvider.createAgent(userAddress)

      let createCallCount = 0
      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, () => {
          createCallCount++
          return HttpResponse.json(mockCreateOrderResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          return HttpResponse.json(
            { code: PerpsErrorCode.InvalidNonce, message: 'stale nonce' },
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
      ).rejects.toMatchObject({ code: PerpsErrorCode.InvalidNonce })

      expect(createCallCount).toBe(1)
      expect(executeCallCount).toBe(1)
    })

    it('propagates non-InvalidNonce errors and submits exactly once', async () => {
      await agentProvider.createAgent(userAddress)

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
  })

  describe('execute does not retry money-moving writes', () => {
    const BASE_URL = DEFAULT_API_URL
    const orderParams = {
      symbol: 'BTC',
      side: 'BUY' as any,
      type: 'MARKET' as any,
      size: '0.1',
      price: '95000.00',
    }

    it('submits executeAction exactly once on a 503 — outcome-unknown writes must not retry', async () => {
      await agentProvider.createAgent(userAddress)

      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json(mockCreateOrderResponse)
        ),
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          return HttpResponse.json(
            { code: PerpsErrorCode.ServerError, message: 'upstream 503' },
            { status: 503 }
          )
        })
      )

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.PLACE_ORDER,
          params: orderParams,
        })
      ).rejects.toBeInstanceOf(PerpsError)

      // Without `retry: false` the 5xx would retry up to LIFI_RETRY_DEFAULTS.maxAttempts.
      expect(executeCallCount).toBe(1)
    })

    it('submits executeAction exactly once on a dropped connection (no retry-network)', async () => {
      await agentProvider.createAgent(userAddress)

      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json(mockCreateOrderResponse)
        ),
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          return HttpResponse.error()
        })
      )

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.PLACE_ORDER,
          params: orderParams,
        })
      ).rejects.toBeInstanceOf(PerpsError)

      expect(executeCallCount).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // ACCOUNT_MODE / ACCOUNT_TYPE dispatch
  // ---------------------------------------------------------------------------

  describe('executeProviderSetup — proactive ACCOUNT_MODE signer selection after APPROVE_AGENT', () => {
    const BASE_URL = DEFAULT_API_URL

    // Account state is read direct from the provider plugin, so register a
    // stub whose getAccount yields the abstraction mode each test needs. The
    // stub also owns an agent session (resolveSignerAddress + EIP712
    // signActions) so core can delegate the agent-signed ACCOUNT_MODE arm.
    const stubGetAccount = vi.fn()
    beforeEach(() => {
      stubGetAccount.mockReset()
      agentProvider = createTestAgentProvider({
        type: 'hyperliquid',
        getAccount: stubGetAccount,
        projectConfig: vi.fn(() => []),
      } as unknown as Partial<PerpsProvider> & { type: string })
      client = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [agentProvider],
      })
    })

    /**
     * Build a minimal `APPROVE_AGENT` user-setup action envelope. The widget would
     * normally re-sign this typed data with the user's wallet; in tests we
     * just supply a placeholder signature.
     */
    const APPROVE_AGENT_TYPED_DATA = {
      domain: { name: 'HL', chainId: 1 },
      types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
      primaryType: 'ApproveAgent' as const,
      message: { agent: '0xabcd' },
    }
    const approveAgentSetupAction = {
      required: {
        userProviderSetup: [
          {
            action: ActionType.APPROVE_AGENT,
            typedData: APPROVE_AGENT_TYPED_DATA,
          },
        ],
        agentProviderSetup: [],
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
     * Configure the stubbed plugin `getAccount` with a custom `abstractionMode`
     * for the duration of the test. The new flow reads this up front to choose
     * the signer for `ACCOUNT_MODE` — `null` routes to the agent, anything else
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
      stubGetAccount.mockResolvedValue(account)
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
      await agentProvider.createAgent(userAddress)
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

      const result = await client.executeProviderSetup({
        provider,
        address: userAddress,
        ...approveAgentSetupAction,
      })

      expect(result.userResults.results).toEqual([
        { action: ActionType.APPROVE_AGENT, success: true },
      ])
      expect(result.agentResults?.results).toEqual([
        { action: ActionType.ACCOUNT_MODE, success: true },
      ])
      expect(result.fallbackUserProviderSetup).toBeUndefined()
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

    it('returns fallbackUserProviderSetup (no agent dispatch) when abstractionMode is already set to a different mode', async () => {
      await agentProvider.createAgent(userAddress)
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

      const result = await client.executeProviderSetup({
        provider,
        address: userAddress,
        ...approveAgentSetupAction,
      })

      expect(result.userResults.results[0].success).toBe(true)
      // No agent dispatch attempted — `executeAction` was never called for
      // ACCOUNT_MODE; the SDK knew up front that the change requires a
      // user-wallet signature.
      expect(result.agentResults).toBeUndefined()
      expect(accountModeExecuteCount).toBe(0)
      // The unsigned ACCOUNT_MODE step is surfaced to the widget.
      expect(result.fallbackUserProviderSetup).toHaveLength(1)
      expect(result.fallbackUserProviderSetup?.[0].action).toBe(
        ActionType.ACCOUNT_MODE
      )
      // Only one /createAction call for ACCOUNT_MODE — no agent attempt first.
      expect(accountModeCreateRequests).toHaveLength(1)
      // The fallback build call must NOT pass a signerAddress (it's a
      // user-wallet action, not an agent-signed one).
      expect(accountModeCreateRequests[0].signerAddress).toBeUndefined()
    })

    it('short-circuits to a no-op when abstractionMode already equals the requested mode', async () => {
      await agentProvider.createAgent(userAddress)
      mockAbstractionStatus('unifiedAccount')

      const counts = setupActionHandlers()

      const result = await client.executeProviderSetup({
        provider,
        address: userAddress,
        ...approveAgentSetupAction,
      })

      expect(result.userResults.results[0].success).toBe(true)
      // The status read short-circuits before any /createAction or
      // /executeAction call for ACCOUNT_MODE.
      expect(counts.create.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
      expect(counts.execute.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
      expect(result.agentResults).toBeUndefined()
      expect(result.fallbackUserProviderSetup).toBeUndefined()
    })

    it('skips the auto-upgrade chain when APPROVE_AGENT was not in the user setup actions', async () => {
      await agentProvider.createAgent(userAddress)
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

      const result = await client.executeProviderSetup({
        provider,
        address: userAddress,
        required: {
          userProviderSetup: [
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
          agentProviderSetup: [],
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

    it('propagates account read errors rather than guessing the signer', async () => {
      await agentProvider.createAgent(userAddress)

      stubGetAccount.mockRejectedValue(
        new PerpsError(PerpsErrorCode.ProviderError, 'upstream down')
      )
      setupActionHandlers()

      await expect(
        client.executeProviderSetup({
          provider,
          address: userAddress,
          ...approveAgentSetupAction,
        })
      ).rejects.toThrow()
    })
  })

  describe('execute(ACCOUNT_TYPE)', () => {
    it('throws a clear error when the provider does not declare ACCOUNT_TYPE (e.g. Hyperliquid)', async () => {
      await agentProvider.createAgent(userAddress)

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

  describe('buildProviderSetupInputs filtering (via buildProviderSetup)', () => {
    it('omits ACCOUNT_MODE from bulk-staged provider setup action inputs (requires explicit `mode`)', async () => {
      await agentProvider.createAgent(userAddress)

      const observedActions: ActionType[] = []
      server.use(
        http.post(`${DEFAULT_API_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          observedActions.push(body.action)
          return HttpResponse.json({ actions: [] })
        })
      )

      await client.buildProviderSetup({
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
    const sentinelSettings = [
      { type: ActionType.APPROVE_AGENT, values: [] },
    ] as const
    const buildStubProvider = (): PerpsProvider & {
      projectConfig: ReturnType<typeof vi.fn>
    } =>
      ({
        type: 'hyperliquid',
        getAccount: vi.fn(async () => mockAccount),
        projectConfig: vi.fn(() => [...sentinelSettings]),
      }) as unknown as PerpsProvider & {
        projectConfig: ReturnType<typeof vi.fn>
      }

    it('delegates to the registered plugin and merges its result onto the response', async () => {
      const stub = buildStubProvider()
      const stubbedClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [stub],
      })

      const result = await stubbedClient.getAccount({
        provider,
        address: userAddress,
      })

      // projectConfig was invoked with (config, setup, options) drawn from
      // the /account response and the /providers metadata.
      const hlMeta = mockProviders.providers.find((d) => d.key === provider)!
      expect(stub.projectConfig).toHaveBeenCalledOnce()
      expect(stub.projectConfig).toHaveBeenCalledWith(
        mockAccount.config,
        hlMeta.setup,
        hlMeta.options
      )
      // The dispatcher merges projectConfig's output into the AccountResponse.
      expect(result.settings).toEqual(sentinelSettings)
      // Non-`settings` fields pass through unchanged.
      expect(result.provider).toBe('hyperliquid')
      expect(result.address).toBe(mockAccount.address)
      expect(result.config).toEqual(mockAccount.config)
      expect(result.marginUsed).toBe(mockAccount.marginUsed)
    })

    it('throws when no plugin is registered for the provider', async () => {
      const noProviderClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
      })
      await expect(
        noProviderClient.getAccount({ provider, address: userAddress })
      ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
    })
  })

  // ---------------------------------------------------------------------------
  // accountExists — boolean wrapper over getAccount + AccountNotFound
  // ---------------------------------------------------------------------------

  describe('accountExists', () => {
    const stubGetAccount = vi.fn()
    let stubbedClient: PerpsClient

    beforeEach(() => {
      stubGetAccount.mockReset()
      stubbedClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: 'hyperliquid',
            getAccount: stubGetAccount,
            projectConfig: vi.fn(() => []),
          } as unknown as PerpsProvider,
        ],
      })
    })

    it('returns true when the plugin resolves an account', async () => {
      stubGetAccount.mockResolvedValue(mockAccount)
      await expect(
        stubbedClient.accountExists(provider, userAddress)
      ).resolves.toBe(true)
    })

    it('returns false when the plugin reports AccountNotFound', async () => {
      stubGetAccount.mockRejectedValue(
        new PerpsError(PerpsErrorCode.AccountNotFound, 'account not found')
      )
      await expect(
        stubbedClient.accountExists(provider, userAddress)
      ).resolves.toBe(false)
    })

    it('rethrows on any other PerpsError code', async () => {
      stubGetAccount.mockRejectedValue(
        new PerpsError(PerpsErrorCode.ServerError, 'upstream down')
      )
      await expect(
        stubbedClient.accountExists(provider, userAddress)
      ).rejects.toMatchObject({ code: PerpsErrorCode.ServerError })
    })

    it('rethrows on network / transport failures', async () => {
      stubGetAccount.mockRejectedValue(new Error('network down'))
      await expect(
        stubbedClient.accountExists(provider, userAddress)
      ).rejects.toThrow()
    })
  })
})
