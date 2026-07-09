import type {
  AccountResponse,
  CreateActionRequest,
  CreateActionResponse,
  ExecuteActionRequest,
  ExecuteActionResponse,
  RestCallSignedActionStep,
  SignedActionStep,
} from '@lifi/perps-types'
import {
  ActionType,
  PerpsErrorCode,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import type { Address, Hex } from 'viem'
import { createWalletClient, custom, http as viemHttp } from 'viem'
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
import type { PerpsProviderPlugin } from '../types/provider.js'
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
      // PLACE_ORDER is AGENT-signed; with no agent provisioned, the plugin's
      // resolveActionRequest must throw when core asks for the signer.
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

    it('throws when the resolved provider cannot sign the action', async () => {
      // A plugin with neither resolveActionRequest nor signActions: core
      // contributes no signerAddress and then fails to delegate signing.
      const noSignClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: provider,
            bind: vi.fn(),
            projectConfig: vi.fn(() => []),
          } as unknown as PerpsProviderPlugin,
        ],
      })
      await expect(
        noSignClient.placeOrder({
          address: userAddress,
          provider,
          symbol: 'BTC',
          side: 'BUY' as any,
          type: 'MARKET' as any,
          size: '0.1',
          price: '95000.00',
        })
      ).rejects.toThrow(/does not implement signActions/)
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
        providers: [createTestAgentProvider({ type: provider })],
      })
      withdrawClient.setUserWallet(signer)

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

    it('throws a clear error when no user wallet is configured', async () => {
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
      ).rejects.toThrow(/userWallet/i)
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

  describe('executeProviderSetup — no silent ACCOUNT_MODE write during setup', () => {
    const BASE_URL = DEFAULT_API_URL

    // Account state is read direct from the provider plugin, so register a
    // stub whose getAccount yields the abstraction mode each test needs. The
    // stub also owns an agent session (resolveActionRequest + EIP712
    // signActions) so core can delegate the agent-signed ACCOUNT_MODE arm.
    const stubGetAccount = vi.fn()
    beforeEach(() => {
      stubGetAccount.mockReset()
      agentProvider = createTestAgentProvider({
        type: 'hyperliquid',
        getAccount: stubGetAccount,
        projectConfig: vi.fn(() => []),
      } as unknown as Partial<PerpsProviderPlugin> & { type: string })
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
      setup: [
        {
          action: ActionType.APPROVE_AGENT,
          typedData: APPROVE_AGENT_TYPED_DATA,
        },
      ],
      signedActions: [
        {
          action: ActionType.APPROVE_AGENT,
          typedData: APPROVE_AGENT_TYPED_DATA,
          signature: '0xsig',
        },
      ],
    }

    /**
     * Configure the stubbed plugin `getAccount` with a custom `abstractionMode`.
     * Setup must leave the account mode untouched regardless of this value.
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

    it('dispatches no ACCOUNT_MODE action after a successful APPROVE_AGENT for a fresh (abstractionMode null) account', async () => {
      await agentProvider.createAgent(userAddress)
      mockAbstractionStatus(null)

      const counts = setupActionHandlers()

      const result = await (client as any).executeProviderSetup({
        provider,
        address: userAddress,
        ...approveAgentSetupAction,
      })

      expect(result.results.results).toEqual([
        { action: ActionType.APPROVE_AGENT, success: true },
      ])
      // No silent account-mode write: neither built nor submitted.
      expect(counts.create.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
      expect(counts.execute.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
    })

    it('dispatches no ACCOUNT_MODE action regardless of the account abstractionMode', async () => {
      await agentProvider.createAgent(userAddress)
      mockAbstractionStatus('dexAbstraction')

      const counts = setupActionHandlers()

      const result = await (client as any).executeProviderSetup({
        provider,
        address: userAddress,
        ...approveAgentSetupAction,
      })

      expect(result.results.results[0].success).toBe(true)
      expect(counts.create.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
      expect(counts.execute.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
    })

    it('does not read the account during setup (no abstraction-mode probe)', async () => {
      await agentProvider.createAgent(userAddress)
      setupActionHandlers()

      await (client as any).executeProviderSetup({
        provider,
        address: userAddress,
        ...approveAgentSetupAction,
      })

      // Setup performs no account read, so getAccount must not be called.
      expect(stubGetAccount).not.toHaveBeenCalled()
    })

    it('submits the pre-signed setup steps the caller supplies', async () => {
      await agentProvider.createAgent(userAddress)
      mockAbstractionStatus(null)

      const counts = setupActionHandlers()

      const result = await (client as any).executeProviderSetup({
        provider,
        address: userAddress,
        setup: [
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
        signedActions: [
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

      expect(result.results.results).toEqual([
        { action: ActionType.APPROVE_BUILDER_FEE, success: true },
      ])
      expect(counts.execute.get(ActionType.APPROVE_BUILDER_FEE)).toBe(1)
      expect(counts.execute.get(ActionType.ACCOUNT_MODE)).toBeUndefined()
    })
  })

  describe('executeProviderSetup — mandatory setup-action failure throws', () => {
    const BASE_URL = DEFAULT_API_URL

    // The backend rejects a mandatory setup action with a 200 OK carrying a
    // per-action `{ success: false, error }`. The SDK must throw so the
    // failure reaches the caller, rather than silently resolving.
    function failExecuteAction(error: string) {
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
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
            results: [{ action: body.action, success: false, error }],
          } satisfies ExecuteActionResponse)
        })
      )
    }

    const TYPED_DATA = {
      domain: { name: 'venue', chainId: 1 },
      types: { Setup: [{ name: 'x', type: 'uint256' }] },
      primaryType: 'Setup' as const,
      message: { x: 0 },
    }

    function userSetup(action: ActionType) {
      return {
        setup: [{ action, typedData: TYPED_DATA }],
        signedActions: [
          { action, typedData: TYPED_DATA, signature: '0xsig' as const },
        ],
      }
    }

    it('rejects with a PerpsError carrying the venue error for a Hyperliquid APPROVE_AGENT failure', async () => {
      await agentProvider.createAgent(userAddress)
      const venueError =
        'Too many extra agents for cumulative volume traded. Current limit is 3'
      failExecuteAction(venueError)

      await expect(
        (client as any).executeProviderSetup({
          provider: 'hyperliquid',
          address: userAddress,
          ...userSetup(ActionType.APPROVE_AGENT),
        })
      ).rejects.toMatchObject({
        code: PerpsErrorCode.ExchangeRejected,
        message: venueError,
      })
    })

    it('rejects with a PerpsError carrying the venue error for a Lighter REGISTER_API_KEY failure', async () => {
      const lighterProvider = createTestAgentProvider({ type: 'lighter' })
      const lighterClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [lighterProvider],
      })
      await lighterProvider.createAgent(userAddress)
      const venueError = 'API key registration rejected'
      failExecuteAction(venueError)

      await expect(
        (lighterClient as any).executeProviderSetup({
          provider: 'lighter',
          address: userAddress,
          ...userSetup(ActionType.REGISTER_API_KEY),
        })
      ).rejects.toMatchObject({
        code: PerpsErrorCode.ExchangeRejected,
        message: venueError,
      })
    })

    it('propagates the throw through executeProviderSetupAction (the widget entry point)', async () => {
      // APPROVE_AGENT is a USER-signed EIP-712 step, so executeProviderSetupAction
      // signs it with the configured wallet before submitting.
      const account = privateKeyToAccount(`0x${'22'.repeat(32)}` as Hex)
      const signerProvider = createTestAgentProvider({ type: 'hyperliquid' })
      const signerClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [signerProvider],
      })
      signerClient.setUserWallet(
        createWalletClient({ account, chain: mainnet, transport: viemHttp() })
      )
      await signerProvider.createAgent(account.address)
      const venueError =
        'Too many extra agents for cumulative volume traded. Current limit is 3'
      failExecuteAction(venueError)

      await expect(
        signerClient.executeProviderSetupAction({
          provider: 'hyperliquid',
          address: account.address,
          step: { action: ActionType.APPROVE_AGENT, typedData: TYPED_DATA },
        })
      ).rejects.toMatchObject({
        code: PerpsErrorCode.ExchangeRejected,
        message: venueError,
      })
    })

    it('resolves normally when the mandatory setup action succeeds', async () => {
      await agentProvider.createAgent(userAddress)
      server.use(
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          } satisfies ExecuteActionResponse)
        })
      )

      const result = await (client as any).executeProviderSetup({
        provider: 'hyperliquid',
        address: userAddress,
        ...userSetup(ActionType.APPROVE_BUILDER_FEE),
      })

      expect(result.results.results).toEqual([
        { action: ActionType.APPROVE_BUILDER_FEE, success: true },
      ])
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

  describe('executeProviderOption — mandatory option failure throws', () => {
    const BASE_URL = DEFAULT_API_URL

    // ACCOUNT_MODE is a Provider.options tunable dispatched through `execute`.
    // The backend rejects the selected value with a 200 OK carrying a
    // per-action `{ success: false, error }`; executeProviderOption must turn
    // that into a throw rather than silently resolving.
    function respondAccountMode(result: { success: boolean; error?: string }) {
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          return HttpResponse.json({
            actions: [
              {
                action: body.action,
                typedData: {
                  domain: { name: 'Test', chainId: 1 },
                  types: { Mode: [{ name: 'mode', type: 'string' }] },
                  primaryType: 'Mode',
                  message: { mode: 'dexAbstraction' },
                },
              },
            ],
          } satisfies CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          return HttpResponse.json({
            results: [{ action: body.action, ...result }],
          } as ExecuteActionResponse)
        })
      )
    }

    it('rejects with a PerpsError carrying the venue error on success:false', async () => {
      await agentProvider.createAgent(userAddress)
      const venueError = 'Account mode change rejected by venue'
      respondAccountMode({ success: false, error: venueError })

      await expect(
        client.executeProviderOption({
          provider,
          address: userAddress,
          action: ActionType.ACCOUNT_MODE,
          params: { mode: 'dexAbstraction' },
        })
      ).rejects.toMatchObject({
        code: PerpsErrorCode.ExchangeRejected,
        message: venueError,
      })
    })

    it('resolves when the option change succeeds', async () => {
      await agentProvider.createAgent(userAddress)
      respondAccountMode({ success: true })

      await expect(
        client.executeProviderOption({
          provider,
          address: userAddress,
          action: ActionType.ACCOUNT_MODE,
          params: { mode: 'dexAbstraction' },
        })
      ).resolves.toBeUndefined()
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
    const buildStubProvider = (): PerpsProviderPlugin & {
      projectConfig: ReturnType<typeof vi.fn>
    } =>
      ({
        type: 'hyperliquid',
        bind: vi.fn(),
        getAccount: vi.fn(async () => mockAccount),
        projectConfig: vi.fn(() => [...sentinelSettings]),
      }) as unknown as PerpsProviderPlugin & {
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
  // accountExists — thin delegate to the provider plugin's own signal
  // ---------------------------------------------------------------------------

  describe('accountExists', () => {
    const stubAccountExists = vi.fn()
    let stubbedClient: PerpsClient

    beforeEach(() => {
      stubAccountExists.mockReset()
      stubbedClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: 'hyperliquid',
            bind: vi.fn(),
            accountExists: stubAccountExists,
            projectConfig: vi.fn(() => []),
          } as unknown as PerpsProviderPlugin,
        ],
      })
    })

    it('delegates to the plugin with the address and returns its result', async () => {
      stubAccountExists.mockResolvedValue(true)
      await expect(
        stubbedClient.accountExists(provider, userAddress)
      ).resolves.toBe(true)
      expect(stubAccountExists).toHaveBeenCalledWith({ address: userAddress })
    })

    it('returns false when the plugin reports the account does not exist', async () => {
      stubAccountExists.mockResolvedValue(false)
      await expect(
        stubbedClient.accountExists(provider, userAddress)
      ).resolves.toBe(false)
    })

    it('propagates the plugin probe error', async () => {
      stubAccountExists.mockRejectedValue(
        new PerpsError(PerpsErrorCode.ServerError, 'upstream down')
      )
      await expect(
        stubbedClient.accountExists(provider, userAddress)
      ).rejects.toMatchObject({ code: PerpsErrorCode.ServerError })
    })

    it('throws when no plugin is registered for the provider', async () => {
      const noProviderClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
      })
      await expect(
        noProviderClient.accountExists(provider, userAddress)
      ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
    })
  })

  // ---------------------------------------------------------------------------
  // checkSetup — deposit-first gate on accountExists
  // ---------------------------------------------------------------------------

  describe('checkSetup — accountExists gate', () => {
    const BASE_URL = DEFAULT_API_URL

    it('short-circuits with no setup steps and no createAction calls when the account does not exist', async () => {
      const accountExists = vi.fn(async () => false)
      const gatedClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: provider,
            bind: vi.fn(),
            accountExists,
            projectConfig: vi.fn(() => []),
          } as unknown as PerpsProviderPlugin,
        ],
      })

      let createCallCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, () => {
          createCallCount++
          return HttpResponse.json({ actions: [] })
        })
      )

      const result = await gatedClient.checkSetup({
        provider,
        address: userAddress,
      })

      expect(result).toEqual({
        accountExists: false,
        setup: [],
        isReady: false,
      })
      expect(createCallCount).toBe(0)
    })

    it('builds setup steps when the account exists', async () => {
      await agentProvider.createAgent(userAddress)
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          return HttpResponse.json({
            actions: [{ action: body.action }],
          } satisfies CreateActionResponse)
        })
      )

      const result = await client.checkSetup({
        provider,
        address: userAddress,
      })

      expect(result.accountExists).toBe(true)
      expect(result.setup.length).toBeGreaterThan(0)
      expect(result.isReady).toBe(false)
    })

    it('stages SIWE first for setup even when accountExists reports false', async () => {
      const ondoProviderKey = 'ondo'
      const accountExists = vi.fn(async () => false)
      const ondoClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: ondoProviderKey,
            bind: vi.fn(),
            accountExists,
            projectConfig: vi.fn(() => []),
          } as unknown as PerpsProviderPlugin,
        ],
      })

      const createCalls: ActionType[] = []
      server.use(
        http.get(`${BASE_URL}/providers`, () =>
          HttpResponse.json({
            providers: [
              ...mockProviders.providers,
              {
                key: ondoProviderKey,
                name: 'Ondo',
                logoURI: 'https://example.com/ondo.png',
                signingMethod: SigningMethod.AUTH_TOKEN,
                active: true,
                setup: [
                  {
                    type: ActionType.SET_REFERRAL,
                    signers: [PerpsSigner.USER],
                    signingMethod: SigningMethod.AUTH_TOKEN,
                    sequence: 10,
                    params: [],
                  },
                  {
                    type: ActionType.SIWE_LOGIN,
                    signers: [PerpsSigner.USER],
                    signingMethod: SigningMethod.SIWE,
                    sequence: 20,
                    params: [],
                  },
                ],
                options: [],
                actions: [],
                categories: [],
              },
            ],
          })
        ),
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          createCalls.push(body.action)
          if (body.action === ActionType.SIWE_LOGIN) {
            return HttpResponse.json({
              actions: [
                {
                  action: ActionType.SIWE_LOGIN,
                  siwe: {
                    challengeId: 'challenge-1',
                    message: 'Sign in to Ondo',
                  },
                },
              ],
            } satisfies CreateActionResponse)
          }
          return HttpResponse.json({
            actions: [
              {
                action: ActionType.SET_REFERRAL,
                request: {
                  method: 'POST',
                  path: '/v1/account/referral',
                  body: { code: 'LIFI' },
                },
              },
            ],
          } satisfies CreateActionResponse)
        })
      )

      const result = await ondoClient.checkSetup({
        provider: ondoProviderKey,
        address: userAddress,
      })

      expect(accountExists).not.toHaveBeenCalled()
      expect(createCalls).toEqual([
        ActionType.SIWE_LOGIN,
        ActionType.SET_REFERRAL,
      ])
      expect(result).toMatchObject({
        accountExists: true,
        isReady: false,
      })
      expect(result.setup.map((step) => step.action)).toEqual([
        ActionType.SIWE_LOGIN,
        ActionType.SET_REFERRAL,
      ])
    })

    it('skips SIWE setup when provider config reports it already satisfied', async () => {
      const ondoProviderKey = 'ondo'
      const getAccount = vi.fn(async () => mockAccount)
      const ondoClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: ondoProviderKey,
            bind: vi.fn(),
            accountExists: vi.fn(async () => true),
            getAccount,
            projectConfig: vi.fn(() => [
              { type: ActionType.SIWE_LOGIN, values: [], satisfied: true },
              { type: ActionType.SET_REFERRAL, values: [], satisfied: false },
            ]),
          } as unknown as PerpsProviderPlugin,
        ],
      })

      const createCalls: ActionType[] = []
      server.use(
        http.get(`${BASE_URL}/providers`, () =>
          HttpResponse.json({
            providers: [
              ...mockProviders.providers,
              {
                key: ondoProviderKey,
                name: 'Ondo',
                logoURI: 'https://example.com/ondo.png',
                signingMethod: SigningMethod.AUTH_TOKEN,
                active: true,
                setup: [
                  {
                    type: ActionType.SIWE_LOGIN,
                    signers: [PerpsSigner.USER],
                    signingMethod: SigningMethod.SIWE,
                    sequence: 10,
                    params: [],
                  },
                  {
                    type: ActionType.SET_REFERRAL,
                    signers: [PerpsSigner.USER],
                    signingMethod: SigningMethod.AUTH_TOKEN,
                    sequence: 20,
                    params: [],
                  },
                ],
                options: [],
                actions: [],
                categories: [],
              },
            ],
          })
        ),
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          createCalls.push(body.action)
          return HttpResponse.json({
            actions: [{ action: body.action }],
          } satisfies CreateActionResponse)
        })
      )

      const result = await ondoClient.checkSetup({
        provider: ondoProviderKey,
        address: userAddress,
      })

      expect(getAccount).toHaveBeenCalledOnce()
      expect(createCalls).toEqual([ActionType.SET_REFERRAL])
      expect(result.setup.map((step) => step.action)).toEqual([
        ActionType.SET_REFERRAL,
      ])
      expect(result.isReady).toBe(false)
    })

    it('returns ready when provider config reports all setup satisfied', async () => {
      const ondoProviderKey = 'ondo'
      const ondoClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: ondoProviderKey,
            bind: vi.fn(),
            accountExists: vi.fn(async () => true),
            getAccount: vi.fn(async () => mockAccount),
            projectConfig: vi.fn(() => [
              { type: ActionType.SIWE_LOGIN, values: [], satisfied: true },
              { type: ActionType.SET_REFERRAL, values: [], satisfied: true },
            ]),
          } as unknown as PerpsProviderPlugin,
        ],
      })

      let createCallCount = 0
      server.use(
        http.get(`${BASE_URL}/providers`, () =>
          HttpResponse.json({
            providers: [
              ...mockProviders.providers,
              {
                key: ondoProviderKey,
                name: 'Ondo',
                logoURI: 'https://example.com/ondo.png',
                signingMethod: SigningMethod.AUTH_TOKEN,
                active: true,
                setup: [
                  {
                    type: ActionType.SIWE_LOGIN,
                    signers: [PerpsSigner.USER],
                    signingMethod: SigningMethod.SIWE,
                    sequence: 10,
                    params: [],
                  },
                  {
                    type: ActionType.SET_REFERRAL,
                    signers: [PerpsSigner.USER],
                    signingMethod: SigningMethod.AUTH_TOKEN,
                    sequence: 20,
                    params: [],
                  },
                ],
                options: [],
                actions: [],
                categories: [],
              },
            ],
          })
        ),
        http.post(`${BASE_URL}/createAction`, () => {
          createCallCount++
          return HttpResponse.json({ actions: [] })
        })
      )

      const result = await ondoClient.checkSetup({
        provider: ondoProviderKey,
        address: userAddress,
      })

      expect(createCallCount).toBe(0)
      expect(result).toEqual({
        accountExists: true,
        setup: [],
        isReady: true,
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Signer-agnostic core: Lighter (no agent) end-to-end + both-plugin
  // orchestration. A Lighter plugin with no agent machinery drives a full
  // setup + execute flow without core ever resolving an agent signer.
  // ---------------------------------------------------------------------------

  describe('signer-agnostic orchestration', () => {
    const BASE_URL = DEFAULT_API_URL
    const lighterAddress = '0x2222222222222222222222222222222222222222'

    // A Lighter-shaped plugin with NO agent machinery: it implements WASM
    // signing but neither resolveActionRequest nor any agent session. If core
    // tried to resolve an agent signer, construction of the request would have
    // to call a method this plugin does not provide.
    function createWasmOnlyProvider(): PerpsProviderPlugin & {
      signActions: ReturnType<typeof vi.fn>
    } {
      const signActions = vi.fn(
        async (
          _method,
          steps: { action: ActionType }[]
        ): Promise<SignedActionStep[]> =>
          steps.map((s) => ({
            action: s.action,
            wasmSignParams: {},
            signedTx: { txType: 0, txInfo: 'blob', txHash: '0xhash' },
          }))
      )
      return {
        type: 'lighter',
        bind: vi.fn(),
        accountExists: vi.fn(async () => true),
        projectConfig: vi.fn(() => []),
        signActions,
      } as unknown as PerpsProviderPlugin & {
        signActions: ReturnType<typeof vi.fn>
      }
    }

    it('runs a Lighter checkSetup → sign → executeProviderSetup flow with no agent path', async () => {
      const lighter = createWasmOnlyProvider()
      const lighterClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [lighter],
      })

      const createCalls: CreateActionRequest[] = []
      const executeCalls: ExecuteActionRequest[] = []
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          createCalls.push(body)
          return HttpResponse.json({
            actions: [{ action: body.action, wasmSignParams: { nonce: 1 } }],
          } satisfies CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          executeCalls.push(body)
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          } satisfies ExecuteActionResponse)
        })
      )

      const { setup, isReady } = await lighterClient.checkSetup({
        provider: 'lighter',
        address: lighterAddress,
      })
      expect(isReady).toBe(false)
      expect(setup).toHaveLength(1)
      expect(setup[0].action).toBe(ActionType.REGISTER_API_KEY)

      // No signerAddress is constructed by core for an API_KEY signer.
      expect(createCalls[0].signerAddress).toBeUndefined()

      const signed = await (lighterClient as any).signProviderSetupAction(
        'lighter',
        lighterAddress,
        setup[0]
      )
      expect(signed).toBeDefined()
      const result = await (lighterClient as any).executeProviderSetup({
        provider: 'lighter',
        address: lighterAddress,
        setup,
        signedActions: signed ? [signed] : [],
      })

      expect(result.results.results).toEqual([
        { action: ActionType.REGISTER_API_KEY, success: true },
      ])
      // Execute submits under the user's own address — no agent address.
      expect(executeCalls[0].signerAddress).toBe(lighterAddress)
      // The plugin's WASM signer was driven (WASM_BLOB scheme), not an agent.
      expect(lighter.signActions).toHaveBeenCalledOnce()
      expect(lighter.signActions.mock.calls[0][0]).toBe(SigningMethod.WASM_BLOB)
    })

    it('skips the /executeAction hop for a client-executed venue mutation (no token reaches LI.FI)', async () => {
      const lighter = createWasmOnlyProvider()
      // Token-authenticated venue mutations (ACCOUNT_TYPE / SET_REFERRAL) run
      // entirely during signing and yield no backend-bound step.
      lighter.signActions.mockResolvedValue([])
      const lighterClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [lighter],
      })

      const executeBodies: ExecuteActionRequest[] = []
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          return HttpResponse.json({
            actions: [
              {
                action: body.action,
                wasmSignParams: { kind: 'changeAccountTier' },
              },
            ],
          } satisfies CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          executeBodies.push((await request.json()) as ExecuteActionRequest)
          return HttpResponse.json({
            results: [],
          } satisfies ExecuteActionResponse)
        })
      )

      await expect(
        lighterClient.executeProviderOption({
          provider: 'lighter',
          address: lighterAddress,
          action: ActionType.ACCOUNT_TYPE,
          params: { tier: 'premium' },
        })
      ).resolves.toBeUndefined()

      // Nothing was forwarded to the backend, so no Lighter auth token could
      // transit LI.FI for this flow.
      expect(executeBodies).toEqual([])
    })

    it('orchestrates both plugins: Hyperliquid agent-signs while Lighter WASM-signs', async () => {
      const hl = createTestAgentProvider({ type: 'hyperliquid' })
      const lighter = createWasmOnlyProvider()
      const bothClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [hl, lighter],
      })
      await hl.createAgent(userAddress)
      const hlAgent = await hl.resolveActionRequest!(
        ActionType.PLACE_ORDER,
        userAddress,
        [PerpsSigner.AGENT]
      )

      const executeCalls: ExecuteActionRequest[] = []
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          return HttpResponse.json(
            body.provider === 'hyperliquid'
              ? {
                  actions: [
                    {
                      action: body.action,
                      typedData: {
                        domain: { name: 'HL', chainId: 1 },
                        types: { Order: [{ name: 'x', type: 'uint256' }] },
                        primaryType: 'Order',
                        message: { x: 0 },
                      },
                    },
                  ],
                }
              : {
                  actions: [{ action: body.action, wasmSignParams: {} }],
                }
          )
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          executeCalls.push(body)
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          } satisfies ExecuteActionResponse)
        })
      )

      const hlResult = await bothClient.placeOrder({
        address: userAddress,
        provider: 'hyperliquid',
        symbol: 'BTC',
        side: 'BUY' as any,
        type: 'MARKET' as any,
        size: '0.1',
        price: '95000.00',
      })
      const lighterResult = await bothClient.placeOrder({
        address: lighterAddress,
        provider: 'lighter',
        symbol: 'BTC',
        side: 'BUY' as any,
        type: 'MARKET' as any,
        size: '0.1',
        price: '95000.00',
      })

      expect(hlResult.results[0].success).toBe(true)
      expect(lighterResult.results[0].success).toBe(true)

      const hlExec = executeCalls.find((c) => c.provider === 'hyperliquid')!
      const lighterExec = executeCalls.find((c) => c.provider === 'lighter')!
      // Hyperliquid submits under its agent; Lighter under the user address.
      expect(hlExec.signerAddress).toBe(hlAgent.signerAddress)
      expect(lighterExec.signerAddress).toBe(lighterAddress)
      expect(lighter.signActions.mock.calls[0][0]).toBe(SigningMethod.WASM_BLOB)
    })
  })

  describe('execute — authToken rest-call actions run client-side', () => {
    const BASE_URL = DEFAULT_API_URL
    const ondoAddress = '0x9999999999999999999999999999999999999999' as Address

    const ondoProviderMetadata = {
      key: 'ondo',
      name: 'Ondo',
      logoURI: 'https://example.com/ondo.png',
      signingMethod: SigningMethod.AUTH_TOKEN,
      active: true,
      setup: [],
      options: [],
      actions: [
        {
          type: ActionType.PLACE_ORDER,
          signers: [PerpsSigner.API_KEY],
          signingMethod: SigningMethod.AUTH_TOKEN,
        },
      ],
      categories: [],
    }

    const restCallStep = {
      action: ActionType.PLACE_ORDER,
      request: {
        method: 'POST' as const,
        path: '/v1/perps/orders',
        body: { market_id: 1, side: 'BUY' },
      },
    }

    const CREDENTIAL_HEADERS = {
      Authorization: 'Bearer test-jwt',
      'ONDO-BUILDER': 'lifi',
    }

    const orderParams = {
      symbol: 'BTC',
      side: 'BUY' as any,
      type: 'MARKET' as any,
      size: '0.1',
      price: '95000.00',
    }

    /**
     * Minimal authToken plugin: `signActions` attaches the client-held
     * credential headers, `executeRestCallActions` plays the venue and
     * returns the authoritative results.
     */
    function createAuthTokenProvider() {
      const signActions = vi.fn(
        async (
          _method,
          steps: (typeof restCallStep)[]
        ): Promise<SignedActionStep[]> =>
          steps.map((s) => ({
            action: s.action,
            request: s.request,
            headers: { ...CREDENTIAL_HEADERS },
          }))
      )
      const executeRestCallActions = vi.fn(
        async (steps: { action: ActionType }[]) =>
          steps.map((s) => ({
            action: s.action,
            success: true as const,
            orderId: 'ondo-order-1',
          }))
      )
      return {
        type: 'ondo',
        bind: vi.fn(),
        projectConfig: vi.fn(() => []),
        signActions,
        executeRestCallActions,
      } as unknown as PerpsProviderPlugin & {
        signActions: ReturnType<typeof vi.fn>
        executeRestCallActions: ReturnType<typeof vi.fn>
      }
    }

    /**
     * Register the ondo provider metadata plus createAction/executeAction
     * handlers, capturing every backend-bound raw body so tests can assert
     * the credential never crosses to the LI.FI backend.
     */
    function useOndoHandlers(opts: { executeStatus?: number } = {}) {
      const backendBodies: string[] = []
      const executeRequests: ExecuteActionRequest[] = []
      server.use(
        http.get(`${BASE_URL}/providers`, () =>
          HttpResponse.json({
            providers: [...mockProviders.providers, ondoProviderMetadata],
          })
        ),
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          backendBodies.push(await request.text())
          return HttpResponse.json({
            actions: [restCallStep],
          } satisfies CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const raw = await request.text()
          backendBodies.push(raw)
          executeRequests.push(JSON.parse(raw) as ExecuteActionRequest)
          if (opts.executeStatus) {
            return HttpResponse.json(
              { code: PerpsErrorCode.ServerError, message: 'boom' },
              { status: opts.executeStatus }
            )
          }
          return HttpResponse.json({
            results: [
              {
                action: ActionType.PLACE_ORDER,
                success: true,
                orderId: 'backend-echo',
              },
            ],
          } satisfies ExecuteActionResponse)
        })
      )
      return { backendBodies, executeRequests }
    }

    function createOndoClient(plugin: PerpsProviderPlugin) {
      return new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [plugin],
      })
    }

    it('routes the signed rest-call steps to executeRestCallActions and returns the venue results', async () => {
      const ondo = createAuthTokenProvider()
      const { executeRequests } = useOndoHandlers()

      const result = await createOndoClient(ondo).execute({
        provider: 'ondo',
        address: ondoAddress,
        action: ActionType.PLACE_ORDER,
        params: orderParams,
      })

      // The plugin received the credential-bearing signed steps…
      expect(ondo.executeRestCallActions).toHaveBeenCalledOnce()
      const [steps, calledAddress] = ondo.executeRestCallActions.mock.calls[0]
      expect(calledAddress).toBe(ondoAddress)
      expect(steps[0].request).toEqual(restCallStep.request)
      expect(steps[0].headers).toEqual(CREDENTIAL_HEADERS)
      // …and its results are authoritative — not the backend's echo.
      expect(result.results).toEqual([
        {
          action: ActionType.PLACE_ORDER,
          success: true,
          orderId: 'ondo-order-1',
        },
      ])
      // The backend bookkeeping submission still happened, exactly once.
      expect(executeRequests).toHaveLength(1)
    })

    it('never sends credential headers to the LI.FI backend', async () => {
      const ondo = createAuthTokenProvider()
      const { backendBodies, executeRequests } = useOndoHandlers()

      await createOndoClient(ondo).execute({
        provider: 'ondo',
        address: ondoAddress,
        action: ActionType.PLACE_ORDER,
        params: orderParams,
      })

      expect(backendBodies.length).toBeGreaterThan(0)
      for (const body of backendBodies) {
        expect(body).not.toContain('Authorization')
        expect(body).not.toContain('ONDO-')
        expect(body).not.toContain('test-jwt')
      }
      const [step] = executeRequests[0].actions as RestCallSignedActionStep[]
      expect(step.headers).toEqual({})
    })

    it('a backend bookkeeping failure does not mask the venue success but is logged', async () => {
      const ondo = createAuthTokenProvider()
      const { executeRequests } = useOndoHandlers({ executeStatus: 503 })
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await createOndoClient(ondo).execute({
        provider: 'ondo',
        address: ondoAddress,
        action: ActionType.PLACE_ORDER,
        params: orderParams,
      })

      // The order already landed on the venue — the failed bookkeeping
      // submission must not surface as a caller-visible failure.
      expect(result.results).toEqual([
        {
          action: ActionType.PLACE_ORDER,
          success: true,
          orderId: 'ondo-order-1',
        },
      ])
      // Bookkeeping was attempted exactly once — money-adjacent, never retried.
      expect(executeRequests).toHaveLength(1)
      // …but the failure must still be observable, not swallowed silently.
      expect(errorLog).toHaveBeenCalledOnce()
      const [message, error] = errorLog.mock.calls[0]
      expect(message).toContain('[ondo]')
      expect(message).toMatch(/bookkeeping/)
      expect(error).toBeInstanceOf(Error)
      errorLog.mockRestore()
    })

    it('throws SDKError when the provider does not implement executeRestCallActions', async () => {
      const ondo = createAuthTokenProvider()
      ;(ondo as { executeRestCallActions?: unknown }).executeRestCallActions =
        undefined
      const { executeRequests } = useOndoHandlers()

      await expect(
        createOndoClient(ondo).execute({
          provider: 'ondo',
          address: ondoAddress,
          action: ActionType.PLACE_ORDER,
          params: orderParams,
        })
      ).rejects.toMatchObject({
        code: PerpsErrorCode.SDKError,
        message: expect.stringMatching(/executeRestCallActions/),
      })
      expect(executeRequests).toHaveLength(0)
    })

    it('throws SDKError when the plugin signs an authToken action with non-rest-call steps', async () => {
      const ondo = createAuthTokenProvider()
      ondo.signActions.mockResolvedValueOnce([
        {
          action: ActionType.PLACE_ORDER,
          typedData: {
            domain: { name: 'Test', chainId: 1 },
            types: { Order: [{ name: 'x', type: 'uint256' }] },
            primaryType: 'Order',
            message: { x: 0 },
          },
          signature: '0xsig',
        },
      ])
      const { executeRequests } = useOndoHandlers()

      await expect(
        createOndoClient(ondo).execute({
          provider: 'ondo',
          address: ondoAddress,
          action: ActionType.PLACE_ORDER,
          params: orderParams,
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
      expect(ondo.executeRestCallActions).not.toHaveBeenCalled()
      expect(executeRequests).toHaveLength(0)
    })

    it('never invokes executeRestCallActions on the eip712 path', async () => {
      const hl = createTestAgentProvider({ type: 'hyperliquid' })
      const spy = vi.fn()
      ;(
        hl as unknown as { executeRestCallActions: unknown }
      ).executeRestCallActions = spy
      const hlClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [hl],
      })
      await hl.createAgent(userAddress)

      const result = await hlClient.placeOrder({
        address: userAddress,
        provider: 'hyperliquid',
        ...orderParams,
      })

      expect(result.results[0].success).toBe(true)
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('switchChain — SDK-owned wallet chain switching', () => {
    const BASE_URL = DEFAULT_API_URL
    const account = privateKeyToAccount(`0x${'33'.repeat(32)}` as Hex)
    const ARBITRUM = 42161

    // Wallet backed by a viem `custom` transport answering eth_chainId +
    // eth_signTypedData_v4, so viem's real `getChainId` runs against the mock.
    // The returned `request` spy lets a test assert which RPCs were issued.
    function walletOnChain(chainId: number) {
      const request = vi.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') {
          return `0x${chainId.toString(16)}`
        }
        if (method === 'eth_signTypedData_v4') {
          return `0x${'ab'.repeat(65)}`
        }
        throw new Error(`unexpected RPC: ${method}`)
      })
      const wallet = createWalletClient({
        account,
        transport: custom({ request: request as any }),
      })
      return { wallet, request }
    }

    // /createAction returns a USER-signed EIP-712 step for `chainId` (omit to
    // stage a step with no domain.chainId); /executeAction echoes success and
    // is captured.
    function stageUserEip712Action(chainId?: number) {
      const executeCalls: ExecuteActionRequest[] = []
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          return HttpResponse.json({
            actions: [
              {
                action: body.action,
                typedData: {
                  domain: chainId === undefined ? { name: 'HL' } : { chainId },
                  types: { X: [{ name: 'x', type: 'uint256' }] },
                  primaryType: 'X',
                  message: { x: 0 },
                },
              },
            ],
          } satisfies CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          executeCalls.push(body)
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          } satisfies ExecuteActionResponse)
        })
      )
      return executeCalls
    }

    function newClient() {
      return new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [createTestAgentProvider({ type: 'hyperliquid' })],
      })
    }

    const withdrawal = { destination: account.address, amount: '10' }

    it('switches a json-rpc wallet once and leaves sdkClient.userWallet unmutated', async () => {
      const { wallet } = walletOnChain(1)
      const switched = walletOnChain(ARBITRUM)
      const hook = vi.fn(async () => switched.wallet)

      const client = newClient()
      client.setUserWallet(wallet)
      client.setSwitchChain(hook)
      stageUserEip712Action(ARBITRUM)

      await client.withdraw({
        provider: 'hyperliquid',
        address: account.address,
        withdrawal,
      })

      expect(hook).toHaveBeenCalledOnce()
      expect(hook).toHaveBeenCalledWith(ARBITRUM)
      // The switch is transient — the configured wallet is untouched.
      expect(client.client.userWallet).toBe(wallet)
    })

    it('takes the fast path without calling the hook when already on target', async () => {
      const { wallet } = walletOnChain(ARBITRUM)
      const hook = vi.fn()

      const client = newClient()
      client.setUserWallet(wallet)
      client.setSwitchChain(hook)
      stageUserEip712Action(ARBITRUM)

      await client.withdraw({
        provider: 'hyperliquid',
        address: account.address,
        withdrawal,
      })

      expect(hook).not.toHaveBeenCalled()
    })

    it('does not probe the chain or throw for a wrong-chain wallet with no hook', async () => {
      const { wallet, request } = walletOnChain(1)

      const client = newClient()
      client.setUserWallet(wallet)
      stageUserEip712Action(ARBITRUM)

      await expect(
        client.withdraw({
          provider: 'hyperliquid',
          address: account.address,
          withdrawal,
        })
      ).resolves.toBeDefined()

      const probed = request.mock.calls.some(
        ([{ method }]) => method === 'eth_chainId'
      )
      expect(probed).toBe(false)
    })

    it('throws SDKError when the hook resolves to undefined', async () => {
      const { wallet } = walletOnChain(1)
      const hook = vi.fn(async () => undefined)

      const client = newClient()
      client.setUserWallet(wallet)
      client.setSwitchChain(hook)
      stageUserEip712Action(ARBITRUM)

      await expect(
        client.withdraw({
          provider: 'hyperliquid',
          address: account.address,
          withdrawal,
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    })

    it('throws SDKError when the hook returns a client on the wrong chain', async () => {
      const { wallet } = walletOnChain(1)
      const stillWrong = walletOnChain(10)
      const hook = vi.fn(async () => stillWrong.wallet)

      const client = newClient()
      client.setUserWallet(wallet)
      client.setSwitchChain(hook)
      stageUserEip712Action(ARBITRUM)

      await expect(
        client.withdraw({
          provider: 'hyperliquid',
          address: account.address,
          withdrawal,
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    })

    it('does not call the hook for an AGENT-signed batch', async () => {
      const { wallet } = walletOnChain(1)
      const hook = vi.fn(async () => wallet)
      const agentProvider = createTestAgentProvider({ type: 'hyperliquid' })
      const client = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [agentProvider],
      })
      await agentProvider.createAgent(account.address)
      client.setUserWallet(wallet)
      client.setSwitchChain(hook)

      await client.placeOrder({
        address: account.address,
        provider: 'hyperliquid',
        symbol: 'BTC',
        side: 'BUY' as any,
        type: 'MARKET' as any,
        size: '0.1',
        price: '95000.00',
      })

      expect(hook).not.toHaveBeenCalled()
    })

    it('does not call the hook when the batch carries no domain.chainId', async () => {
      const { wallet } = walletOnChain(1)
      const hook = vi.fn(async () => wallet)

      const client = newClient()
      client.setUserWallet(wallet)
      client.setSwitchChain(hook)
      stageUserEip712Action()

      await client.withdraw({
        provider: 'hyperliquid',
        address: account.address,
        withdrawal,
      })

      expect(hook).not.toHaveBeenCalled()
    })

    it('wires the hook via the constructor option too', async () => {
      const { wallet } = walletOnChain(1)
      const switched = walletOnChain(ARBITRUM)
      const hook = vi.fn(async () => switched.wallet)

      const client = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [createTestAgentProvider({ type: 'hyperliquid' })],
        switchChain: hook,
      })
      client.setUserWallet(wallet)
      stageUserEip712Action(ARBITRUM)

      await client.withdraw({
        provider: 'hyperliquid',
        address: account.address,
        withdrawal,
      })

      expect(hook).toHaveBeenCalledOnce()
      expect(hook).toHaveBeenCalledWith(ARBITRUM)
    })

    it('triggers the switch through sendAsset', async () => {
      const { wallet } = walletOnChain(1)
      const switched = walletOnChain(ARBITRUM)
      const hook = vi.fn(async () => switched.wallet)

      const client = newClient()
      client.setUserWallet(wallet)
      client.setSwitchChain(hook)
      stageUserEip712Action(ARBITRUM)

      await client.sendAsset({
        provider: 'hyperliquid',
        address: account.address,
        collateral: 'USDC',
        sourceDex: 'a',
        destinationDex: 'b',
        amount: '5',
      })

      expect(hook).toHaveBeenCalledOnce()
      expect(hook).toHaveBeenCalledWith(ARBITRUM)
    })

    it('triggers the switch through executeProviderSetupAction', async () => {
      const { wallet } = walletOnChain(1)
      const switched = walletOnChain(ARBITRUM)
      const hook = vi.fn(async () => switched.wallet)

      const client = newClient()
      client.setUserWallet(wallet)
      client.setSwitchChain(hook)
      server.use(
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          } satisfies ExecuteActionResponse)
        })
      )

      await client.executeProviderSetupAction({
        provider: 'hyperliquid',
        address: account.address,
        step: {
          action: ActionType.APPROVE_AGENT,
          typedData: {
            domain: { name: 'HL', chainId: ARBITRUM },
            types: { X: [{ name: 'x', type: 'uint256' }] },
            primaryType: 'X',
            message: { x: 0 },
          },
        },
      })

      expect(hook).toHaveBeenCalledOnce()
      expect(hook).toHaveBeenCalledWith(ARBITRUM)
    })
  })
})
