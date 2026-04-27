import { describe, expect, it } from 'vitest'
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

  it('rejects unsupported channels with a clear message', async () => {
    const provider = makeProvider()
    await expect(
      provider.subscribe(
        {
          channel: 'candle',
          dex: 'lighter',
          assetId: 'BTC',
          interval: '1h',
        },
        () => {}
      )
    ).rejects.toThrow(/does not support channel: candle/)
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
