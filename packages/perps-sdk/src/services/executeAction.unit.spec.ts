import { ActionType } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockSubmitOrderResponse, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { executeAction } from './executeAction.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const SIGNED_STEP = {
  action: ActionType.PLACE_ORDER,
  signature: `0x${'ab'.repeat(65)}`,
} as never

describe('executeAction', () => {
  it('POSTs the signed actions payload and returns the execute response', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })
    let method: string | undefined
    let body: unknown

    server.use(
      http.post(`${DEFAULT_API_URL}/executeAction`, async ({ request }) => {
        method = request.method
        body = await request.json()
        return HttpResponse.json(mockSubmitOrderResponse)
      })
    )

    const result = await executeAction(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      action: ActionType.PLACE_ORDER,
      actions: [SIGNED_STEP],
    })

    expect(method).toBe('POST')
    expect(body).toEqual({
      provider: 'hyperliquid',
      address: ADDRESS,
      action: ActionType.PLACE_ORDER,
      actions: [SIGNED_STEP],
    })
    expect(result).toEqual(mockSubmitOrderResponse)
  })

  it('does not retry on a 5xx — the signed bytes may already have landed', async () => {
    // Client-level policy WOULD retry server errors; the call-site `retry: false`
    // must win, so the money-moving write is attempted exactly once.
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    })

    let attempts = 0
    server.use(
      http.post(`${DEFAULT_API_URL}/executeAction`, () => {
        attempts += 1
        return HttpResponse.json(
          { code: 1011, message: 'gateway error', tool: 'lifi' },
          { status: 502 }
        )
      })
    )

    await expect(
      executeAction(client, {
        provider: 'hyperliquid',
        address: ADDRESS,
        action: ActionType.PLACE_ORDER,
        actions: [SIGNED_STEP],
      })
    ).rejects.toThrow('gateway error')

    expect(attempts).toBe(1)
  })

  it('includes signerAddress in the body when provided', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })
    const SIGNER = '0x000000000000000000000000000000000000dEaD' as const
    let body: { signerAddress?: string } = {}

    server.use(
      http.post(`${DEFAULT_API_URL}/executeAction`, async ({ request }) => {
        body = (await request.json()) as { signerAddress?: string }
        return HttpResponse.json(mockSubmitOrderResponse)
      })
    )

    await executeAction(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      signerAddress: SIGNER,
      action: ActionType.PLACE_ORDER,
      actions: [SIGNED_STEP],
    })

    expect(body.signerAddress).toBe(SIGNER)
  })
})
