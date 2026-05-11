import type {
  CreateActionRequest,
  CreateActionResponse,
  ExecuteActionRequest,
  ExecuteActionResponse,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  mockCreateOrderResponse,
  mockSubmitOrderResponse,
  server,
} from '../../test/handlers.js'
import { createMemoryStorage } from '../agent/storage.js'
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
  // ACCOUNT_MODE / ACCOUNT_TYPE dispatch (ORD-265)
  // ---------------------------------------------------------------------------

  describe('executePrerequisites — auto-upgrade ACCOUNT_MODE after APPROVE_AGENT', () => {
    const BASE_URL = DEFAULT_API_URL

    /**
     * MSW handler factory: respond to `/createAction` with an action step
     * matching the requested `action` type, and to `/executeAction` with a
     * configurable result. Tracks call counts per action type so tests can
     * assert the auto-upgrade chain fires exactly once.
     */
    function setupActionHandlers(opts: {
      executeResult?: (req: ExecuteActionRequest) => ExecuteActionResponse
      createActions?: Partial<Record<ActionType, CreateActionResponse>>
    }) {
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

    it('chains agent-signed ACCOUNT_MODE with mode=unifiedAccount after APPROVE_AGENT succeeds', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      let observedAccountModeRequest: CreateActionRequest | undefined
      const counts = setupActionHandlers({
        executeResult: (req) => ({
          results: [{ action: req.action, success: true }],
        }),
      })
      // Capture the createAction request for ACCOUNT_MODE so we can assert
      // the SDK supplied `mode: 'unifiedAccount'`.
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

      const result = await client.executePrerequisites({
        provider,
        address: userAddress,
        required: {
          userPrerequisites: [
            {
              action: ActionType.APPROVE_AGENT,
              typedData: {
                domain: { name: 'HL', chainId: 1 },
                types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
                primaryType: 'ApproveAgent',
                message: { agent: '0xabcd' },
              },
            },
          ],
          agentPrerequisites: [],
          isReady: false,
        },
        userSignedActions: [
          {
            action: ActionType.APPROVE_AGENT,
            typedData: {
              domain: { name: 'HL', chainId: 1 },
              types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
              primaryType: 'ApproveAgent',
              message: { agent: '0xabcd' },
            },
            signature: '0xsig',
          },
        ],
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
      // Auto-upgrade fired exactly once on top of the user-signed APPROVE_AGENT.
      expect(counts.execute.get(ActionType.ACCOUNT_MODE)).toBe(1)
      expect(counts.execute.get(ActionType.APPROVE_AGENT)).toBe(1)
      void counts
    })

    it('records failure but does not abort onboarding when ACCOUNT_MODE auto-upgrade fails (surfaces user-wallet fallback)', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      // First /createAction call for ACCOUNT_MODE (agent path) returns a step;
      // executeAction then fails for ACCOUNT_MODE; second /createAction call
      // (the user-fallback) returns a step the SDK surfaces back to the caller.
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
          if (body.action === ActionType.ACCOUNT_MODE) {
            return HttpResponse.json({
              results: [
                {
                  action: ActionType.ACCOUNT_MODE,
                  success: false,
                  error:
                    'cannot upgrade dexAbstraction without a user signature',
                },
              ],
            })
          }
          return HttpResponse.json({
            results: [{ action: body.action, success: true }],
          })
        })
      )

      const result = await client.executePrerequisites({
        provider,
        address: userAddress,
        required: {
          userPrerequisites: [
            {
              action: ActionType.APPROVE_AGENT,
              typedData: {
                domain: { name: 'HL', chainId: 1 },
                types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
                primaryType: 'ApproveAgent',
                message: { agent: '0xabcd' },
              },
            },
          ],
          agentPrerequisites: [],
          isReady: false,
        },
        userSignedActions: [
          {
            action: ActionType.APPROVE_AGENT,
            typedData: {
              domain: { name: 'HL', chainId: 1 },
              types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
              primaryType: 'ApproveAgent',
              message: { agent: '0xabcd' },
            },
            signature: '0xsig',
          },
        ],
      })

      // Onboarding result: user prereq succeeded, agent ACCOUNT_MODE recorded
      // as failed, and a user-wallet fallback step is surfaced.
      expect(result.userResults.results[0].success).toBe(true)
      expect(result.agentResults?.results[0]).toMatchObject({
        action: ActionType.ACCOUNT_MODE,
        success: false,
      })
      expect(result.fallbackUserPrerequisites).toHaveLength(1)
      expect(result.fallbackUserPrerequisites?.[0].action).toBe(
        ActionType.ACCOUNT_MODE
      )
      // Two createAction calls for ACCOUNT_MODE: first agent attempt, then
      // the user fallback build.
      expect(accountModeCreateCount).toBe(2)
    })

    it('treats backend per-mode early-exit (zero actions) as an idempotent no-op', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      let accountModeExecuteCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, async ({ request }) => {
          const body = (await request.json()) as CreateActionRequest
          if (body.action === ActionType.ACCOUNT_MODE) {
            // Account already in unifiedAccount → backend returns no actions.
            return HttpResponse.json({ actions: [] })
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

      const result = await client.executePrerequisites({
        provider,
        address: userAddress,
        required: {
          userPrerequisites: [
            {
              action: ActionType.APPROVE_AGENT,
              typedData: {
                domain: { name: 'HL', chainId: 1 },
                types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
                primaryType: 'ApproveAgent',
                message: { agent: '0xabcd' },
              },
            },
          ],
          agentPrerequisites: [],
          isReady: false,
        },
        userSignedActions: [
          {
            action: ActionType.APPROVE_AGENT,
            typedData: {
              domain: { name: 'HL', chainId: 1 },
              types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
              primaryType: 'ApproveAgent',
              message: { agent: '0xabcd' },
            },
            signature: '0xsig',
          },
        ],
      })

      expect(result.userResults.results[0].success).toBe(true)
      // No execute call for ACCOUNT_MODE — the empty-actions response is
      // treated as a no-op rather than dispatched.
      expect(accountModeExecuteCount).toBe(0)
      expect(result.agentResults?.results).toEqual([])
      expect(result.fallbackUserPrerequisites).toBeUndefined()
    })

    it('skips the auto-upgrade chain when APPROVE_AGENT was not in the user prereqs', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

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

      const result = await client.executePrerequisites({
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
})
