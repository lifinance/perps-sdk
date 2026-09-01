import type {
  AccountResponse,
  ActionResult,
  ActionStep,
  Asset,
  CreateActionRequest,
  CreateActionResponse,
  Eip712SignedActionStep,
  ExecuteActionRequest,
  ExecuteActionResponse,
  HmacSignedActionStep,
  Position,
  SignedActionStep,
} from '@lifi/perps-types'
import {
  ActionType,
  acceptTermsTypeFields,
  createReferralCodeTypeFields,
  MarginMode,
  META_PROVIDER,
  OrderSide,
  OrderType,
  onboardTypeFields,
  PerpsErrorCode,
  PerpsSigner,
  PositionMarginAdjustment,
  PositionSide,
  SigningMethod,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import type { Address, EIP1193RequestFn, Hex } from 'viem'
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
  const MARKET = { marketId: 'BTC', categoryId: provider }

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
          market: MARKET,
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
          market: MARKET,
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
        market: MARKET,
        side: 'BUY' as any,
        type: 'MARKET' as any,
        size: '0.1',
        price: '95000.00',
      })

      const [first] = result.results
      expect(result.results).toHaveLength(1)
      if (!first.success) {
        throw new Error('expected success')
      }
      expect(first.orderId).toBe('neworder123')
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
      expect(
        (capturedRequest!.actions[0] as Eip712SignedActionStep).signature
      ).toMatch(/^0x[0-9a-f]+$/i)
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
            market: MARKET,
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
            market: MARKET,
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
      market: MARKET,
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
    function failExecuteAction(error: string, errorCode?: PerpsErrorCode) {
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
            results: [
              { action: body.action, success: false, error, errorCode },
            ],
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

    it('throws under the result errorCode when the backend classified the failure', async () => {
      await agentProvider.createAgent(userAddress)
      const venueError = 'Complete the provider setup before trading.'
      failExecuteAction(venueError, PerpsErrorCode.SetupRequired)

      await expect(
        (client as any).executeProviderSetup({
          provider: 'hyperliquid',
          address: userAddress,
          ...userSetup(ActionType.APPROVE_AGENT),
        })
      ).rejects.toMatchObject({
        code: PerpsErrorCode.SetupRequired,
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

    it('invokes the plugin onExecuteResults hook with the failing results before throwing', async () => {
      const hookedProvider = createTestAgentProvider({ type: 'hyperliquid' })
      const onExecuteResults = vi.fn<
        (address: Address, results: ActionResult[]) => Promise<void>
      >(async () => {})
      ;(hookedProvider as any).onExecuteResults = onExecuteResults
      const hookedClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [hookedProvider],
      })
      await hookedProvider.createAgent(userAddress)
      failExecuteAction('venue says no')

      await expect(
        (hookedClient as any).executeProviderSetup({
          provider: 'hyperliquid',
          address: userAddress,
          ...userSetup(ActionType.APPROVE_AGENT),
        })
      ).rejects.toMatchObject({ message: 'venue says no' })

      expect(onExecuteResults).toHaveBeenCalledTimes(1)
      expect(onExecuteResults.mock.calls[0][0]).toBe(userAddress)
      expect(onExecuteResults.mock.calls[0][1]).toEqual([
        {
          action: ActionType.APPROVE_AGENT,
          success: false,
          error: 'venue says no',
        },
      ])
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
    function respondAccountMode(result: {
      success: boolean
      error?: string
      errorCode?: PerpsErrorCode
    }) {
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

    it('throws under the result errorCode when the backend classified the failure', async () => {
      await agentProvider.createAgent(userAddress)
      const venueError = 'Complete the provider setup before trading.'
      respondAccountMode({
        success: false,
        error: venueError,
        errorCode: PerpsErrorCode.SetupRequired,
      })

      await expect(
        client.executeProviderOption({
          provider,
          address: userAddress,
          action: ActionType.ACCOUNT_MODE,
          params: { mode: 'dexAbstraction' },
        })
      ).rejects.toMatchObject({
        code: PerpsErrorCode.SetupRequired,
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

  describe('venue txHash → explorer link on execute results', () => {
    const BASE_URL = DEFAULT_API_URL
    // A Lighter WASM-signed action: the signer computes the L2 hash before the
    // network call, so the backend echoes it on the per-step result.
    const TX_HASH = `0x${'8f2b1c4d'.repeat(8)}`
    const EXPLORER_BASE = 'https://app.lighter.xyz/explorer/logs/'
    const TYPED_DATA = {
      domain: { name: 'venue', chainId: 1 },
      types: { Setup: [{ name: 'x', type: 'uint256' }] },
      primaryType: 'Setup' as const,
      message: { x: 0 },
    }
    const ORDER = {
      market: { marketId: 'BTC', categoryId: 'lighter' },
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      size: '0.1',
      price: '95000.00',
    } as const

    function respondExecute(result: Record<string, unknown>) {
      server.use(
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          return HttpResponse.json({
            results: [
              {
                action: body.action,
                success: true,
                orderId: '9',
                ...result,
              },
            ],
          } as ExecuteActionResponse)
        })
      )
    }

    async function placeLighterOrder(
      plugin: Partial<PerpsProviderPlugin>
    ): Promise<ExecuteActionResponse> {
      const lighter = createTestAgentProvider({ type: 'lighter', ...plugin })
      const lighterClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [lighter],
      })
      await lighter.createAgent(userAddress)
      return lighterClient.placeOrder({
        address: userAddress,
        provider: 'lighter',
        ...ORDER,
      })
    }

    it('carries the backend hash and the provider-built explorer URL', async () => {
      respondExecute({ txHash: TX_HASH })

      const { results } = await placeLighterOrder({
        resolveExplorerLink: (txHash) => `${EXPLORER_BASE}${txHash}`,
      })

      expect(results).toEqual([
        {
          action: ActionType.PLACE_ORDER,
          success: true,
          orderId: '9',
          txHash: TX_HASH,
          explorerLink: `${EXPLORER_BASE}${TX_HASH}`,
        },
      ])
    })

    it('omits both fields when the backend response carries no hash', async () => {
      respondExecute({})
      const resolveExplorerLink = vi.fn(() => `${EXPLORER_BASE}${TX_HASH}`)

      const { results } = await placeLighterOrder({ resolveExplorerLink })

      expect(results[0]).not.toHaveProperty('txHash')
      expect(results[0]).not.toHaveProperty('explorerLink')
      expect(resolveExplorerLink).not.toHaveBeenCalled()
    })

    it('keeps the hash but omits the link for an instance with no explorer', async () => {
      respondExecute({ txHash: TX_HASH })

      const { results } = await placeLighterOrder({
        resolveExplorerLink: () => undefined,
      })

      expect(results[0]).toMatchObject({ txHash: TX_HASH })
      expect(results[0]).not.toHaveProperty('explorerLink')
    })

    it('leaves a provider with no explorer concept unlinked (Hyperliquid, Ondo)', async () => {
      await agentProvider.createAgent(userAddress)
      expect(agentProvider.resolveExplorerLink).toBeUndefined()
      respondExecute({ txHash: TX_HASH })

      const { results } = await client.placeOrder({
        address: userAddress,
        provider,
        ...ORDER,
      })

      expect(results[0]).toMatchObject({ txHash: TX_HASH })
      expect(results[0]).not.toHaveProperty('explorerLink')
    })

    it('yields neither field on the default hashless Hyperliquid response', async () => {
      await agentProvider.createAgent(userAddress)

      const { results } = await client.placeOrder({
        address: userAddress,
        provider,
        ...ORDER,
      })

      expect(results[0]).not.toHaveProperty('txHash')
      expect(results[0]).not.toHaveProperty('explorerLink')
    })

    it('links setup-path results and hands the linked results to onExecuteResults', async () => {
      const onExecuteResults = vi.fn<
        (address: Address, results: ActionResult[]) => Promise<void>
      >(async () => {})
      const lighter = createTestAgentProvider({
        type: 'lighter',
        resolveExplorerLink: (txHash) => `${EXPLORER_BASE}${txHash}`,
        onExecuteResults,
      })
      const lighterClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [lighter],
      })
      await lighter.createAgent(userAddress)
      respondExecute({ txHash: TX_HASH })

      await lighterClient.executeProviderSetupAction({
        provider: 'lighter',
        address: userAddress,
        step: { action: ActionType.REGISTER_API_KEY, typedData: TYPED_DATA },
      })

      expect(onExecuteResults.mock.calls[0][1]).toEqual([
        {
          action: ActionType.REGISTER_API_KEY,
          success: true,
          orderId: '9',
          txHash: TX_HASH,
          explorerLink: `${EXPLORER_BASE}${TX_HASH}`,
        },
      ])
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
  // getDepositFlow — optional plugin method, undefined when unimplemented
  // ---------------------------------------------------------------------------

  describe('getDepositFlow', () => {
    const flow = {
      kind: 'lifiSwap',
      destination: { chainId: 1337, address: userAddress, decimals: 6 },
    } as const

    const clientWith = (plugin: Record<string, unknown>): PerpsClient =>
      new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: 'hyperliquid',
            bind: vi.fn(),
            projectConfig: vi.fn(() => []),
            ...plugin,
          } as unknown as PerpsProviderPlugin,
        ],
      })

    it('delegates to the plugin with the address and returns its flow', async () => {
      const getDepositFlow = vi.fn(async () => flow)
      await expect(
        clientWith({ getDepositFlow }).getDepositFlow({
          provider,
          address: userAddress,
        })
      ).resolves.toEqual(flow)
      expect(getDepositFlow).toHaveBeenCalledWith({ address: userAddress })
    })

    it('resolves undefined when the plugin does not implement discovery', async () => {
      await expect(
        clientWith({}).getDepositFlow({ provider, address: userAddress })
      ).resolves.toBeUndefined()
    })

    it('propagates the plugin error', async () => {
      const getDepositFlow = vi.fn(async () => {
        throw new PerpsError(PerpsErrorCode.ServerError, 'upstream down')
      })
      await expect(
        clientWith({ getDepositFlow }).getDepositFlow({
          provider,
          address: userAddress,
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.ServerError })
    })

    it('throws when no plugin is registered for the provider', async () => {
      const noProviderClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
      })
      await expect(
        noProviderClient.getDepositFlow({ provider, address: userAddress })
      ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
    })
  })

  // ---------------------------------------------------------------------------
  // getWithdrawableBalances — provider route split joined with core asset metadata
  // ---------------------------------------------------------------------------

  describe('getWithdrawableBalances', () => {
    // Per-asset precision and minimums as live
    // `GET https://mainnet.zklighter.elliot.ai/api/v1/assetDetails` reports them.
    const ASSETS: Asset[] = [
      {
        providerId: provider,
        id: '1',
        displaySymbol: 'ETH',
        logoURI: '',
        decimals: 8,
        l1Decimals: 18,
        l1Address: '0x0000000000000000000000000000000000000000',
        minWithdrawalAmount: '0.00100000',
      },
      {
        providerId: provider,
        id: '3',
        displaySymbol: 'USDC',
        logoURI: '',
        decimals: 6,
        l1Decimals: 6,
        l1Address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        minWithdrawalAmount: '1.000000',
      },
      { providerId: provider, id: '9', displaySymbol: 'LDO', logoURI: '' },
    ]

    const clientWith = (
      plugin: Record<string, unknown>,
      assets: Asset[] = ASSETS
    ): PerpsClient => {
      server.use(
        http.get(`${DEFAULT_API_URL}/assets`, () =>
          HttpResponse.json({ assets })
        )
      )
      return new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: provider,
            bind: vi.fn(),
            projectConfig: vi.fn(() => []),
            ...plugin,
          } as unknown as PerpsProviderPlugin,
        ],
      })
    }

    const withRows = (rows: unknown[]) => ({
      getWithdrawableBalances: vi.fn(async () => rows),
    })

    it('joins core asset metadata onto every actionable row', async () => {
      const plugin = withRows([
        { assetId: '1', route: 'spot', available: '0.00609091' },
        { assetId: '3', route: 'spot', available: '10.9886' },
        { assetId: '3', route: 'perps', available: '11.009697536' },
      ])
      await expect(
        clientWith(plugin).getWithdrawableBalances({
          provider,
          address: userAddress,
        })
      ).resolves.toEqual([
        { asset: ASSETS[0], route: 'spot', available: '0.00609091' },
        { asset: ASSETS[1], route: 'spot', available: '10.9886' },
        { asset: ASSETS[1], route: 'perps', available: '11.009697536' },
      ])
      expect(plugin.getWithdrawableBalances).toHaveBeenCalledWith({
        address: userAddress,
      })
    })

    it('excludes rows below the asset minimum', async () => {
      await expect(
        clientWith(
          withRows([
            { assetId: '1', route: 'spot', available: '0.000040752' },
            { assetId: '3', route: 'spot', available: '0.008924170612' },
            { assetId: '3', route: 'perps', available: '0.003226339915' },
          ])
        ).getWithdrawableBalances({ provider, address: userAddress })
      ).resolves.toEqual([])
    })

    it('identifies malformed minimum metadata by asset and field', async () => {
      const assets = [
        { ...ASSETS[0], minWithdrawalAmount: 'not-a-decimal' },
        ...ASSETS.slice(1),
      ]
      await expect(
        clientWith(
          withRows([{ assetId: '1', route: 'spot', available: '0.00609091' }]),
          assets
        ).getWithdrawableBalances({ provider, address: userAddress })
      ).rejects.toMatchObject({
        code: PerpsErrorCode.SDKError,
        message:
          "Asset '1' field `minWithdrawalAmount` is not a valid decimal.",
      })
    })

    it('keeps a row sitting exactly on the asset minimum', async () => {
      await expect(
        clientWith(
          withRows([{ assetId: '1', route: 'spot', available: '0.001' }])
        ).getWithdrawableBalances({ provider, address: userAddress })
      ).resolves.toEqual([
        { asset: ASSETS[0], route: 'spot', available: '0.001' },
      ])
    })

    it('keeps rows for an asset that publishes no minimum', async () => {
      await expect(
        clientWith(
          withRows([{ assetId: '9', route: 'spot', available: '0.05153' }])
        ).getWithdrawableBalances({ provider, address: userAddress })
      ).resolves.toEqual([
        { asset: ASSETS[2], route: 'spot', available: '0.05153' },
      ])
    })

    it('omits a row whose asset the provider registry does not carry', async () => {
      await expect(
        clientWith(
          withRows([{ assetId: '2', route: 'spot', available: '6.00005017' }])
        ).getWithdrawableBalances({ provider, address: userAddress })
      ).resolves.toEqual([])
    })

    it('resolves undefined when the plugin declares no withdrawable read', async () => {
      await expect(
        clientWith({}).getWithdrawableBalances({
          provider,
          address: userAddress,
        })
      ).resolves.toBeUndefined()
    })

    it('throws when no plugin is registered for the provider', async () => {
      const noProviderClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
      })
      await expect(
        noProviderClient.getWithdrawableBalances({
          provider,
          address: userAddress,
        })
      ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
    })
  })

  describe('getMarketSettings', () => {
    const market = { marketId: 'BTC', categoryId: 'perps' }
    const clientWith = (plugin: Record<string, unknown>): PerpsClient =>
      new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: provider,
            bind: vi.fn(),
            projectConfig: vi.fn(() => []),
            ...plugin,
          } as unknown as PerpsProviderPlugin,
        ],
      })

    it('delegates the address and complete market identity', async () => {
      const settings = { marginMode: MarginMode.CROSS, leverage: 20 }
      const getMarketSettings = vi.fn(async () => settings)

      await expect(
        clientWith({ getMarketSettings }).getMarketSettings({
          provider,
          address: userAddress,
          market,
        })
      ).resolves.toEqual(settings)
      expect(getMarketSettings).toHaveBeenCalledWith({
        address: userAddress,
        market,
      })
    })

    it('resolves undefined when the plugin has no settings read', async () => {
      await expect(
        clientWith({}).getMarketSettings({
          provider,
          address: userAddress,
          market,
        })
      ).resolves.toBeUndefined()
    })

    it('propagates provider errors', async () => {
      const getMarketSettings = vi.fn(async () => {
        throw new PerpsError(PerpsErrorCode.ServerError, 'upstream down')
      })

      await expect(
        clientWith({ getMarketSettings }).getMarketSettings({
          provider,
          address: userAddress,
          market,
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.ServerError })
    })

    it('throws when no plugin is registered for the provider', async () => {
      const noProviderClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
      })

      await expect(
        noProviderClient.getMarketSettings({
          provider,
          address: userAddress,
          market,
        })
      ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
    })
  })

  describe('getPositionMarginConstraints', () => {
    const position: Position = {
      market: {
        providerId: provider,
        id: 'BTC',
        categoryId: 'perps',
        baseAsset: {
          providerId: provider,
          id: 'BTC',
          displaySymbol: 'BTC',
          logoURI: 'https://example.com/btc.png',
        },
        quoteAsset: {
          providerId: provider,
          id: 'USDC',
          displaySymbol: 'USDC',
          logoURI: 'https://example.com/usdc.png',
        },
        positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
      },
      side: PositionSide.LONG,
      size: '1',
      entryPrice: '10000',
      markPrice: '10000',
      liquidationPrice: '8000',
      unrealizedPnl: '0',
      accruedFunding: '0',
      leverage: 10,
      marginUsed: '1500',
      initialMarginRequirement: '1000',
      marginMode: MarginMode.ISOLATED,
    }

    it('delegates the complete position to its registered provider', () => {
      const constraints = {
        minimumMarginRequirement: '1000',
        amountIncrement: '0.000001',
      }
      const positionMarginConstraints = vi.fn(() => constraints)
      const client = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: provider,
            bind: vi.fn(),
            projectConfig: vi.fn(() => []),
            positionMarginConstraints,
          } as unknown as PerpsProviderPlugin,
        ],
      })

      expect(client.getPositionMarginConstraints(position)).toEqual(constraints)
      expect(positionMarginConstraints).toHaveBeenCalledWith(position)
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
            actions: [{ action: body.action, session: {} } as ActionStep],
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
                signingMethod: SigningMethod.HMAC,
                active: true,
                setup: [
                  {
                    type: ActionType.SET_REFERRAL,
                    signers: [PerpsSigner.USER],
                    signingMethod: SigningMethod.HMAC,
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
                  body: '{"code":"LIFI"}',
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
                signingMethod: SigningMethod.HMAC,
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
                    signingMethod: SigningMethod.HMAC,
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
            actions: [{ action: body.action, session: {} } as ActionStep],
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
                signingMethod: SigningMethod.HMAC,
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
                    signingMethod: SigningMethod.HMAC,
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
  // checkSetup — provider-declared internal setup steps are drained in place
  // and never surface in the returned setup list.
  // ---------------------------------------------------------------------------

  describe('checkSetup — internal setup steps', () => {
    const BASE_URL = DEFAULT_API_URL
    const key = 'venue'

    const providersHandler = (setup: unknown[]) =>
      http.get(`${BASE_URL}/providers`, () =>
        HttpResponse.json({
          providers: [
            {
              key,
              name: 'Venue',
              logoURI: 'https://example.com/venue.png',
              signingMethod: SigningMethod.EIP712,
              active: true,
              setup,
              options: [],
              actions: [],
              categories: [],
            },
          ],
        })
      )

    const internalStep = (signers: PerpsSigner[]) => ({
      type: ActionType.SET_REFERRAL,
      signers,
      signingMethod: SigningMethod.EIP712,
      sequence: 10,
      params: [],
    })

    it('drains a backend-executed internal step and omits it from setup', async () => {
      const signActions = vi.fn(
        async (
          _method: SigningMethod,
          steps: { action: ActionType }[]
        ): Promise<SignedActionStep[]> =>
          steps.map((s) => ({
            action: s.action,
            typedData: {
              domain: {},
              types: {},
              primaryType: 'X',
              message: {},
            },
            signature: '0xsig',
          })) as unknown as SignedActionStep[]
      )
      const venueClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: key,
            bind: vi.fn(),
            accountExists: vi.fn(async () => true),
            projectConfig: vi.fn(() => []),
            internalSetupActions: [ActionType.SET_REFERRAL],
            signActions,
          } as unknown as PerpsProviderPlugin,
        ],
      })

      const createCalls: ActionType[] = []
      let executeCount = 0
      server.use(
        providersHandler([internalStep([PerpsSigner.SDK])]),
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          createCalls.push(body.action)
          return HttpResponse.json({
            actions: [
              {
                action: body.action,
                typedData: {
                  domain: {},
                  types: {},
                  primaryType: 'X',
                  message: {},
                },
              },
            ],
          } as unknown as CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          executeCount++
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          } satisfies ExecuteActionResponse)
        })
      )

      const result = await venueClient.checkSetup({
        provider: key,
        address: userAddress,
      })

      expect(result).toEqual({ accountExists: true, setup: [], isReady: true })
      expect(createCalls).toEqual([ActionType.SET_REFERRAL])
      expect(signActions).toHaveBeenCalledOnce()
      expect(executeCount).toBe(1)
    })

    it('drains a client-executed internal step with no executeAction hop', async () => {
      const signActions = vi.fn(async (): Promise<SignedActionStep[]> => [])
      const venueClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: key,
            bind: vi.fn(),
            accountExists: vi.fn(async () => true),
            projectConfig: vi.fn(() => []),
            internalSetupActions: [ActionType.SET_REFERRAL],
            signActions,
          } as unknown as PerpsProviderPlugin,
        ],
      })

      let executeCount = 0
      server.use(
        providersHandler([internalStep([PerpsSigner.SDK])]),
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          return HttpResponse.json({
            actions: [{ action: body.action, wasmSignParams: {} }],
          } as unknown as CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCount++
          return HttpResponse.json({ results: [] })
        })
      )

      const result = await venueClient.checkSetup({
        provider: key,
        address: userAddress,
      })

      expect(result).toEqual({ accountExists: true, setup: [], isReady: true })
      expect(signActions).toHaveBeenCalledOnce()
      expect(executeCount).toBe(0)
    })

    it('never drains an internal step the provider config already reports satisfied', async () => {
      const signActions = vi.fn(async (): Promise<SignedActionStep[]> => [])
      const venueClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: key,
            bind: vi.fn(),
            accountExists: vi.fn(async () => true),
            getAccount: vi.fn(async () => mockAccount),
            projectConfig: vi.fn(() => [
              { type: ActionType.SET_REFERRAL, values: [], satisfied: true },
            ]),
            internalSetupActions: [ActionType.SET_REFERRAL],
            signActions,
          } as unknown as PerpsProviderPlugin,
        ],
      })

      let createCount = 0
      server.use(
        providersHandler([internalStep([PerpsSigner.SDK])]),
        http.post(`${BASE_URL}/createAction`, () => {
          createCount++
          return HttpResponse.json({ actions: [] })
        })
      )

      const result = await venueClient.checkSetup({
        provider: key,
        address: userAddress,
      })

      expect(result).toEqual({ accountExists: true, setup: [], isReady: true })
      expect(signActions).not.toHaveBeenCalled()
      expect(createCount).toBe(0)
    })

    it('never blocks setup when a silent internal step fails; the step stays hidden', async () => {
      const signActions = vi.fn(async (): Promise<SignedActionStep[]> => {
        throw new Error('venue rejected the silent step')
      })
      const venueClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: key,
            bind: vi.fn(),
            accountExists: vi.fn(async () => true),
            projectConfig: vi.fn(() => []),
            internalSetupActions: [ActionType.SET_REFERRAL],
            signActions,
          } as unknown as PerpsProviderPlugin,
        ],
      })

      server.use(
        providersHandler([internalStep([PerpsSigner.SDK])]),
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          return HttpResponse.json({
            actions: [{ action: body.action, wasmSignParams: {} }],
          } as unknown as CreateActionResponse)
        })
      )

      const result = await venueClient.checkSetup({
        provider: key,
        address: userAddress,
      })

      expect(result).toEqual({ accountExists: true, setup: [], isReady: true })
      expect(signActions).toHaveBeenCalledOnce()
    })

    it('never hides a step whose signers include USER, even when declared internal', async () => {
      const signActions = vi.fn(async (): Promise<SignedActionStep[]> => [])
      const venueClient = new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [
          {
            type: key,
            bind: vi.fn(),
            accountExists: vi.fn(async () => true),
            projectConfig: vi.fn(() => []),
            internalSetupActions: [ActionType.SET_REFERRAL],
            signActions,
          } as unknown as PerpsProviderPlugin,
        ],
      })

      let executeCount = 0
      server.use(
        providersHandler([internalStep([PerpsSigner.USER])]),
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          return HttpResponse.json({
            actions: [{ action: body.action }],
          } as unknown as CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCount++
          return HttpResponse.json({ results: [] })
        })
      )

      const result = await venueClient.checkSetup({
        provider: key,
        address: userAddress,
      })

      expect(result.setup.map((step) => step.action)).toEqual([
        ActionType.SET_REFERRAL,
      ])
      expect(result.isReady).toBe(false)
      expect(signActions).not.toHaveBeenCalled()
      expect(executeCount).toBe(0)
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
        [PerpsSigner.SDK]
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
        market: MARKET,
        side: 'BUY' as any,
        type: 'MARKET' as any,
        size: '0.1',
        price: '95000.00',
      })
      const lighterResult = await bothClient.placeOrder({
        address: lighterAddress,
        provider: 'lighter',
        market: MARKET,
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

  describe('execute — hmac actions ride executeAction', () => {
    const BASE_URL = DEFAULT_API_URL
    const ondoAddress = '0x9999999999999999999999999999999999999999' as Address

    const ondoProviderMetadata = {
      key: 'ondo',
      name: 'Ondo',
      logoURI: 'https://example.com/ondo.png',
      signingMethod: SigningMethod.HMAC,
      active: true,
      setup: [],
      options: [],
      actions: [
        {
          type: ActionType.PLACE_ORDER,
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.HMAC,
        },
      ],
      categories: [],
    }

    const hmacStep = {
      action: ActionType.PLACE_ORDER,
      request: {
        method: 'POST' as const,
        path: '/v1/perps/orders',
        body: '{"market_id":1,"side":"BUY"}',
      },
    }

    const HMAC_MATERIAL = {
      keyId: 'key-1',
      timestampMs: 1700000000000,
      signature: 'abc123def456',
    }

    const orderParams = {
      market: MARKET,
      side: 'BUY' as any,
      type: 'MARKET' as any,
      size: '0.1',
      price: '95000.00',
    }

    // Minimal hmac plugin: `signActions` attaches the per-request HMAC
    // material; the signed step then rides the normal executeAction path like
    // any other signing method.
    function createHmacProvider() {
      const signActions = vi.fn(
        async (
          _method,
          steps: (typeof hmacStep)[]
        ): Promise<SignedActionStep[]> =>
          steps.map((s) => ({
            action: s.action,
            request: s.request,
            hmac: { ...HMAC_MATERIAL },
          }))
      )
      return {
        type: 'ondo',
        bind: vi.fn(),
        projectConfig: vi.fn(() => []),
        signActions,
      } as unknown as PerpsProviderPlugin & {
        signActions: ReturnType<typeof vi.fn>
      }
    }

    function useOndoHandlers() {
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
            actions: [hmacStep],
          } satisfies CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const raw = await request.text()
          backendBodies.push(raw)
          executeRequests.push(JSON.parse(raw) as ExecuteActionRequest)
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

    it('submits the signed steps to executeAction and returns the backend results', async () => {
      const ondo = createHmacProvider()
      const { executeRequests } = useOndoHandlers()

      const result = await createOndoClient(ondo).execute({
        provider: 'ondo',
        address: ondoAddress,
        action: ActionType.PLACE_ORDER,
        params: orderParams,
      })

      expect(ondo.signActions.mock.calls[0][0]).toBe(SigningMethod.HMAC)
      expect(executeRequests).toHaveLength(1)
      const [step] = executeRequests[0].actions as HmacSignedActionStep[]
      expect(step.request).toEqual(hmacStep.request)
      expect(step.hmac).toEqual(HMAC_MATERIAL)
      expect(result.results).toEqual([
        {
          action: ActionType.PLACE_ORDER,
          success: true,
          orderId: 'backend-echo',
        },
      ])
    })

    it('carries the HMAC material to the backend for relay', async () => {
      const ondo = createHmacProvider()
      const { executeRequests } = useOndoHandlers()

      await createOndoClient(ondo).execute({
        provider: 'ondo',
        address: ondoAddress,
        action: ActionType.PLACE_ORDER,
        params: orderParams,
      })

      const [step] = executeRequests[0].actions as HmacSignedActionStep[]
      expect(step.hmac.signature).toBe('abc123def456')
      expect(step.hmac.keyId).toBe('key-1')
    })

    it('invokes the plugin onExecuteResults hook with the backend results', async () => {
      const ondo = createHmacProvider()
      const onExecuteResults = vi.fn<
        (address: Address, results: ActionResult[]) => Promise<void>
      >(async () => {})
      ;(ondo as any).onExecuteResults = onExecuteResults
      useOndoHandlers()

      await createOndoClient(ondo).execute({
        provider: 'ondo',
        address: ondoAddress,
        action: ActionType.PLACE_ORDER,
        params: orderParams,
      })

      expect(onExecuteResults).toHaveBeenCalledTimes(1)
      expect(onExecuteResults.mock.calls[0][0]).toBe(ondoAddress)
      expect(onExecuteResults.mock.calls[0][1]).toEqual([
        {
          action: ActionType.PLACE_ORDER,
          success: true,
          orderId: 'backend-echo',
        },
      ])
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
        market: MARKET,
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
  describe('meta actions — provider-independent onboarding and referral codes', () => {
    const BASE_URL = DEFAULT_API_URL
    const account = privateKeyToAccount(`0x${'44'.repeat(32)}` as Hex)
    const ARBITRUM = 42161

    function newClient() {
      return new PerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [createTestAgentProvider({ type: 'hyperliquid' })],
      })
    }

    function walletClient() {
      return createWalletClient({
        account,
        chain: mainnet,
        transport: viemHttp(),
      })
    }

    // /createAction returns `actions` verbatim; /executeAction echoes success.
    // Both request bodies are captured so a test can assert the wire contract.
    function stageMetaAction(actions: ActionStep[]) {
      const createCalls: CreateActionRequest[] = []
      const executeCalls: ExecuteActionRequest[] = []
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          createCalls.push((await request.json()) as CreateActionRequest)
          return HttpResponse.json({ actions } satisfies CreateActionResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, async ({ request }) => {
          const body = (await request.json()) as ExecuteActionRequest
          executeCalls.push(body)
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          } satisfies ExecuteActionResponse)
        })
      )
      return { createCalls, executeCalls }
    }

    function onboardStep(
      termsVersion: string,
      referralCode: string,
      chainId = 1
    ): ActionStep {
      return {
        action: ActionType.META_ONBOARD,
        typedData: {
          domain: { name: 'LIFI Perps', version: '1', chainId },
          types: { Onboard: [...onboardTypeFields] },
          primaryType: 'Onboard',
          message: {
            action: 'Accept LI.FI Perps Terms of Service v3',
            account: account.address,
            termsVersion,
            referralCode,
            nonce: '1',
            deadline: 1_800_000_000_000,
          },
        },
      }
    }

    function createCodeStep(code: string): ActionStep {
      return {
        action: ActionType.META_CREATE_REFERRAL_CODE,
        typedData: {
          domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
          types: { CreateReferralCode: [...createReferralCodeTypeFields] },
          primaryType: 'CreateReferralCode',
          message: {
            action: `Create LI.FI Perps referral code ${code}`,
            account: account.address,
            code,
            nonce: '1',
            deadline: 1_800_000_000_000,
          },
        },
      }
    }

    it('submits a Terms-only onboarding step', async () => {
      const { createCalls, executeCalls } = stageMetaAction([
        onboardStep('v3', ''),
      ])
      const client = newClient()
      client.setUserWallet(walletClient())

      const response = await client.submitOnboarding({
        address: account.address,
        termsVersion: 'v3',
      })

      expect(createCalls[0].provider).toBe(META_PROVIDER)
      expect(createCalls[0].action).toBe(ActionType.META_ONBOARD)
      expect(createCalls[0].params).toEqual({ termsVersion: 'v3' })
      expect(executeCalls).toHaveLength(1)
      expect(executeCalls[0].actions).toHaveLength(1)
      const signed = executeCalls[0].actions[0] as Eip712SignedActionStep
      expect(signed.typedData.message).toMatchObject({
        termsVersion: 'v3',
        referralCode: '',
      })
      expect(signed.signature).toMatch(/^0x[0-9a-f]{130}$/)
      expect(response.results).toEqual([
        { action: ActionType.META_ONBOARD, success: true },
      ])
    })

    it('submits a referral-only onboarding step for an address that already accepted', async () => {
      const { createCalls, executeCalls } = stageMetaAction([
        onboardStep('', 'ABC123'),
      ])
      const client = newClient()
      client.setUserWallet(walletClient())

      await client.submitOnboarding({
        address: account.address,
        referralCode: 'abc123',
      })

      expect(createCalls[0].params).toEqual({ referralCode: 'abc123' })
      const signed = executeCalls[0].actions[0] as Eip712SignedActionStep
      expect(signed.typedData.message).toMatchObject({
        termsVersion: '',
        referralCode: 'ABC123',
      })
    })

    it('submits one combined onboarding step carrying terms and a code', async () => {
      const { createCalls, executeCalls } = stageMetaAction([
        onboardStep('v3', 'ABC123'),
      ])
      const client = newClient()
      client.setUserWallet(walletClient())

      await client.submitOnboarding({
        address: account.address,
        termsVersion: 'v3',
        referralCode: 'ABC123',
      })

      expect(createCalls[0].params).toEqual({
        termsVersion: 'v3',
        referralCode: 'ABC123',
      })
      expect(executeCalls).toHaveLength(1)
      const signed = executeCalls[0].actions[0] as Eip712SignedActionStep
      expect(signed.typedData.primaryType).toBe('Onboard')
      expect(signed.typedData.message).toMatchObject({
        termsVersion: 'v3',
        referralCode: 'ABC123',
      })
    })

    it('submits no step and resolves empty when the backend requires no consent', async () => {
      const { executeCalls } = stageMetaAction([])
      const client = newClient()
      client.setUserWallet(walletClient())

      const response = await client.submitOnboarding({
        address: account.address,
        termsVersion: 'v3',
      })

      expect(response).toEqual({ results: [] })
      expect(executeCalls).toEqual([])
    })

    it('needs no wallet when the backend returns no step', async () => {
      stageMetaAction([])
      const client = newClient()

      await expect(
        client.submitOnboarding({
          address: account.address,
          termsVersion: 'v3',
        })
      ).resolves.toEqual({ results: [] })
    })

    it('submits a referral-code creation step separately from onboarding', async () => {
      const { createCalls, executeCalls } = stageMetaAction([
        createCodeStep('ABC123'),
      ])
      const client = newClient()
      client.setUserWallet(walletClient())

      const response = await client.createReferralCode({
        address: account.address,
        code: 'ABC123',
      })

      expect(createCalls[0].provider).toBe(META_PROVIDER)
      expect(createCalls[0].action).toBe(ActionType.META_CREATE_REFERRAL_CODE)
      expect(createCalls[0].params).toEqual({ code: 'ABC123' })
      const signed = executeCalls[0].actions[0] as Eip712SignedActionStep
      expect(signed.typedData.primaryType).toBe('CreateReferralCode')
      expect(signed.typedData.message).toMatchObject({ code: 'ABC123' })
      expect(response.results).toEqual([
        { action: ActionType.META_CREATE_REFERRAL_CODE, success: true },
      ])
    })

    it('omits the code so the backend generates one', async () => {
      const { createCalls, executeCalls } = stageMetaAction([
        createCodeStep('AB12CD'),
      ])
      const client = newClient()
      client.setUserWallet(walletClient())

      await client.createReferralCode({ address: account.address })

      expect(createCalls[0].params).toEqual({})
      expect(executeCalls).toHaveLength(1)
      const signed = executeCalls[0].actions[0] as Eip712SignedActionStep
      expect(signed.typedData.message).toMatchObject({ code: 'AB12CD' })
    })

    it('propagates a typed PerpsError when the backend rejects an invalid code', async () => {
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json(
            {
              code: PerpsErrorCode.ValidationError,
              message: 'referral code is not valid',
              tool: 'lifi',
            },
            { status: 400 }
          )
        )
      )
      const client = newClient()
      client.setUserWallet(walletClient())

      const error = await client
        .submitOnboarding({
          address: account.address,
          termsVersion: 'v3',
          referralCode: 'nope!',
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PerpsError)
      expect(error.code).toBe(PerpsErrorCode.ValidationError)
      expect(error.message).toBe('referral code is not valid')
    })

    it('propagates a typed PerpsError raised by /executeAction', async () => {
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json({
            actions: [onboardStep('v3', '')],
          } satisfies CreateActionResponse)
        ),
        http.post(`${BASE_URL}/executeAction`, () =>
          HttpResponse.json(
            {
              code: PerpsErrorCode.NonceAlreadyUsed,
              message: 'nonce already used',
              tool: 'lifi',
            },
            { status: 400 }
          )
        )
      )
      const client = newClient()
      client.setUserWallet(walletClient())

      const error = await client
        .submitOnboarding({ address: account.address, termsVersion: 'v3' })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PerpsError)
      expect(error.code).toBe(PerpsErrorCode.NonceAlreadyUsed)
    })

    it('throws a typed PerpsError when the submitted step reports a failed result', async () => {
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json({
            actions: [onboardStep('v3', '')],
          } satisfies CreateActionResponse)
        ),
        http.post(`${BASE_URL}/executeAction`, () =>
          HttpResponse.json({
            results: [
              {
                action: ActionType.META_ONBOARD,
                success: false,
                error: 'nonce already used',
                errorCode: PerpsErrorCode.NonceAlreadyUsed,
              },
            ],
          } satisfies ExecuteActionResponse)
        )
      )
      const client = newClient()
      client.setUserWallet(walletClient())

      const error = await client
        .submitOnboarding({ address: account.address, termsVersion: 'v3' })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PerpsError)
      expect(error.code).toBe(PerpsErrorCode.NonceAlreadyUsed)
      expect(error.message).toBe('nonce already used')
    })

    it('falls back to ExchangeRejected when a failed result carries no errorCode', async () => {
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json({
            actions: [onboardStep('v3', '')],
          } satisfies CreateActionResponse)
        ),
        http.post(`${BASE_URL}/executeAction`, () =>
          HttpResponse.json({
            results: [
              {
                action: ActionType.META_ONBOARD,
                success: false,
                error: 'rejected',
              },
            ],
          } satisfies ExecuteActionResponse)
        )
      )
      const client = newClient()
      client.setUserWallet(walletClient())

      const error = await client
        .submitOnboarding({ address: account.address, termsVersion: 'v3' })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PerpsError)
      expect(error.code).toBe(PerpsErrorCode.ExchangeRejected)
      expect(error.message).toBe('rejected')
    })

    it('submits executeAction exactly once on a 503 — outcome-unknown writes must not retry', async () => {
      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json({
            actions: [onboardStep('v3', '')],
          } satisfies CreateActionResponse)
        ),
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          return HttpResponse.json(
            { code: PerpsErrorCode.ServerError, message: 'upstream 503' },
            { status: 503 }
          )
        })
      )
      const client = newClient()
      client.setUserWallet(walletClient())

      await expect(
        client.submitOnboarding({
          address: account.address,
          termsVersion: 'v3',
        })
      ).rejects.toBeInstanceOf(PerpsError)

      expect(executeCallCount).toBe(1)
    })

    it('submits executeAction exactly once on a dropped connection (no retry-network)', async () => {
      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, () =>
          HttpResponse.json({
            actions: [onboardStep('v3', '')],
          } satisfies CreateActionResponse)
        ),
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          return HttpResponse.error()
        })
      )
      const client = newClient()
      client.setUserWallet(walletClient())

      await expect(
        client.submitOnboarding({
          address: account.address,
          termsVersion: 'v3',
        })
      ).rejects.toBeInstanceOf(PerpsError)

      expect(executeCallCount).toBe(1)
    })

    it('throws an SDKError when a step must be signed and no wallet is configured', async () => {
      stageMetaAction([onboardStep('v3', '')])
      const client = newClient()

      const error = await client
        .submitOnboarding({ address: account.address, termsVersion: 'v3' })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PerpsError)
      expect(error.code).toBe(PerpsErrorCode.SDKError)
      expect(error.message).toMatch(/No user wallet configured/)
    })

    it('throws an SDKError when the backend returns more than one step', async () => {
      stageMetaAction([onboardStep('v3', ''), onboardStep('v3', 'ABC123')])
      const client = newClient()
      client.setUserWallet(walletClient())

      const error = await client
        .submitOnboarding({ address: account.address, termsVersion: 'v3' })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PerpsError)
      expect(error.code).toBe(PerpsErrorCode.SDKError)
      expect(error.message).toMatch(/returned 2 steps/)
    })

    it('throws an SDKError when the step is not EIP-712 typed data', async () => {
      stageMetaAction([
        {
          action: ActionType.META_ONBOARD,
          wasmSignParams: {},
        },
      ])
      const client = newClient()
      client.setUserWallet(walletClient())

      const error = await client
        .submitOnboarding({ address: account.address, termsVersion: 'v3' })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PerpsError)
      expect(error.code).toBe(PerpsErrorCode.SDKError)
      expect(error.message).toMatch(/without typedData/)
    })

    // Wallet whose only answered RPC is eth_chainId, so viem's real
    // `getChainId` runs against the mock inside `switchSigningChain`.
    function walletOnChain(chainId: number) {
      const request = (async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') {
          return `0x${chainId.toString(16)}`
        }
        throw new Error(`unexpected RPC: ${method}`)
      }) as EIP1193RequestFn
      return createWalletClient({ account, transport: custom({ request }) })
    }

    it('switches the wallet to the chain in the step domain before signing', async () => {
      stageMetaAction([onboardStep('v3', '', ARBITRUM)])
      const hook = vi.fn(async () => walletOnChain(ARBITRUM))
      const client = newClient()
      client.setUserWallet(walletOnChain(1))
      client.setSwitchChain(hook)

      await client.submitOnboarding({
        address: account.address,
        termsVersion: 'v3',
      })

      expect(hook).toHaveBeenCalledOnce()
      expect(hook).toHaveBeenCalledWith(ARBITRUM)
    })

    it('still signs and submits a META_ACCEPT_TERMS action through the meta pipeline', async () => {
      const { createCalls, executeCalls } = stageMetaAction([
        {
          action: ActionType.META_ACCEPT_TERMS,
          typedData: {
            domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
            types: { AcceptTerms: [...acceptTermsTypeFields] },
            primaryType: 'AcceptTerms',
            message: {
              action: 'Accept LI.FI Perps Terms of Service v3',
              acceptor: account.address,
              termsVersion: 'v3',
              timestamp: 1_735_689_600_000,
            },
          },
        },
      ])
      const client = newClient()
      client.setUserWallet(walletClient())

      const response = await client.executeMetaAction({
        address: account.address,
        action: ActionType.META_ACCEPT_TERMS,
        params: { termsVersion: 'v3' },
      })

      expect(createCalls[0].provider).toBe(META_PROVIDER)
      expect(createCalls[0].action).toBe(ActionType.META_ACCEPT_TERMS)
      const signed = executeCalls[0].actions[0] as Eip712SignedActionStep
      expect(signed.typedData.primaryType).toBe('AcceptTerms')
      expect(signed.typedData.types.AcceptTerms).toEqual(acceptTermsTypeFields)
      expect(response.results).toEqual([
        { action: ActionType.META_ACCEPT_TERMS, success: true },
      ])
    })
  })
})
