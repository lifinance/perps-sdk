import {
  cancelOrder,
  createOrder,
  createPerpsClient,
  OrderSide,
  OrderType,
  submitOrder,
  TimeInForce,
} from '@lifi/perps-sdk'

async function run() {
  const client = createPerpsClient({ integrator: 'my-app' })

  // Create order payloads
  const { actions } = await createOrder(client, {
    dex: 'hyperliquid',
    address: '0x1234...',
    symbol: 'BTC',
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    size: '0.1',
    price: '94000.00',
    leverage: 10,
    timeInForce: TimeInForce.GTC,
  })

  // Sign each action with the user's wallet
  const signedActions = await Promise.all(
    actions.map(async (a) => ({
      action: a.action,
      typedData: a.typedData,
      signature: await walletClient.signTypedData(a.typedData),
    }))
  )

  // Submit the signed order
  const result = await submitOrder(client, {
    dex: 'hyperliquid',
    address: '0x1234...',
    actions: signedActions,
  })
  console.log('Order result:', result)

  // Cancel orders
  const { actions: cancelActions } = await cancelOrder(client, {
    dex: 'hyperliquid',
    address: '0x1234...',
    ids: ['order1', 'order2'],
  })

  const signedCancelActions = await Promise.all(
    cancelActions.map(async (a) => ({
      action: a.action,
      typedData: a.typedData,
      signature: await walletClient.signTypedData(a.typedData),
    }))
  )

  const cancelResult = await submitOrder(client, {
    dex: 'hyperliquid',
    address: '0x1234...',
    actions: signedCancelActions,
  })
  console.log('Cancel result:', cancelResult)
}

// Placeholder — replace with your wallet client (e.g. viem WalletClient)
declare const walletClient: {
  signTypedData: (data: unknown) => Promise<string>
}

run()
