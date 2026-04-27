import { describe, expect, it, vi } from 'vitest'
import { LighterWsProvider } from './LighterWsProvider.js'

describe('LighterWsProvider', () => {
  const makeProvider = () =>
    new LighterWsProvider(
      // Non-resolvable URL — we never open the socket in these tests; we just
      // exercise pure routing logic that runs before `rws.send`.
      'ws://127.0.0.1:1',
      'lighter',
      { symbolMap: { BTC: 0, ETH: 1, SOL: 5 } }
    )

  it('accepts candle subscriptions as a no-op (Lighter has no candle WS channel)', async () => {
    const provider = makeProvider()
    const listener = vi.fn()
    const unsubscribe = await provider.subscribe(
      {
        channel: 'candle',
        dex: 'lighter',
        assetId: 'BTC',
        interval: '1h',
      },
      listener
    )
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
    provider.close()
  })

  it('rejects spotBalances which Lighter does not expose', async () => {
    const provider = makeProvider()
    await expect(
      provider.subscribe(
        {
          channel: 'spotBalances',
          dex: 'lighter',
          address: '0x1234567890123456789012345678901234567890',
        },
        () => {}
      )
    ).rejects.toThrow(/does not support channel: spotBalances/)
    provider.close()
  })

  it('rejects orderbook subscription for unknown assets', async () => {
    const provider = makeProvider()
    await expect(
      provider.subscribe(
        { channel: 'orderbook', dex: 'lighter', assetId: 'UNKNOWN_COIN' },
        () => {}
      )
    ).rejects.toThrow(/unknown market/)
    provider.close()
  })
})
