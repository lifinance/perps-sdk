import {
  AgentError,
  HTTPError,
  OrderSide,
  OrderType,
  PerpsClient,
  PerpsError,
  PerpsErrorCode,
  ServerError,
  ValidationError,
} from '@lifi/perps-sdk'

async function run() {
  const perps = new PerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
  })

  try {
    await perps.placeOrder({
      address: '0x1234...',
      dex: 'hyperliquid',
      symbol: 'BTC',
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      size: '0.1',
      price: '95000.00',
    })
  } catch (error) {
    if (error instanceof HTTPError) {
      // HTTP request failures (4xx/5xx)
      console.error(`HTTP ${error.status}: ${error.message}`)
    } else if (error instanceof AgentError) {
      // Agent not found or unauthorized
      console.error('Agent issue:', error.message)
    } else if (error instanceof ValidationError) {
      // Invalid parameters or missing required fields
      console.error('Validation:', error.message)
    } else if (error instanceof ServerError) {
      // Network failures or timeouts
      console.error('Server:', error.message)
    } else if (error instanceof PerpsError) {
      // Base error class for all perps errors
      switch (error.code) {
        case PerpsErrorCode.InsufficientMargin:
          console.error('Not enough margin')
          break
        case PerpsErrorCode.AgentUnauthorized:
          console.error('Agent not authorized - need to approve first')
          break
        default:
          console.error(error.message)
      }
    }
  }
}

run()
