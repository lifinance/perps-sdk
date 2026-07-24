import { DISABLED_RETRY } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { infoRequest } from './infoClient.js'

describe('infoRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs the body verbatim to /info on the configured base URL', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )

    await infoRequest(
      DEFAULT_HYPERLIQUID_API_URL,
      { type: 'allMids' },
      { policy: DISABLED_RETRY }
    )

    expect(spy).toHaveBeenCalledWith(
      `${DEFAULT_HYPERLIQUID_API_URL}/info`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ type: 'allMids' }),
      })
    )
  })

  it('lowercases valid Ethereum addresses throughout the request body', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )
    const wallet = '0x3A18b8e1e653DF2a60e312e342084604F5E3e876'

    const requestBody = {
      type: 'userFees',
      user: wallet,
      nested: { address: wallet, symbol: 'ETH', arbitrary: '0xNotAnAddress' },
    }

    await infoRequest(DEFAULT_HYPERLIQUID_API_URL, requestBody, {
      policy: DISABLED_RETRY,
    })

    expect(requestBody).toEqual({
      type: 'userFees',
      user: wallet,
      nested: { address: wallet, symbol: 'ETH', arbitrary: '0xNotAnAddress' },
    })
    expect(spy.mock.calls[0][1]?.body).toBe(
      JSON.stringify({
        type: 'userFees',
        user: wallet.toLowerCase(),
        nested: {
          address: wallet.toLowerCase(),
          symbol: 'ETH',
          arbitrary: '0xNotAnAddress',
        },
      })
    )
  })

  it('raises a tagged ThirdPartyError on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 })
    )

    await expect(
      infoRequest(
        DEFAULT_HYPERLIQUID_API_URL,
        { type: 'allMids' },
        { policy: DISABLED_RETRY }
      )
    ).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      tool: 'hyperliquid',
    })
  })

  it('wraps network errors as a ServerError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('refused'))

    await expect(
      infoRequest(
        DEFAULT_HYPERLIQUID_API_URL,
        { type: 'allMids' },
        { policy: DISABLED_RETRY }
      )
    ).rejects.toMatchObject({
      code: PerpsErrorCode.ServerError,
      tool: 'hyperliquid',
    })
  })

  it('forwards an AbortSignal to fetch', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

    const controller = new AbortController()
    await infoRequest(
      DEFAULT_HYPERLIQUID_API_URL,
      { type: 'allMids' },
      { signal: controller.signal, policy: DISABLED_RETRY }
    )

    expect(spy.mock.calls[0][1]?.signal).toBe(controller.signal)
  })
})
