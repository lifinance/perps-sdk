import {
  getMarkets,
  OrderSide,
  OrderType,
  PerpsClient,
  PerpsError,
  PerpsErrorCode,
} from '@lifi/perps-sdk'

async function run() {
  const perps = new PerpsClient({
    apiKey: 'your-api-key',
  })

  try {
    const { markets } = await getMarkets(perps.client, {
      provider: 'hyperliquid',
    })
    const btc = markets.find((m) => m.baseAsset.displaySymbol === 'BTC')
    if (!btc) {
      throw new Error('BTC market not found')
    }

    await perps.placeOrder({
      address: '0x1234...',
      provider: 'hyperliquid',
      market: { marketId: btc.id, categoryId: btc.categoryId },
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      size: '0.1',
      price: '95000.00',
    })
  } catch (error) {
    if (error instanceof PerpsError) {
      switch (error.code) {
        case PerpsErrorCode.InsufficientMargin:
          console.error('Not enough margin for this order')
          break
        case PerpsErrorCode.InsufficientBalance:
          console.error('Insufficient balance — deposit funds first')
          break
        case PerpsErrorCode.AgentUnauthorized:
          console.error('Agent not authorized — run prerequisite flow')
          break
        case PerpsErrorCode.SDKError:
          console.error('SDK error:', error.message)
          break
        case PerpsErrorCode.ExchangeRejected:
          console.error('Exchange rejected the order:', error.message)
          break
        default:
          console.error(`Error ${error.code}: ${error.message}`)
      }
    } else {
      throw error
    }
  }
}

run()
