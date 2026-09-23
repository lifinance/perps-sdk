import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { ondoAvailableToTrade } from './availableToTrade.js'

describe('ondoAvailableToTrade', () => {
  it('maps the bid side to buy and the ask side to sell', () => {
    expect(
      ondoAvailableToTrade(
        { maxBidBaseSize: '43.96', maxAskBaseSize: '10.99' },
        '1',
        '308.019994'
      )
    ).toEqual({ buy: '13540.55893624', sell: '3385.13973406' })
  })

  it('divides the notional by the market leverage', () => {
    expect(
      ondoAvailableToTrade(
        { maxBidBaseSize: '10', maxAskBaseSize: '4' },
        '5',
        '202.05'
      )
    ).toEqual({ buy: '404.1', sell: '161.64' })
  })

  it('returns plain decimal strings for very small and very large sizes', () => {
    expect(
      ondoAvailableToTrade(
        {
          maxBidBaseSize: '0.0000001',
          maxAskBaseSize: '100000000000000000000000',
        },
        '10',
        '1'
      )
    ).toEqual({ buy: '0.00000001', sell: '10000000000000000000000' })
  })

  it('keeps a zero size as "0"', () => {
    expect(
      ondoAvailableToTrade(
        { maxBidBaseSize: '0', maxAskBaseSize: '0' },
        '10',
        '308.019994'
      )
    ).toEqual({ buy: '0', sell: '0' })
  })

  it('rejects a size that is not a decimal', () => {
    expect(() =>
      ondoAvailableToTrade(
        { maxBidBaseSize: 'n/a', maxAskBaseSize: '1' },
        '10',
        '308.019994'
      )
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.SDKError,
        message:
          "Ondo field `maxOrderSize.maxBidBaseSize` is not a valid decimal: 'n/a'",
      })
    )
  })
})
