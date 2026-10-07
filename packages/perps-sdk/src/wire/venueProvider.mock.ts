import type { BaseMarket, DecimalString, Market } from '@lifi/perps-types'
import Big from 'big.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProviderPlugin, PerpsSDKClient } from '../types/provider.js'

export const VENUE_PROVIDER_ID = 'venue'

const asset = (id: string) => ({
  providerId: VENUE_PROVIDER_ID,
  id,
  displaySymbol: id,
  logoURI: '',
})

/** A market on the stub venue; override the grid fields a case needs. */
export const venueMarket = (overrides: Partial<BaseMarket> = {}): Market => ({
  providerId: VENUE_PROVIDER_ID,
  id: 'BTC',
  categoryId: VENUE_PROVIDER_ID,
  baseAsset: asset('BTC'),
  quoteAsset: asset('USDC'),
  szDecimals: 2,
  priceDecimals: 2,
  ...overrides,
})

// At DP 0, `div` truncates the exact quotient once, straight to a lot count.
const LotBig = Big()
LotBig.DP = 0
LotBig.RM = Big.roundDown

const lotGrid = (market: Market): Big =>
  market.sizeIncrement !== undefined
    ? new Big(market.sizeIncrement)
    : new Big(`1e-${market.szDecimals}`)

/** The lot rule every provider implements: truncate toward zero. */
export const venueSnapSize = (
  market: Market,
  size: DecimalString
): DecimalString => {
  const increment = lotGrid(market)
  const snapped = new LotBig(size).div(increment).times(increment)
  return snapped.eq(0) ? '0' : snapped.toFixed()
}

/** The tick rule every provider implements: round half-up. */
export const venueSnapPrice = (
  market: Market,
  price: DecimalString
): DecimalString => {
  const rounded = new Big(price).round(
    market.priceDecimals ?? 2,
    Big.roundHalfUp
  )
  return rounded.eq(0) ? '0' : rounded.toFixed()
}

/**
 * A plugin whose only live methods are the two snap rules; every other member
 * throws, so a test that reaches one fails loudly instead of reading a stub.
 */
export const venueProviderPlugin = (
  overrides: Partial<
    Pick<PerpsProviderPlugin, 'snapOrderSize' | 'snapOrderPrice'>
  > = {}
): PerpsProviderPlugin => {
  const unimplemented = async (): Promise<never> => {
    throw new Error('venueProviderPlugin: method not implemented')
  }
  return {
    type: VENUE_PROVIDER_ID,
    bind: () => {},
    getAccount: unimplemented,
    accountExists: unimplemented,
    getPositions: unimplemented,
    getOrders: unimplemented,
    getOrder: unimplemented,
    getFills: unimplemented,
    getActivity: unimplemented,
    getQuote: unimplemented,
    getAccountSummary: () => {
      throw new Error('venueProviderPlugin: method not implemented')
    },
    snapOrderSize: venueSnapSize,
    snapOrderPrice: venueSnapPrice,
    estimateLiquidationPrice: () => {
      throw new Error('venueProviderPlugin: method not implemented')
    },
    positionRemovableMargin: () => undefined,
    getMarketSettings: unimplemented,
    projectConfig: () => [],
    ...overrides,
  }
}

export const venueClient = (
  providers: PerpsProviderPlugin[] = [venueProviderPlugin()]
): PerpsSDKClient =>
  createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers,
  })
