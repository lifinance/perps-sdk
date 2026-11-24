import {
  addDecimalString,
  divideDecimalString,
  getMarketRegistry,
  isDecimalStringGreaterThan,
  PerpsError,
  type SDKRequestOptions,
  subtractDecimalString,
} from '@lifi/perps-sdk'
import {
  type DecimalString,
  type MarginHealth,
  PerpsErrorCode,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { MAIN_DEX_NAME, MAIN_MARKET_ID, PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import {
  HlAbstractionMode,
  type HlClearinghouseState,
  type HlSpotClearinghouseState,
} from '../types/index.js'
import { perpsDexNames } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

// Cross positions liquidate when account value falls below maintenance margin
// (hyperliquid-docs/trading/margining).
const LIQUIDATION_THRESHOLD = '1'

/**
 * Parameters for {@link getMarginHealth}.
 *
 * @public
 */
export interface GetMarginHealthParams {
  address: Address
  /** The dex `categoryId` in Standard mode. Defaults to the main dex. */
  categoryId?: string
}

/** Exposure without positive equity has no ratio. */
const calculateRatio = (
  maintenanceMargin: DecimalString,
  equity: DecimalString
): DecimalString | undefined => {
  if (!isDecimalStringGreaterThan(maintenanceMargin, '0')) {
    return '0'
  }
  return isDecimalStringGreaterThan(equity, '0')
    ? divideDecimalString(maintenanceMargin, equity)
    : undefined
}

/**
 * `computeUnifiedAccountRatio` from hyperliquid-docs
 * trading/account-abstraction-modes#unified-account-ratio: the largest ratio
 * over the collateral tokens.
 */
const calculateUnifiedRatio = (
  states: readonly HlClearinghouseState[],
  dexTokens: readonly string[],
  spotState: HlSpotClearinghouseState
): DecimalString | undefined => {
  const crossMarginByToken = new Map<string, DecimalString>()
  const isolatedMarginByToken = new Map<string, DecimalString>()
  states.forEach((state, i) => {
    const token = dexTokens[i]
    crossMarginByToken.set(
      token,
      addDecimalString(
        crossMarginByToken.get(token) ?? '0',
        state.crossMaintenanceMarginUsed
      )
    )
    for (const { position } of state.assetPositions) {
      if (position.leverage.type === 'isolated') {
        isolatedMarginByToken.set(
          token,
          addDecimalString(
            isolatedMarginByToken.get(token) ?? '0',
            position.marginUsed
          )
        )
      }
    }
  })

  let largest: DecimalString = '0'
  for (const [token, crossMargin] of crossMarginByToken) {
    const spotTotal =
      spotState.balances.find((b) => String(b.token) === token)?.total ?? '0'
    const ratio = calculateRatio(
      crossMargin,
      subtractDecimalString(spotTotal, isolatedMarginByToken.get(token) ?? '0')
    )
    if (ratio === undefined) {
      return undefined
    }
    if (isDecimalStringGreaterThan(ratio, largest)) {
      largest = ratio
    }
  }
  return largest
}

/**
 * Cross-margin health for the account's abstraction mode. Standard mode reads
 * the cross pool of one dex. Unified mode reads the whole account. Portfolio
 * margin and DEX abstraction resolve `undefined`: the account read carries no
 * input for their venue metric.
 *
 * @throws {PerpsError} On a `categoryId` that is not a perps dex, Hyperliquid
 *   REST error, network, or parsing failures.
 * @public
 */
export const getMarginHealth = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetMarginHealthParams,
  options?: SDKRequestOptions
): Promise<MarginHealth | undefined> => {
  const infoOpts = hlInfoOptions(client, options)
  const [abstraction, markets] = await Promise.all([
    infoRequest<HlAbstractionMode | null>(
      apiUrl,
      { type: 'userAbstraction', user: params.address },
      infoOpts
    ),
    getMarketRegistry(client, PROVIDER_KEY).sync(),
  ])
  const fetchState = (dex: string) =>
    infoRequest<HlClearinghouseState>(
      apiUrl,
      {
        type: 'clearinghouseState',
        user: params.address,
        ...(dex ? { dex } : {}),
      },
      infoOpts
    )

  switch (abstraction) {
    case null:
    case HlAbstractionMode.DEFAULT:
    case HlAbstractionMode.DISABLED: {
      const categoryId = params.categoryId ?? MAIN_MARKET_ID
      const dex = categoryId === MAIN_MARKET_ID ? MAIN_DEX_NAME : categoryId
      if (!perpsDexNames(markets).includes(dex)) {
        const err = new PerpsError(
          PerpsErrorCode.ValidationError,
          `Hyperliquid has no perps dex with categoryId '${categoryId}'.`
        )
        err.tool = PROVIDER_KEY
        throw err
      }
      const state = await fetchState(dex)
      const ratio = calculateRatio(
        state.crossMaintenanceMarginUsed,
        state.crossMarginSummary.accountValue
      )
      return ratio === undefined
        ? undefined
        : { ratio, liquidationThreshold: LIQUIDATION_THRESHOLD }
    }
    case HlAbstractionMode.UNIFIED_ACCOUNT: {
      const tokenByDex = new Map(
        markets.map((m) => [
          m.categoryId === MAIN_MARKET_ID ? MAIN_DEX_NAME : m.categoryId,
          m.quoteAsset.id,
        ])
      )
      const dexNames = perpsDexNames(markets)
      const [states, spotState] = await Promise.all([
        Promise.all(dexNames.map(fetchState)),
        infoRequest<HlSpotClearinghouseState>(
          apiUrl,
          { type: 'spotClearinghouseState', user: params.address },
          infoOpts
        ),
      ])
      const ratio = calculateUnifiedRatio(
        states,
        // Always present: `perpsDexNames` reads the same markets.
        dexNames.map((dex) => tokenByDex.get(dex)!),
        spotState
      )
      return ratio === undefined
        ? undefined
        : { ratio, liquidationThreshold: LIQUIDATION_THRESHOLD }
    }
    default:
      return undefined
  }
}
